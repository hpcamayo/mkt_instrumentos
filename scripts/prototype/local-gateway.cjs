#!/usr/bin/env node
// Docker-free stand-in for the Supabase API, for viewing the Store Operations prototype locally.
// It serves the subset of the Supabase HTTP API the Laria app uses:
//   /rest/v1/*      proxied to a local PostgREST
//   /auth/v1/*      password sign-in, refresh, getUser and logout, against auth.users in local Postgres, plus TOTP
//                   factors (enroll, challenge, verify, unenroll) for Admin's two-step check (launch audit A15)
//   /storage/v1/*   upload, download, list, remove and public URLs, on the local disk
// Local development only. It never talks to hosted Supabase; there is no email, OTP or OAuth.
//
// Env: GATEWAY_PORT (54321), POSTGREST_URL (http://127.0.0.1:3001), PGURL, JWT_SECRET, STORAGE_DIR.

const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const PORT = Number(process.env.GATEWAY_PORT || 54321);
const POSTGREST = new URL(process.env.POSTGREST_URL || "http://127.0.0.1:3001");
const PGURL = process.env.PGURL || "postgres://postgres@127.0.0.1:54322/postgres";
const SECRET = process.env.JWT_SECRET || "super-secret-jwt-token-with-at-least-32-characters-long";
const STORAGE_DIR = process.env.STORAGE_DIR || "/tmp/laria-storage";
const TTL = 3600;

let db, ready;

const b64url = (buf) => Buffer.from(buf).toString("base64url");
function sign(payload) {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
function verify(token) {
  const [head, body, sig] = String(token || "").split(".");
  if (!sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  if (sig !== expected) return null;
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  if (claims.exp && claims.exp < Date.now() / 1000) return null;
  return claims;
}
if (process.argv[2] === "keys") {
  const now = Math.floor(Date.now() / 1000), exp = now + 10 * 365 * 86400;
  console.log(`anon=${sign({ iss: "laria-local", role: "anon", iat: now, exp })}`);
  console.log(`service_role=${sign({ iss: "laria-local", role: "service_role", iat: now, exp })}`);
  process.exit(0);
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(buf) {
  let bits = "", out = "";
  for (const byte of buf) bits += byte.toString(2).padStart(8, "0");
  for (let i = 0; i + 5 <= bits.length; i += 5) out += BASE32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}
function fromBase32(text) {
  let bits = "";
  for (const char of text.replace(/=+$/, "")) bits += BASE32.indexOf(char).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totpCode(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac("sha1", fromBase32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1e6).padStart(6, "0");
}
const totpMatches = (secret, code) => [-1, 0, 1].some((drift) => totpCode(secret, Math.floor(Date.now() / 30000) + drift) === String(code));
if (process.argv[2] === "totp") {
  // `node local-gateway.cjs totp <secret>` prints the current code, for scripted checks.
  console.log(totpCode(process.argv[3], Math.floor(Date.now() / 30000)));
  process.exit(0);
}

db = new Client({ connectionString: PGURL });
ready = db.connect();

function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : req.headers.apikey;
}

// TOTP factors as Supabase Auth keeps them, in STORAGE_DIR/mfa-factors.json: { [userId]: [{ id, friendly_name,
// factor_type, status, secret, created_at, updated_at }] }. Codes follow RFC 6238 (SHA-1, 30 s, 6 digits, one step
// of drift either way). The secret never leaves the gateway after enrollment.
const FACTORS_FILE = path.join(STORAGE_DIR, "mfa-factors.json");
const challenges = new Map();
function readFactors() {
  try { return JSON.parse(fs.readFileSync(FACTORS_FILE, "utf8")); } catch { return {}; }
}
function writeFactors(all) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  fs.writeFileSync(FACTORS_FILE, JSON.stringify(all, null, 2));
}
const publicFactor = ({ secret, ...factor }) => factor;
function userJson(u) {
  return {
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
    email_confirmed_at: u.email_confirmed_at, confirmed_at: u.email_confirmed_at, phone: "",
    last_sign_in_at: u.last_sign_in_at, app_metadata: { provider: "email", providers: ["email"], ...(u.raw_app_meta_data || {}) },
    user_metadata: u.raw_user_meta_data || {}, identities: [], created_at: u.created_at, updated_at: u.updated_at,
    is_anonymous: false, factors: (readFactors()[u.id] || []).map(publicFactor),
  };
}
// aal and amr as Supabase Auth sets them: aal1 after the password, aal2 once a factor's code is verified; a refresh
// keeps the session's level.
async function session(u, aal = "aal1", amr = [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }]) {
  const now = Math.floor(Date.now() / 1000);
  const access = sign({
    aud: "authenticated", exp: now + TTL, iat: now, sub: u.id, email: u.email, role: "authenticated",
    app_metadata: { provider: "email", ...(u.raw_app_meta_data || {}) }, user_metadata: u.raw_user_meta_data || {},
    session_id: crypto.randomUUID(), aal, amr,
  });
  const payload = b64url(JSON.stringify({ sub: u.id, n: crypto.randomUUID(), aal, amr }));
  const refresh = payload + "." + crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return { access_token: access, token_type: "bearer", expires_in: TTL, expires_at: now + TTL, refresh_token: refresh, user: userJson(u) };
}
async function findUser(where, args) {
  const { rows } = await db.query(`select * from auth.users where ${where} limit 1`, args);
  return rows[0];
}

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, {
    "content-type": isBuf ? headers["content-type"] || "application/octet-stream" : "application/json",
    "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*",
    ...headers,
  });
  res.end(isBuf ? body : body === undefined ? "" : JSON.stringify(body));
}
const readBody = (req) => new Promise((resolve) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => resolve(Buffer.concat(c))); });
const authErr = (res, msg = "Invalid login credentials", code = "invalid_credentials") =>
  send(res, 400, { code: 400, error_code: code, msg, error: "invalid_grant", error_description: msg });

