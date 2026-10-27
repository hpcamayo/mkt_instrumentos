#!/usr/bin/env node
// Docker-free stand-in for the Supabase API, for viewing the Store Operations prototype locally.
// It serves the subset of the Supabase HTTP API the Laria app uses:
//   /rest/v1/*      proxied to a local PostgREST
//   /auth/v1/*      password sign-in, refresh, getUser and logout, against auth.users in local Postgres
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
ready = db.connect();

function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : req.headers.apikey;
}

function userJson(u) {
  return {
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
    email_confirmed_at: u.email_confirmed_at, confirmed_at: u.email_confirmed_at, phone: "",
    last_sign_in_at: u.last_sign_in_at, app_metadata: { provider: "email", providers: ["email"], ...(u.raw_app_meta_data || {}) },
    user_metadata: u.raw_user_meta_data || {}, identities: [], created_at: u.created_at, updated_at: u.updated_at,
    is_anonymous: false,
  };
}
async function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const access = sign({
    iss: ISSUER, aud: "authenticated", exp: now + TTL, iat: now, sub: u.id, email: u.email, role: "authenticated",
    app_metadata: { provider: "email", ...(u.raw_app_meta_data || {}) }, user_metadata: u.raw_user_meta_data || {},
    session_id: crypto.randomUUID(),
  });
  const refresh = b64url(JSON.stringify({ sub: u.id, n: crypto.randomUUID() })) + "." +
    crypto.createHmac("sha256", SECRET).update(u.id).digest("base64url");
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
        const { sub } = JSON.parse(Buffer.from(payload, "base64url").toString());
        if (crypto.createHmac("sha256", SECRET).update(sub).digest("base64url") !== sig) throw new Error();
        const u = await findUser("id = $1", [sub]);
        if (!u) throw new Error();
        return send(res, 200, await session(u));
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
  if (route === "/logout") return send(res, 204);
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

