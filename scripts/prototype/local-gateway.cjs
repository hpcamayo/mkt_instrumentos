#!/usr/bin/env node
// Docker-free stand-in for the Supabase API, for viewing the Store Operations prototype locally.
// It serves the subset of the Supabase HTTP API the Laria app uses:
//   /rest/v1/*      proxied to a local PostgREST
//   /auth/v1/*      password sign-in, refresh, getUser and logout, against auth.users in local Postgres; sessions,
//                   authenticator-app (TOTP) factors and the Admin factor and user calls (feature ideas, accounts batch)
//   /storage/v1/*   upload, download, list, remove and public URLs, on the local disk
// Local development only. It never talks to hosted Supabase; there is no email, e-mail OTP or OAuth.
//
// Env: GATEWAY_PORT (54321), POSTGREST_URL (http://127.0.0.1:3001), PGURL, JWT_SECRET, STORAGE_DIR.

const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const PORT = Number(process.env.GATEWAY_PORT || 54321);
// Like Supabase Auth, sessions name the project address as their issuer (store image checks read it, launch audit A32).
const ISSUER = `${process.env.GATEWAY_PUBLIC_URL || `http://127.0.0.1:${PORT}`}/auth/v1`;
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

db = new Client({ connectionString: PGURL });
// Feature ideas, accounts batch (safe-08, safe-09): the local stand-ins for Supabase Auth's sessions and factors.
ready = db.connect().then(() => db.query(`
  create table if not exists auth.sessions (id uuid primary key, user_id uuid not null, created_at timestamptz default now(),
    updated_at timestamptz default now(), factor_id uuid, aal text, not_after timestamptz, refreshed_at timestamp,
    user_agent text, ip inet, tag text);
  create table if not exists auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null,
    friendly_name text, factor_type text not null default 'totp', status text not null, created_at timestamptz default now(),
    updated_at timestamptz default now());
  alter table auth.mfa_factors add column if not exists secret text;
  alter table auth.users add column if not exists email_change text;
`));

function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : req.headers.apikey;
}

function userJson(u, factors = []) {
  return {
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email, new_email: u.email_change || undefined,
    factors: factors.map((f) => ({ id: f.id, friendly_name: f.friendly_name, factor_type: f.factor_type, status: f.status, created_at: f.created_at, updated_at: f.updated_at })),
    email_confirmed_at: u.email_confirmed_at, confirmed_at: u.email_confirmed_at, phone: "",
    last_sign_in_at: u.last_sign_in_at, app_metadata: { provider: "email", providers: ["email"], ...(u.raw_app_meta_data || {}) },
    user_metadata: u.raw_user_meta_data || {}, identities: [], created_at: u.created_at, updated_at: u.updated_at,
    is_anonymous: false,
  };
}
async function factorsOf(userId) {
  const { rows } = await db.query("select * from auth.mfa_factors where user_id = $1 order by created_at", [userId]);
  return rows;
}
// A session keeps its id and its level (aal1, or aal2 after the authenticator code) across refreshes, like Supabase.
async function session(u, sid = crypto.randomUUID(), aal = "aal1") {
  const now = Math.floor(Date.now() / 1000);
  const access = sign({
    iss: ISSUER, aud: "authenticated", exp: now + TTL, iat: now, sub: u.id, email: u.email, role: "authenticated",
    app_metadata: { provider: "email", ...(u.raw_app_meta_data || {}) }, user_metadata: u.raw_user_meta_data || {},
    session_id: sid, aal, amr: [{ method: "password", timestamp: now }, ...(aal === "aal2" ? [{ method: "totp", timestamp: now }] : [])],
  });
  const refresh = b64url(JSON.stringify({ sub: u.id, sid, n: crypto.randomUUID() })) + "." +
    crypto.createHmac("sha256", SECRET).update(`${u.id}:${sid}`).digest("base64url");
  return { access_token: access, token_type: "bearer", expires_in: TTL, expires_at: now + TTL, refresh_token: refresh, user: userJson(u, await factorsOf(u.id)) };
}
async function newSession(u, req) {
  const sid = crypto.randomUUID();
  await db.query("insert into auth.sessions (id, user_id, aal, user_agent, refreshed_at) values ($1, $2, 'aal1', $3, now() at time zone 'utc')",
    [sid, u.id, req.headers["user-agent"] || null]);
  return session(u, sid, "aal1");
}