async function handleAuth(req, res, url) {
  await ready;
  const route = url.pathname.replace(/^\/auth\/v1/, "");
  if (route === "/token") {
    const body = JSON.parse((await readBody(req)).toString() || "{}");
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      const u = await findUser("lower(email) = lower($1) and encrypted_password = extensions.crypt($2, encrypted_password)", [body.email || "", body.password || ""]);
      if (!u) return authErr(res);
      // Like Supabase Auth: the right password on an unconfirmed address (accounts batch, fix-08).
      if (!u.email_confirmed_at) return authErr(res, "Email not confirmed", "email_not_confirmed");
      await db.query("update auth.users set last_sign_in_at = now() where id = $1", [u.id]);
      return send(res, 200, await session(u));
    }
    if (grant === "refresh_token") {
      const [payload, sig] = String(body.refresh_token || "").split(".");
      try {
        if (crypto.createHmac("sha256", SECRET).update(payload).digest("base64url") !== sig) throw new Error();
        const { sub, aal, amr } = JSON.parse(Buffer.from(payload, "base64url").toString());
        const u = await findUser("id = $1", [sub]);
        if (!u) throw new Error();
        return send(res, 200, await session(u, aal, amr));
      } catch { return authErr(res, "Invalid Refresh Token", "refresh_token_not_found"); }
    }
    return authErr(res, "Unsupported grant", "validation_failed");
  }
  if (route === "/user") {
    const claims = verify(bearer(req));
    if (!claims || !claims.sub) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    const u = await findUser("id = $1", [claims.sub]);
    if (!u) return send(res, 403, { code: 403, error_code: "user_not_found", msg: "User not found" });
    if (req.method === "PUT") {
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      if (body.password) await db.query("update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')) where id = $1", [u.id, body.password]);
      if (body.data) await db.query("update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data,'{}'::jsonb) || $2::jsonb where id = $1", [u.id, JSON.stringify(body.data)]);
      return send(res, 200, userJson(await findUser("id = $1", [u.id])));
    }
    return send(res, 200, userJson(u));
  }
  if (route === "/factors" || route.startsWith("/factors/")) return handleFactors(req, res, route);
  if (route === "/logout") return send(res, 204);
  if (route === "/settings") return send(res, 200, { external: { email: true }, disable_signup: true, mailer_autoconfirm: true });
  // OTP, sign-up, recovery and invite need email; the prototype seeds its users instead.
  // Resending the confirmation e-mail: nothing is sent locally (accounts batch, fix-08).
  if (route === "/resend") return send(res, 200, {});
  return send(res, 400, { code: 400, error_code: "not_supported_locally", msg: "Not available in the local prototype gateway" });
}