// RFC 6238 codes (SHA-1, 30 s, 6 digits) for the local authenticator-app stand-in.
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(value) {
  let bits = "";
  for (const char of value.replace(/=+$/, "").toUpperCase()) bits += BASE32.indexOf(char).toString(2).padStart(5, "0");
  return Buffer.from((bits.match(/.{8}/g) || []).map((byte) => parseInt(byte, 2)));
}
function totp(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1e6).padStart(6, "0");
}
function totpMatches(secret, code) {
  const step = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some((delta) => totp(secret, step + delta) === String(code));
}
// Not a scannable code: the local stand-in shows where Supabase's QR code goes; type the key by hand instead.
const QR_PLACEHOLDER = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='white'/><rect x='6' y='6' width='88' height='88' fill='none' stroke='black' stroke-width='4'/><text x='50' y='46' font-size='11' text-anchor='middle' font-family='Arial'>QR local</text><text x='50' y='62' font-size='8' text-anchor='middle' font-family='Arial'>usa la clave</text></svg>`;
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
      return send(res, 200, await newSession(u, req));
    }
    if (grant === "refresh_token") {
      const [payload, sig] = String(body.refresh_token || "").split(".");
      try {
        const { sub, sid } = JSON.parse(Buffer.from(payload, "base64url").toString());
        if (crypto.createHmac("sha256", SECRET).update(`${sub}:${sid}`).digest("base64url") !== sig) throw new Error();
        const u = await findUser("id = $1 and deleted_at is null", [sub]);
        // A session closed from Seguridad (or by "todos los dispositivos") cannot be refreshed.
        const { rows } = await db.query("update auth.sessions set refreshed_at = now() at time zone 'utc', updated_at = now() where id = $1 and user_id = $2 returning aal", [sid, sub]);
        if (!u || !rows[0]) throw new Error();
        return send(res, 200, await session(u, sid, rows[0].aal || "aal1"));
      } catch { return authErr(res, "Invalid Refresh Token", "refresh_token_not_found"); }
    }
    return authErr(res, "Unsupported grant", "validation_failed");
  }
  if (route === "/user") {
    const claims = verify(bearer(req));
    if (!claims || !claims.sub) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    const u = await findUser("id = $1 and deleted_at is null", [claims.sub]);
    if (!u) return send(res, 403, { code: 403, error_code: "user_not_found", msg: "User not found" });
    if (claims.session_id && !(await db.query("select 1 from auth.sessions where id = $1", [claims.session_id])).rows[0]) {
      return send(res, 403, { code: 403, error_code: "session_not_found", msg: "Session from session_id claim in JWT does not exist" });
    }
    if (req.method === "PUT") {
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      // Like Supabase: with an authenticator app, the password and the address change only in a session that passed its code.
      if ((body.password || body.email) && claims.aal !== "aal2" && (await factorsOf(u.id)).some((f) => f.status === "verified")) {
        return send(res, 401, { code: 401, error_code: "insufficient_aal", msg: "AAL2 session is required to update email or password when MFA is enabled." });
      }
      if (body.password) await db.query("update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')) where id = $1", [u.id, body.password]);
      if (body.data) await db.query("update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data,'{}'::jsonb) || $2::jsonb where id = $1", [u.id, JSON.stringify(body.data)]);
      // safe-09: the new address waits for its confirmation link, which the local stack never sends.
      if (body.email) await db.query("update auth.users set email_change = lower($2) where id = $1", [u.id, body.email]);
      return send(res, 200, userJson(await findUser("id = $1", [u.id]), await factorsOf(u.id)));
    }
    return send(res, 200, userJson(u, await factorsOf(u.id)));
  }
  if (route === "/logout") {
    const claims = verify(bearer(req));
    const scope = url.searchParams.get("scope") || "global";
    if (claims && claims.sub) {
      if (scope === "global") await db.query("delete from auth.sessions where user_id = $1", [claims.sub]);
      else if (scope === "others") await db.query("delete from auth.sessions where user_id = $1 and id <> $2", [claims.sub, claims.session_id || null]);
      else await db.query("delete from auth.sessions where id = $1", [claims.session_id || null]);
    }
    return send(res, 204);
  }
  // Feature ideas, accounts batch (safe-08): authenticator-app factors for the signed-in account.
  const factorRoute = /^\/factors(?:\/([0-9a-f-]{36})(?:\/(challenge|verify))?)?$/.exec(route);
  if (factorRoute) {
    const claims = verify(bearer(req));
    if (!claims || !claims.sub) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    const [, factorId, action] = factorRoute;
    const body = JSON.parse((await readBody(req)).toString() || "{}");
    if (!factorId && req.method === "POST") {
      const secret = Array.from(crypto.randomBytes(20), (byte) => BASE32[byte % 32]).join("");
      const { rows } = await db.query("insert into auth.mfa_factors (user_id, friendly_name, factor_type, status, secret) values ($1, $2, 'totp', 'unverified', $3) returning *",
        [claims.sub, body.friendly_name || null, secret]);
      const uri = `otpauth://totp/${encodeURIComponent(body.issuer || "Laria")}:${encodeURIComponent(claims.email || "")}?secret=${secret}&issuer=${encodeURIComponent(body.issuer || "Laria")}`;
      return send(res, 200, { id: rows[0].id, type: "totp", friendly_name: rows[0].friendly_name, totp: { qr_code: QR_PLACEHOLDER, secret, uri } });
    }
    const { rows: [factor] } = await db.query("select * from auth.mfa_factors where id = $1 and user_id = $2", [factorId || null, claims.sub]);
    if (!factor) return send(res, 404, { code: 404, error_code: "mfa_factor_not_found", msg: "Factor not found" });
    if (req.method === "DELETE" && !action) {
      await db.query("delete from auth.mfa_factors where id = $1", [factor.id]);
      if (factor.status === "verified") await db.query("update auth.sessions set aal = 'aal1' where user_id = $1", [claims.sub]);
      return send(res, 200, { id: factor.id });
    }
    if (action === "challenge") return send(res, 200, { id: crypto.randomUUID(), type: "totp", expires_at: Math.floor(Date.now() / 1000) + 300 });
    if (action === "verify") {
      if (!totpMatches(factor.secret, body.code)) return send(res, 422, { code: 422, error_code: "mfa_verification_failed", msg: "Invalid TOTP code entered" });
      await db.query("update auth.mfa_factors set status = 'verified', updated_at = now() where id = $1", [factor.id]);
      const sid = claims.session_id || crypto.randomUUID();
      await db.query(`insert into auth.sessions (id, user_id, aal, factor_id, refreshed_at) values ($1, $2, 'aal2', $3, now() at time zone 'utc')
        on conflict (id) do update set aal = 'aal2', factor_id = excluded.factor_id, updated_at = now()`, [sid, claims.sub, factor.id]);
      return send(res, 200, await session(await findUser("id = $1", [claims.sub]), sid, "aal2"));
    }
    return send(res, 405, { code: 405, msg: "Method not allowed" });
  }
  // Admin (service role): list and delete a user's factors, and delete a user (safe-08 recovery codes, safe-09).
  const adminRoute = /^\/admin\/users\/([0-9a-f-]{36})(?:\/factors(?:\/([0-9a-f-]{36}))?)?$/.exec(route);
  if (adminRoute) {
    const claims = verify(bearer(req));
    if (!claims || claims.role !== "service_role") return send(res, 403, { code: 403, error_code: "not_admin", msg: "User not allowed" });
    const [, userId, factorId] = adminRoute;
    if (route.includes("/factors")) {
      if (req.method === "GET") return send(res, 200, await factorsOf(userId));
      if (req.method === "DELETE" && factorId) {
        const { rows: [factor] } = await db.query("delete from auth.mfa_factors where id = $1 and user_id = $2 returning *", [factorId, userId]);
        if (factor && factor.status === "verified") await db.query("delete from auth.sessions where user_id = $1", [userId]);
        return factor ? send(res, 200, factor) : send(res, 404, { code: 404, error_code: "mfa_factor_not_found", msg: "Factor not found" });
      }
    } else if (req.method === "DELETE") {
      // Soft delete, like should_soft_delete: the row stays (deleted_at), the address and password go, sessions end.
      await db.query(`update auth.users set deleted_at = now(), email = 'eliminada-' || id || '@laria.invalid', encrypted_password = null,
        email_change = null where id = $1`, [userId]);
      await db.query("delete from auth.sessions where user_id = $1", [userId]);
      await db.query("delete from auth.mfa_factors where user_id = $1", [userId]);
      return send(res, 200, {});
    }
    return send(res, 405, { code: 405, msg: "Method not allowed" });
  }
  if (route === "/settings") return send(res, 200, { external: { email: true }, disable_signup: true, mailer_autoconfirm: true });
  // OTP, sign-up, recovery and invite need email; the prototype seeds its users instead.
  // Resending the confirmation e-mail: nothing is sent locally (accounts batch, fix-08).
  if (route === "/resend") return send(res, 200, {});
  return send(res, 400, { code: 400, error_code: "not_supported_locally", msg: "Not available in the local prototype gateway" });
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
    // Feature ideas, accounts batch (safe-02): signed URLs (createSignedUrl and createSignedUrls). The local token is
    // not checked; GET /object/sign/... below serves the file.
    if (parts[0] === "object" && parts[1] === "sign" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      const signed = (name) => `/object/sign/${parts[2]}/${name.split("/").map(encodeURIComponent).join("/")}?token=local`;
      if (Array.isArray(body.paths)) return send(res, 200, body.paths.map((name) => ({ path: name, error: null, signedURL: signed(name) })));
      return send(res, 200, { signedURL: signed(parts.slice(3).join("/")) });
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