const mfaErr = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg });
async function handleFactors(req, res, route) {
  const claims = verify(bearer(req));
  if (!claims || !claims.sub) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
  const u = await findUser("id = $1", [claims.sub]);
  if (!u) return send(res, 403, { code: 403, error_code: "user_not_found", msg: "User not found" });
  const all = readFactors();
  const mine = all[u.id] || [];
  const now = new Date().toISOString();
  const [, , factorId, action] = route.split("/");
  const body = req.method === "DELETE" ? {} : JSON.parse((await readBody(req)).toString() || "{}");
  if (!factorId && req.method === "POST") {
    if (body.factor_type !== "totp") return mfaErr(res, 422, "mfa_factor_type_not_supported", "Only TOTP locally");
    // Like Supabase Auth: a second factor can only be added from a session that already passed the first one.
    if (mine.some((factor) => factor.status === "verified") && claims.aal !== "aal2") return mfaErr(res, 422, "insufficient_aal", "AAL2 required to enroll a new factor");
    const friendly = body.friendly_name || "";
    if (friendly && mine.some((factor) => factor.friendly_name === friendly)) return mfaErr(res, 422, "mfa_factor_name_conflict", "A factor with this friendly name already exists");
    const factor = { id: crypto.randomUUID(), friendly_name: friendly, factor_type: "totp", status: "unverified", secret: base32(crypto.randomBytes(20)), created_at: now, updated_at: now };
    all[u.id] = [...mine, factor];
    writeFactors(all);
    const uri = `otpauth://totp/${encodeURIComponent(body.issuer || "Laria")}:${encodeURIComponent(u.email)}?secret=${factor.secret}&issuer=${encodeURIComponent(body.issuer || "Laria")}`;
    // Not a scannable code: the local stand-in shows a placeholder; the secret below is what local checks use.
    const qr = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="#fff"/><rect x="10" y="10" width="40" height="40"/><rect x="110" y="10" width="40" height="40"/><rect x="10" y="110" width="40" height="40"/><text x="80" y="88" font-size="14" text-anchor="middle">QR local</text></svg>`;
    return send(res, 200, { id: factor.id, type: "totp", friendly_name: friendly, totp: { qr_code: qr, secret: factor.secret, uri } });
  }
  const factor = mine.find((item) => item.id === factorId);
  if (!factor) return mfaErr(res, 404, "mfa_factor_not_found", "Factor not found");
  if (req.method === "DELETE") {
    if (factor.status === "verified" && claims.aal !== "aal2") return mfaErr(res, 422, "insufficient_aal", "AAL2 required to unenroll verified factor");
    all[u.id] = mine.filter((item) => item.id !== factorId);
    writeFactors(all);
    return send(res, 200, { id: factorId });
  }
  if (action === "challenge") {
    const id = crypto.randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + 300;
    challenges.set(id, { factorId, userId: u.id, expiresAt });
    return send(res, 200, { id, type: "totp", expires_at: expiresAt });
  }
  if (action === "verify") {
    const challenge = challenges.get(body.challenge_id);
    if (!challenge || challenge.factorId !== factorId || challenge.userId !== u.id) return mfaErr(res, 422, "mfa_challenge_expired", "Challenge not found");
    if (challenge.expiresAt < Date.now() / 1000) return mfaErr(res, 422, "mfa_challenge_expired", "Challenge expired");
    if (!totpMatches(factor.secret, body.code)) return mfaErr(res, 422, "mfa_verification_failed", "Invalid TOTP code entered");
    challenges.delete(body.challenge_id);
    if (factor.status !== "verified") {
      factor.status = "verified";
      factor.updated_at = now;
      writeFactors(all);
    }
    const stamp = Math.floor(Date.now() / 1000);
    return send(res, 200, await session(u, "aal2", [{ method: "totp", timestamp: stamp }, ...(claims.amr || [{ method: "password", timestamp: stamp }])]));
  }
  return mfaErr(res, 404, "not_found", "Unknown factor route");
}

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".csv": "text/csv",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".svg": "image/svg+xml",
  ".webm": "audio/webm", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".wav": "audio/wav" };
function safePath(bucket, name) {
  const p = path.resolve(STORAGE_DIR, bucket, name);
  if (!p.startsWith(path.resolve(STORAGE_DIR, bucket) + path.sep)) throw new Error("bad path");
  return p;
}
// supabase-js sends a File or Blob as multipart/form-data (the file in the part that has a filename) and raw bytes as is.
function fileFromRequest(req, raw) {
  const contentType = req.headers["content-type"] || "application/octet-stream";
  const boundary = /multipart\/form-data;.*boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!boundary) return { body: raw, type: contentType };
  const delimiter = Buffer.from(`--${boundary[1] || boundary[2]}`);
  let start = raw.indexOf(delimiter);
  while (start !== -1) {
    const next = raw.indexOf(delimiter, start + delimiter.length);
    if (next === -1) break;
    const part = raw.subarray(start + delimiter.length + 2, next - 2);
    const split = part.indexOf("\r\n\r\n");
    const headers = part.subarray(0, split).toString();
    if (/filename=/i.test(headers)) {
      const partType = /content-type:\s*([^\r\n]+)/i.exec(headers);
      return { body: part.subarray(split + 4), type: partType ? partType[1].trim() : "application/octet-stream" };
    }
    start = next;
  }
  return { body: raw, type: contentType };
}

async function handleStorage(req, res, url) {
  await ready;
  const parts = decodeURIComponent(url.pathname.replace(/^\/storage\/v1\//, "")).split("/");
  const claims = verify(bearer(req)) || {};
  const owner = claims.sub || null;
  try {
    if (parts[0] === "object" && parts[1] === "list") {
      const bucket = parts[2];
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      const prefix = (body.prefix || "").replace(/\/$/, "");
      const dir = prefix ? safePath(bucket, prefix) : path.resolve(STORAGE_DIR, bucket);
      const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
      return send(res, 200, names.slice(0, body.limit || 100).map((name) => {
        const st = fs.statSync(path.join(dir, name));
        return { name, id: st.isFile() ? crypto.randomUUID() : null, updated_at: st.mtime, created_at: st.ctime,
          metadata: st.isFile() ? { size: st.size, mimetype: MIME[path.extname(name)] || "application/octet-stream" } : null };
      }));
    }
    if (parts[0] === "object" && req.method === "DELETE" && parts.length === 2) {
      const bucket = parts[1];
      const { prefixes = [] } = JSON.parse((await readBody(req)).toString() || "{}");
      for (const name of prefixes) { fs.rmSync(safePath(bucket, name), { force: true }); await db.query("delete from storage.objects where bucket_id=$1 and name=$2", [bucket, name]); }
      return send(res, 200, prefixes.map((name) => ({ name, bucket_id: bucket })));
    }
    const isPublic = parts[1] === "public" || parts[1] === "authenticated" || parts[1] === "sign";
    const bucket = isPublic ? parts[2] : parts[1];
    const name = (isPublic ? parts.slice(3) : parts.slice(2)).join("/");
    const file = safePath(bucket, name);
    if (req.method === "POST" || req.method === "PUT") {
      const { body, type } = fileFromRequest(req, await readBody(req));
      if (req.method === "POST" && fs.existsSync(file) && req.headers["x-upsert"] !== "true") return send(res, 400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
      await db.query(`insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ($1,$2,$3::uuid,$5::text,$4)
        on conflict (bucket_id, name) do update set updated_at = now(), metadata = excluded.metadata`,
        [bucket, name, owner, JSON.stringify({ size: body.length, mimetype: type }), owner]);
      // The row first, so an unknown bucket fails before anything reaches the disk.
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body);
      return send(res, 200, { Key: `${bucket}/${name}`, Id: crypto.randomUUID() });
    }
    if (!fs.existsSync(file)) return send(res, 404, { statusCode: "404", error: "not_found", message: "Object not found" });
    return send(res, 200, fs.readFileSync(file), { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
  } catch (e) {
    return send(res, 400, { statusCode: "400", error: "invalid", message: String(e.message || e) });
  }
}

function proxyRest(req, res, url) {
  const target = url.pathname.replace(/^\/rest\/v1/, "") + url.search;
  const headers = { ...req.headers, host: POSTGREST.host };
  // supabase-js sends the anon key as Bearer when signed out; PostgREST verifies it like any JWT.
  const up = http.request({ hostname: POSTGREST.hostname, port: POSTGREST.port, path: target || "/", method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode, { ...r.headers, "access-control-allow-origin": "*" });
    r.pipe(res);
  });
  up.on("error", (e) => send(res, 502, { message: `PostgREST unreachable: ${e.message}` }));
  req.pipe(up);
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") return send(res, 204);
  const p = url.pathname;
  const run = p.startsWith("/rest/v1") ? proxyRest(req, res, url)
    : p.startsWith("/auth/v1") ? handleAuth(req, res, url)
    : p.startsWith("/storage/v1") ? handleStorage(req, res, url)
    : send(res, 404, { message: "unknown route" });
  Promise.resolve(run).catch((e) => { console.error(e); if (!res.headersSent) send(res, 500, { message: String(e) }); });
}).listen(PORT, "127.0.0.1", () => console.log(`Local gateway on http://127.0.0.1:${PORT}`));

