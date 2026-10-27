// Launch audit A14: the release-gate cases of acceptance/cases.tsv that need accounts, checked end to end against the
// production build of the app and a full local Supabase, with throwaway accounts only. scripts/acceptance/full-stack.sh
// starts both and runs this file (in CI, .github/workflows/acceptance.yml); docs/acceptance/full-stack.md maps the
// cases. Each request is the one the app's own pages make (the same route, function or table call, signed in as the
// account that would make it). Each check prints "PASS <case> <what was shown>" or "FAIL <case> <why>", and the run
// fails if any check failed.
// Usage, from the repository root with .env.local on the local stack:
//   node --require ./tests/setup-alias.cjs tests/acceptance-release-gate.integration.cjs http://localhost:3100
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { loadEnvFile } = require("node:process");
const { setTimeout: sleep } = require("node:timers/promises");
const { createClient } = require("@supabase/supabase-js");
const { enrollTwoStep } = require("./support/two-step.cjs");
const { refreshPublicPages } = require("./support/page-refresh.cjs");
const { visibleText, sentencesWith, GUARANTEE, CHECKOUT, PAID_PROMOTION, SHIPPING_WORKFLOW, CHAT_FEATURE, CHAT_LINK } = require("./support/page-text.cjs");
const { signUpFoundExistingAccount } = require("@/lib/auth/email-check");
const { getInstrumentTypeOptions } = require("@/lib/listing-submission");

loadEnvFile(".env.local");
const base = String(process.argv[2] ?? "").replace(/\/+$/, "");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const LOCAL = new Set(["localhost", "127.0.0.1", "::1"]);
if (!base || !LOCAL.has(new URL(base).hostname) || !LOCAL.has(new URL(url).hostname)) {
  throw new Error("This test creates and deletes accounts: give it the local app's address, with .env.local on the local Supabase.");
}
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const tag = randomUUID().slice(0, 8);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9S8AAAAASUVORK5CYII=", "base64");
const created = { users: [], listings: [], stores: [], uploads: [] };
const results = [];
let wa = null;

async function check(id, summary, run) {
  try {
    const detail = await run();
    report(`PASS ${id} ${summary}${detail ? ` (${detail})` : ""}`);
  } catch (error) {
    report(`FAIL ${id} ${summary}: ${error?.message ?? error}`);
  }
}

function report(line) {
  results.push(line);
  console.log(line);
}

// The app limits sign-ins, e-mail links and address checks per visitor address (launch audit A16 and A28). Each
// simulated visitor, and each one-off request, comes from its own address, as different people's would.
let visitors = 0;
function address() {
  visitors += 1;
  return `10.${(visitors >> 16) & 255}.${(visitors >> 8) & 255}.${visitors & 255}`;
}

async function app(path, { method = "GET", body, cookie, ip = address(), headers = {} } = {}) {
  return fetch(`${base}${path}`, {
    method,
    redirect: "manual",
    headers: {
      "X-Real-IP": ip,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function post(path, body, options = {}) {
  const response = await app(path, { method: "POST", body, ...options });
  return { status: response.status, body: await response.json().catch(() => null), response };
}

async function pageText(path, cookie) {
  const response = await app(path, { cookie });
  assert.equal(response.status, 200, `${path} answered ${response.status}`);
  return visibleText(await response.text());
}

function location(response) {
  const value = response.headers.get("location");
  assert.ok(value, `answer ${response.status} without a destination`);
  return new URL(value, base);
}

// The browser's cookie jar: keeps what a response sets and drops what it clears.
function keepCookies(jar, response) {
  for (const header of response.headers.getSetCookie()) {
    const [pair, ...attributes] = header.split(";");
    const name = pair.slice(0, pair.indexOf("=")).trim();
    const value = pair.slice(pair.indexOf("=") + 1).trim();
    const expired = attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute)
      || (/^\s*expires=/i.test(attribute) && Date.parse(attribute.split("=").slice(1).join("=")) <= Date.now()));
    if (!value || expired) jar.delete(name);
    else jar.set(name, value);
  }
  return jar;
}

function cookieHeader(jar) {
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

let phones = 0;
function phone() {
  phones += 1;
  return `519${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}${String(phones).padStart(2, "0")}`;
}

async function account(label, accountType = "seller", { admin = false } = {}) {
  const email = `qa-gate-${label}-${tag}@example.invalid`;
  const password = `Qa-${randomUUID()}`;
  const name = `QA ${label} ${tag}`;
  const number = phone();
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: admin ? { role: "admin" } : {},
    user_metadata: { account_type: accountType, full_name: name, phone: number, city: "Lima", region: "Lima" },
  });
  if (error) throw new Error(`creating the ${label} account: ${error.message}`);
  created.users.push(data.user.id);
  return { label, id: data.user.id, email, password, name, phone: number, ip: address() };
}

// The app's own password sign-in (the route scripts use; the login form signs in the same account from the browser).
async function login(user) {
  const response = await app("/api/auth/login", { method: "POST", body: { email: user.email, password: user.password }, ip: user.ip });
  if (response.status !== 200) throw new Error(`signing in ${user.label} answered ${response.status}`);
  return cookieHeader(keepCookies(new Map(), response));
}

// The database as the account's browser reaches it: the public key and the account's session.
async function browserClient(user) {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`signing in ${user.label}: ${error.message}`);
  return client;
}

async function usersWithEmail(email) {
  const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.filter((user) => user.email?.toLowerCase() === email.toLowerCase());
}

function listingRow(owner, overrides = {}) {
  const id = randomUUID();
  const now = new Date().toISOString();
  return {
    id,
    slug: `qa-gate-${tag}-${id.slice(0, 8)}`,
    title: `QA Gate ${tag} ${id.slice(0, 4)}`,
    seller_type: "individual",
    status: "approved",
    category: "guitars",
    instrument_type: "electric_guitar",
    attributes: { body_type: "solid_body" },
    brand: "Fender",
    model: "Stratocaster",
    condition: "Usado - buen estado",
    price_pen: 1500,
    city: "Lima",
    region: "Lima",
    contact_name: owner?.name ?? "QA",
    whatsapp_phone: owner?.phone ?? phone(),
    description: "Guitarra de la corrida de aceptación: se crea y se borra durante la prueba.",
    created_by_source: "self_service",
    marketplace_rules_accepted_at: now,
    published_at: now,
    owner_user_id: owner?.id ?? null,
    ...overrides,
  };
}

// Listings the checks start from are written with the service role, the way the older integration tests seed them.
async function insertListing(row) {
  const { error } = await service.from("listings").insert(row);
  if (error) throw new Error(`adding a listing: ${error.message}`);
  created.listings.push(row.id);
  const photos = [0, 1].map((sort_order) => ({
    listing_id: row.id,
    image_url: `${url}/storage/v1/object/public/listing-photos/qa/${row.id}-${sort_order}.jpg`,
    alt_text: `Foto ${sort_order + 1}`,
    sort_order,
  }));
  const added = await service.from("listing_photos").insert(photos);
  if (added.error) throw new Error(`adding listing photos: ${added.error.message}`);
  return row;
}

async function insertStore(owner, verified) {
  const row = {
    id: randomUUID(),
    slug: `qa-gate-store-${tag}-${verified ? "verified" : "normal"}`,
    name: `QA Tienda ${verified ? "Verificada" : "Normal"} ${tag}`,
    razon_social: `QA Tienda ${verified ? "Verificada" : "Normal"} ${tag} SAC`,
    ruc: `20${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
    email: owner.email,
    contact_person: owner.name,
    contact_name: owner.name,
    whatsapp_phone: owner.phone,
    city: "Lima",
    region: "Lima",
    address: "Av. QA 123",
    owner_user_id: owner.id,
    status: "active",
    is_verified: verified,
    listing_plan: "free",
  };
  const { error } = await service.from("stores").insert(row);
  if (error) throw new Error(`adding a store: ${error.message}`);
  created.stores.push(row.id);
  return row;
}

async function listing(id, columns = "*") {
  const { data, error } = await service.from("listings").select(columns).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

// The publishing form's steps: start (a signed capability), the photos straight from the browser, then complete.
async function startSubmission(cookie, client, kind = "listing") {
  const started = await post("/api/submissions", { action: "start", kind }, { cookie });
  assert.equal(started.status, 200, started.body?.message);
  const paths = [];
  for (const index of [0, 1]) {
    const path = `${started.body.folder}/${index}.png`;
    const { error } = await client.storage.from("listing-photos").upload(path, png, { contentType: "image/png" });
    if (error) throw new Error(`uploading a photo: ${error.message}`);
    created.uploads.push({ bucket: "listing-photos", path });
    paths.push(path);
  }
  return { ...started.body, paths };
}

function listingFields(overrides = {}) {
  return {
    title: `QA Gate ${tag} Fender Stratocaster`,
    category: "guitars",
    instrument_type: "electric_guitar",
    attributes: { body_type: "solid_body", shape: "les_paul", bridge: "floyd_rose", pickups: ["humbucker", "p90"] },
    brand: "Fender",
    model: "Stratocaster",
    condition: "Usado - buen estado",
    price_pen: 1500,
    city: "Lima",
    region: "Lima",
    description: "Guitarra de la corrida de aceptación, con estuche y cuerdas nuevas; se borra al terminar.",
    marketplace_rules_accepted: true,
    ...overrides,
  };
}

async function complete(cookie, submission, fields) {
  return post("/api/submissions", { action: "complete", token: submission.token, fields, paths: submission.paths, roles: submission.paths.map(() => null) }, { cookie });
}

async function manage(cookie, id, body) {
  return post(`/api/listings/${id}/manage`, body, { cookie });
}

async function contact(cookie, listingId) {
  const result = await post("/api/contact", { eventId: randomUUID(), listingId, source: "detail" }, { cookie });
  assert.equal(result.status, 200, `contact answered ${result.status}`);
  return result.body;
}

// The listing pages are cached and cleared by the refresh job (launch audit A19), as in production.
async function pageShows(path, test, what) {
  let last = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt > 0) {
      await refreshPublicPages(base);
      await sleep(1500);
    }
    const response = await app(path);
    last = String(response.status);
    if (response.status === 200) {
      const text = visibleText(await response.text());
      if (test(text)) return text;
    }
  }
  throw new Error(`${path} never showed ${what} (last answer ${last})`);
}

// Rows in laria_private aren't served by the API; full-stack.sh names the database container so a check can read them.
function databaseValue(sql) {
  const container = process.env.ACCEPTANCE_DB_CONTAINER;
  if (!container) throw new Error("ACCEPTANCE_DB_CONTAINER is not set (scripts/acceptance/full-stack.sh sets it)");
  return execFileSync("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-Atc", sql], { encoding: "utf8" }).trim();
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

(async () => {
  // ---------------------------------------------------------------------------------------------------- accounts
  const seller = await account("seller");
  const buyer = await account("buyer");
  const other = await account("other");
  const adminUser = await account("admin", "seller", { admin: true });
  const storeOwner = await account("store", "store_owner");
  const verifiedOwner = await account("verified", "store_owner");
  const sellerCookie = await login(seller);
  const buyerCookie = await login(buyer);
  const sellerClient = await browserClient(seller);
  const adminClient = await browserClient(adminUser);
  await enrollTwoStep(adminClient);
  const normalStore = await insertStore(storeOwner, false);
  const verifiedStore = await insertStore(verifiedOwner, true);
  const market = await insertListing(listingRow(other, { title: `QA Gate ${tag} Gibson de otra cuenta` }));

  // The account pages a signed-in Particular and a store owner see, read once for the scope checks.
  let accountPageCache = null;
  async function accountPages() {
    if (!accountPageCache) {
      const storeCookie = await login(storeOwner);
      const pages = [["/mi-cuenta", sellerCookie], ["/mi-cuenta/publicar", sellerCookie], ["/mi-cuenta/publicaciones", sellerCookie], ["/mi-cuenta/favoritos", sellerCookie], ["/mi-cuenta/tienda", storeCookie]];
      accountPageCache = [];
      for (const [path, cookie] of pages) {
        const response = await app(path, { cookie });
        assert.equal(response.status, 200, `${path} answered ${response.status}`);
        const html = await response.text();
        accountPageCache.push([{ name: path, html, text: visibleText(html) }, cookie]);
      }
    }
    return accountPageCache;
  }

  // ------------------------------------------------------------------------------------------- signing up and in
  await check("AUTH-005", "password sign-in opens a session that reaches the account area", async () => {
    const cookie = await login(seller);
    const text = await pageText("/mi-cuenta", cookie);
    assert.match(text, /Mis publicaciones/);
  });

  await check("AUTH-006", "a wrong password and an unknown address get the same refusal, and no session", async () => {
    const ip = address();
    const wrong = await post("/api/auth/login", { email: seller.email, password: `${seller.password}-x` }, { ip });
    const unknown = await post("/api/auth/login", { email: `qa-gate-nobody-${tag}@example.invalid`, password: seller.password }, { ip });
    for (const answer of [wrong, unknown]) {
      assert.equal(answer.status, 401);
      assert.equal(answer.response.headers.getSetCookie().length, 0, "a refused sign-in set cookies");
    }
    assert.deepEqual(wrong.body, unknown.body, "the two refusals differ");
    assert.equal(wrong.body.message, "No se pudo iniciar sesión. Revisa tu correo y contraseña.");
    return `"${wrong.body.message}"`;
  });

  await check("AUTH-002", "signing up again with a registered address creates nothing and shows the duplicate message", async () => {
    const ip = address();
    const answer = await post("/api/auth/check-email", { email: seller.email.toUpperCase() }, { ip });
    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body, { ok: true, available: false });
    // The address check can be unavailable (A28); the form's sign-up then still recognises the account. This Auth, like
    // production's, confirms neither addresses nor phone numbers on its own, so Supabase answers with the account without
    // identities. Where Auth confirms either on its own, it answers with the error user_already_exists instead, which the
    // forms also read as the duplicate (tests/launch-audit-trust.test.cjs).
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signUp({
      email: seller.email,
      password: `Qa-${randomUUID()}`,
      options: { emailRedirectTo: `${base}/auth/callback?next=%2Fmi-cuenta`, data: { account_type: "seller", full_name: "QA Duplicado", marketplace_rules_accepted: true } },
    });
    assert.equal(error, null, `Supabase answered ${error?.code}, not as production does: this Auth confirms addresses or phone numbers on its own (scripts/acceptance/supabase-config.toml)`);
    assert.ok(signUpFoundExistingAccount(data.user, "seller"), "the form would not recognise the duplicate");
    assert.equal(data.session, null, "the second sign-up opened a session");
    assert.equal((await usersWithEmail(seller.email)).length, 1);
    assert.equal((await service.from("profiles").select("full_name").eq("id", seller.id).single()).data.full_name, seller.name);
    assert.equal((await post("/api/auth/login", { email: seller.email, password: seller.password }, { ip })).status, 200, "the original password stopped working");
    return `Supabase answered with the account without identities, as production does; one account, name and password unchanged; the form says "Este correo ya está registrado. Ingresa con tu cuenta o usa otro correo."`;
  });

  await check("AUTH-004", "a used or invalid sign-up link goes to sign-in with a message, sets no session and leaves an open one alone", async () => {
    const email = `qa-gate-signup-${tag}@example.invalid`;
    const link = await service.auth.admin.generateLink({ type: "signup", email, password: `Qa-${randomUUID()}`, options: { data: { account_type: "seller", full_name: `QA Alta ${tag}` } } });
    assert.equal(link.error, null, link.error?.message);
    created.users.push(link.data.user.id);
    const callback = (hash) => `/auth/callback?token_hash=${encodeURIComponent(hash)}&type=signup&next=${encodeURIComponent("/mi-cuenta?confirmed=1")}`;
    const first = await app(callback(link.data.properties.hashed_token));
    assert.equal(first.status, 307);
    assert.equal(location(first).pathname, "/mi-cuenta", "the first use of the link failed");
    for (const hash of [link.data.properties.hashed_token, "0".repeat(56)]) {
      const response = await app(callback(hash), { cookie: sellerCookie });
      assert.equal(response.status, 307);
      const target = location(response);
      assert.equal(target.pathname, "/login");
      assert.equal(target.searchParams.get("error"), "No se pudo confirmar la sesión.");
      assert.equal(response.headers.getSetCookie().length, 0, "a refused link changed cookies");
    }
    assert.equal((await app("/mi-cuenta", { cookie: sellerCookie })).status, 200, "the session that was open was lost");
    return "\"No se pudo confirmar la sesión.\" on /login";
  });

  await check("AUTH-008", "a sign-in link for an unknown address creates no account", async () => {
    const email = `qa-gate-unknown-${tag}@example.invalid`;
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    // The login form's call (components/login-form.tsx).
    const { error } = await anon.auth.signInWithOtp({ email, options: { emailRedirectTo: `${base}/auth/callback?next=%2Fmi-cuenta`, shouldCreateUser: false } });
    assert.ok(error, "Supabase accepted a sign-in link for an address without an account");
    assert.equal((await usersWithEmail(email)).length, 0);
    assert.deepEqual((await post("/api/auth/check-email", { email })).body, { ok: true, available: true });
    return `Supabase refused it ("${error.message}"); the form says "No se pudo enviar el enlace. Verifica que ya tengas una cuenta."`;
  });

  await check("AUTH-011", "a reset request for an unknown address answers like one for an account and creates nothing", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const redirectTo = `${base}/auth/callback?next=/restablecer-contrasena`;
    const unknownEmail = `qa-gate-reset-${tag}@example.invalid`;
    // The reset form's call (components/password-form.tsx); it shows the same sentence for every address.
    const unknown = await anon.auth.resetPasswordForEmail(unknownEmail, { redirectTo });
    const known = await anon.auth.resetPasswordForEmail(other.email, { redirectTo });
    assert.equal(unknown.error, null, unknown.error?.message);
    assert.equal(known.error, null, known.error?.message);
    assert.deepEqual(unknown.data, known.data);
    assert.equal((await usersWithEmail(unknownEmail)).length, 0);
    return "both answer alike; the form says \"Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.\"";
  });

  await check("AUTH-013", "a used or invalid reset link goes to sign-in with a message and leaves the password as it was", async () => {
    const link = await service.auth.admin.generateLink({ type: "recovery", email: other.email });
    assert.equal(link.error, null, link.error?.message);
    const callback = (hash) => `/auth/callback?token_hash=${encodeURIComponent(hash)}&type=recovery&next=%2Fmi-cuenta`;
    const first = await app(callback(link.data.properties.hashed_token));
    assert.equal(location(first).pathname, "/restablecer-contrasena", "the first use of the link failed");
    for (const hash of [link.data.properties.hashed_token, "0".repeat(56)]) {
      const response = await app(callback(hash));
      const target = location(response);
      assert.equal(target.pathname, "/login");
      assert.equal(target.searchParams.get("error"), "El enlace de recuperación no es válido o ya venció.");
      assert.equal(response.headers.getSetCookie().length, 0, "a refused link set cookies");
    }
    assert.equal((await post("/api/auth/login", { email: other.email, password: other.password })).status, 200, "the password changed");
    return "\"El enlace de recuperación no es válido o ya venció.\" on /login";
  });

  await check("AUTH-014", "a signed-in account changes its password: the old one stops working and the new one works", async () => {
    const user = await account("password");
    const cookie = await login(user);
    assert.match(await pageText("/mi-cuenta/seguridad", cookie), /Cambiar contraseña/);
    // The password form's call (components/password-form.tsx, mode "change").
    const client = await browserClient(user);
    const next = `Qa-${randomUUID()}`;
    const { error } = await client.auth.updateUser({ password: next });
    assert.equal(error, null, error?.message);
    assert.equal((await post("/api/auth/login", { email: user.email, password: user.password })).status, 401, "the old password still works");
    assert.equal((await post("/api/auth/login", { email: user.email, password: next })).status, 200, "the new password doesn't work");
  });

  await check("AUTH-015", "profile changes save and show on the profile page; the account type can't be changed", async () => {
    const client = await browserClient(other);
    const name = `QA Perfil Editado ${tag}`;
    const number = phone();
    // The profile form's write (lib/auth/profile.ts, upsertSellerProfile).
    const saved = await client.from("profiles").upsert({ id: other.id, account_type: "seller", full_name: name, phone: number, city: "Arequipa", region: "Arequipa" }, { onConflict: "id" });
    assert.equal(saved.error, null, saved.error?.message);
    const stored = await service.from("profiles").select("full_name,phone,city,region").eq("id", other.id).single();
    assert.deepEqual(stored.data, { full_name: name, phone: number, city: "Arequipa", region: "Arequipa" });
    const response = await app("/mi-cuenta/perfil", { cookie: await login(other) });
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes(name), "the profile page doesn't show the new name");
    const refused = await client.from("profiles").update({ account_type: "store_owner" }).eq("id", other.id);
    assert.ok(refused.error, "the account type changed");
    assert.equal((await service.from("profiles").select("account_type").eq("id", other.id).single()).data.account_type, "seller");
    other.name = name;
    return `account type change refused: "${refused.error.message}"`;
  });

  await check("AUTH-019", "an account page without a session goes to sign-in and comes back to it after signing in", async () => {
    const path = "/mi-cuenta/publicaciones?estado=pendientes";
    const response = await app(path);
    assert.equal(response.status, 307);
    const target = location(response);
    assert.equal(target.pathname, "/login");
    assert.equal(target.searchParams.get("next"), path);
    const link = await service.auth.admin.generateLink({ type: "magiclink", email: buyer.email });
    assert.equal(link.error, null, link.error?.message);
    const back = await app(`/auth/callback?token_hash=${encodeURIComponent(link.data.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent(path)}`);
    const landed = location(back);
    assert.equal(`${landed.pathname}${landed.search}`, path);
    return `${target.pathname}${target.search}, then back to ${path}`;
  });

  await check("AUTH-020", "a sign-in link with an outside return address stays on Laria", async () => {
    const tried = ["https://evil.example/", "//evil.example", "/\\evil.example", "/\t/evil.example", "http:evil.example"];
    for (const next of tried) {
      const link = await service.auth.admin.generateLink({ type: "magiclink", email: buyer.email });
      assert.equal(link.error, null, link.error?.message);
      const response = await app(`/auth/callback?token_hash=${encodeURIComponent(link.data.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent(next)}`);
      assert.equal(response.status, 307);
      const target = location(response);
      assert.equal(target.origin, new URL(base).origin, `${JSON.stringify(next)} left the site`);
      assert.equal(target.pathname, "/mi-cuenta", `${JSON.stringify(next)} went to ${target.pathname}`);
    }
    return `${tried.length} outside addresses all landed on /mi-cuenta`;
  });

  // ------------------------------------------------------------------------------------------------- publishing
  let submitted = null;
  let pedals = null;

  await check("LIST-001", "publishing without an account goes to sign-in, and the publishing route refuses", async () => {
    const response = await app("/vender");
    assert.equal(response.status, 307);
    const target = location(response);
    assert.equal(target.pathname, "/login");
    assert.equal(target.searchParams.get("next"), "/vender");
    const refused = await post("/api/submissions", { action: "start", kind: "listing" });
    assert.equal(refused.status, 401);
    return `"${refused.body.message}"`;
  });

  await check("LIST-002", "a signed-in Particular opens the publishing form", async () => {
    const forward = await app("/vender", { cookie: sellerCookie });
    assert.equal(forward.status, 307);
    assert.equal(location(forward).pathname, "/mi-cuenta/publicar");
    assert.match(await pageText("/mi-cuenta/publicar", sellerCookie), /Publica tu instrumento usado/);
  });

  // One submission is refused field by field, then completed: nothing is kept until it is valid.
  let draft = null;
  try {
    draft = await startSubmission(sellerCookie, sellerClient);
  } catch (error) {
    report(`FAIL LIST-003 starting a submission: ${error.message}`);
  }
  const refusals = [
    ["LIST-005", "a missing title is refused", [{ title: "   " }], "Completa los campos obligatorios."],
    ["LIST-006", "a missing or unknown category is refused", [{ category: "" }], "Completa los campos obligatorios."],
    ["LIST-006", "a missing or unknown category is refused", [{ category: "naves_espaciales" }], "Revisa la categoría, condición y ubicación."],
    ["LIST-007", "a guitar without an instrument type, or with another category's type, is refused", [{ instrument_type: "" }, { instrument_type: "pedals" }], "Selecciona un tipo de instrumento válido."],
    ["LIST-012", "a submission without the marketplace rules accepted is refused", [{ marketplace_rules_accepted: false }, { marketplace_rules_accepted: undefined }], "Debes aceptar las reglas del marketplace."],
    ["LIST-014", "a negative or non-whole price is refused", [{ price_pen: -100 }, { price_pen: "abc" }, { price_pen: 99.5 }], "Ingresa un precio válido en soles enteros."],
  ];
  const refusedCases = new Map();
  for (const [id, summary, changes, message] of refusals) {
    const failures = refusedCases.get(id) ?? { summary, problems: [], messages: new Set() };
    refusedCases.set(id, failures);
    for (const change of changes) {
      try {
        assert.ok(draft, "no submission to send");
        const answer = await complete(sellerCookie, draft, listingFields(change));
        assert.equal(answer.status, 400, `${JSON.stringify(change)} answered ${answer.status}`);
        assert.equal(answer.body.message, message);
        assert.equal(await listing(draft.id, "id"), null, `${JSON.stringify(change)} left a listing`);
        failures.messages.add(answer.body.message);
      } catch (error) {
        failures.problems.push(error.message);
      }
    }
  }
  for (const [id, { summary, problems, messages }] of refusedCases) {
    // LIST-012 and LIST-014 have more to prove below, and are reported there.
    if (id === "LIST-012" || id === "LIST-014") continue;
    if (problems.length) report(`FAIL ${id} ${summary}: ${problems.join("; ")}`);
    else report(`PASS ${id} ${summary}, and no listing is created (${[...messages].map((text) => `"${text}"`).join(", ")})`);
  }
  await check("LIST-014", "a negative or non-whole price is refused by the form's route and by the database", async () => {
    assert.deepEqual(refusedCases.get("LIST-014").problems, []);
    const direct = await service.from("listings").insert(listingRow(seller, { status: "pending", price_pen: -1 }));
    assert.ok(direct.error, "the database accepted a negative price");
    return `"Ingresa un precio válido en soles enteros."; the database: "${direct.error.message}"`;
  });

  const before = Date.now();
  await check("LIST-003", "a valid submission creates the account's own pending Particular listing", async () => {
    assert.ok(draft, "no submission to send");
    // A tampered request: protected fields are added to what the form sends.
    const tampered = listingFields({ status: "approved", owner_user_id: other.id, seller_type: "store", store_id: normalStore.id, published_at: new Date().toISOString(), marketplace_rules_accepted_at: "2001-01-01T00:00:00Z" });
    const answer = await complete(sellerCookie, draft, tampered);
    assert.equal(answer.status, 200, answer.body?.message);
    assert.equal(answer.body.completed, true);
    created.listings.push(draft.id);
    submitted = await listing(draft.id, "id,slug,title,owner_user_id,seller_type,store_id,status,published_at,marketplace_rules_accepted_at,attributes,price_pen");
    assert.ok(submitted, "no listing was created");
    assert.equal(submitted.owner_user_id, seller.id);
    assert.equal(submitted.seller_type, "individual");
    assert.equal(submitted.store_id, null);
    assert.equal(submitted.status, "pending");
    return `owner is the signed-in account, seller type individual, no store, status pending`;
  });
  const after = Date.now();

  await check("LIST-004", "a Particular can't publish a listing straight to approved", async () => {
    assert.ok(submitted, "LIST-003 created nothing");
    assert.equal(submitted.status, "pending", "the submitted status was kept");
    assert.equal(submitted.published_at, null);
    const insert = await sellerClient.from("listings").insert(listingRow(seller));
    assert.ok(insert.error, "the account inserted an approved listing directly");
    const update = await sellerClient.from("listings").update({ status: "approved" }).eq("id", submitted.id).select("id");
    assert.ok(update.error || !update.data?.length, "the account approved its own listing");
    assert.equal((await listing(submitted.id, "status")).status, "pending");
    return `"status": "approved" in the request was ignored; a direct insert was refused ("${insert.error.message}")`;
  });

  await check("LIST-020", "a submission can't name another account as owner", async () => {
    assert.ok(submitted, "LIST-003 created nothing");
    assert.equal(submitted.owner_user_id, seller.id, "the owner came from the request");
    const insert = await sellerClient.from("listings").insert(listingRow(other, { status: "pending" }));
    assert.ok(insert.error, "the account inserted a listing owned by another account");
    return "owner_user_id of another account in the request was ignored; a direct insert was refused";
  });

  await check("LIST-012", "a submission without the rules accepted is refused, and the acceptance time is the server's", async () => {
    assert.deepEqual(refusedCases.get("LIST-012").problems, []);
    assert.ok(submitted, "LIST-003 created nothing");
    const accepted = Date.parse(submitted.marketplace_rules_accepted_at);
    assert.ok(accepted >= before - 5000 && accepted <= after + 5000, `stored ${submitted.marketplace_rules_accepted_at}`);
    return `refused without acceptance ("Debes aceptar las reglas del marketplace."); a submitted 2001 timestamp was ignored`;
  });

  await check("LIST-021", "sending the same submission again doesn't duplicate the listing", async () => {
    assert.ok(submitted, "LIST-003 created nothing");
    const again = await complete(sellerCookie, draft, listingFields());
    assert.equal(again.status, 200, again.body?.message);
    assert.equal(again.body.completed, true);
    const { count } = await service.from("listings").select("id", { count: "exact", head: true }).eq("id", draft.id);
    assert.equal(count, 1);
    const photos = await service.from("listing_photos").select("id").eq("listing_id", draft.id);
    assert.equal(photos.data.length, draft.paths.length);
  });

  await check("LIST-022", "the same capability with changed data, a forged one or another account's can't change or copy the listing", async () => {
    assert.ok(submitted, "LIST-003 created nothing");
    const changed = await complete(sellerCookie, draft, listingFields({ title: "Título cambiado al reintentar", price_pen: 1 }));
    assert.equal(changed.status, 200, changed.body?.message);
    const stored = await listing(draft.id, "title,price_pen");
    assert.deepEqual(stored, { title: submitted.title, price_pen: submitted.price_pen }, "the retry changed the listing");
    const forged = await post("/api/submissions", { action: "complete", token: `${draft.token}x`, fields: listingFields(), paths: draft.paths, roles: [null, null] }, { cookie: sellerCookie });
    assert.equal(forged.status, 403);
    const foreign = await complete(buyerCookie, draft, listingFields({ title: "Copia de otra cuenta" }));
    assert.equal(foreign.status, 403);
    assert.equal(foreign.body.message, "Este envío pertenece a otra cuenta.");
    const { count } = await service.from("listings").select("id", { count: "exact", head: true }).ilike("title", `%${tag}%Fender Stratocaster%`);
    assert.equal(count, 1, "the listing was copied");
    return "a changed retry answers \"completed\" and changes nothing; forged: 403; another account: 403";
  });

  // LIST-008 asks for a category without instrument types. Since the marketplace categories (migration 20261022120000)
  // every category has its types plus "Otro", so the case can't run as written; this shows the closest thing, a seller
  // who doesn't know the type picks "Otro" and leaves the characteristics out. It prints a NOTE, never a PASS: whether
  // that settles the case is the owner's call.
  try {
    const options = getInstrumentTypeOptions("pedals").map((option) => option.value);
    assert.deepEqual(options, ["pedals", "other"]);
    const submission = await startSubmission(sellerCookie, sellerClient);
    const answer = await complete(sellerCookie, submission, listingFields({ title: `QA Gate ${tag} pedal Boss`, category: "pedals", instrument_type: "other", attributes: {}, brand: "Boss", model: "DS-1" }));
    assert.equal(answer.status, 200, answer.body?.message);
    created.listings.push(submission.id);
    pedals = await listing(submission.id, "id,slug,status,instrument_type");
    assert.equal(pedals.status, "pending");
    console.log("NOTE LIST-008 every category has instrument types; a pedal sent with \"Otro\" and no characteristics was accepted (owner to confirm the case)");
  } catch (error) {
    report(`FAIL LIST-008 a pedal sent with "Otro" and no characteristics: ${error.message}`);
  }

  await check("LIST-010", "a listing without the optional characteristics publishes", async () => {
    const submission = await startSubmission(sellerCookie, sellerClient);
    const answer = await complete(sellerCookie, submission, listingFields({ title: `QA Gate ${tag} sin detalles`, attributes: {} }));
    assert.equal(answer.status, 200, answer.body?.message);
    created.listings.push(submission.id);
    const stored = await listing(submission.id, "status,attributes");
    assert.equal(stored.status, "pending");
    assert.deepEqual(stored.attributes, {});
  });

  // ------------------------------------------------------------------------------------------ Admin's decisions
  await check("LIFE-001", "Admin's approval publishes a pending Particular listing and sets its first publication time", async () => {
    assert.ok(submitted, "LIST-003 created nothing");
    // The review screen's call (components/admin-workbench.tsx), with Admin's authenticator step done.
    const { error } = await adminClient.rpc("review_listing", { p_listing_id: submitted.id, p_decision: "approve" });
    assert.equal(error, null, error?.message);
    const stored = await listing(submitted.id, "status,published_at");
    assert.equal(stored.status, "approved");
    assert.ok(stored.published_at, "no publication time");
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    assert.equal((await anon.from("listings").select("id").eq("id", submitted.id)).data.length, 1, "not public");
    await pageShows(`/instrumentos/${submitted.slug}`, (text) => text.includes(submitted.title), "the listing");
    return `published_at ${stored.published_at}`;
  });

  await check("LIST-009", "the characteristics are saved and shown with their Spanish labels", async () => {
    assert.ok(submitted, "LIST-003 created nothing");
    assert.deepEqual(submitted.attributes, listingFields().attributes);
    const text = await pageShows(`/instrumentos/${submitted.slug}`, (page) => page.includes(submitted.title), "the listing");
    for (const label of ["Cuerpo sólido", "Les Paul", "Floyd Rose", "Humbucker", "P90"]) assert.ok(text.includes(label), `the page doesn't show "${label}"`);
    const unknown = await complete(sellerCookie, await startSubmission(sellerCookie, sellerClient), listingFields({ attributes: { body_type: "nave" } }));
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.message, "Revisa los atributos del instrumento.");
    return "Cuerpo sólido, Les Paul, Floyd Rose, Humbucker, P90; an unknown value is refused";
  });

  await check("LIST-011", "the form and the listing page never show raw keys or JSON", async () => {
    assert.ok(submitted, "LIST-003 created nothing");
    const raw = /\b(body_type|solid_body|floyd_rose|les_paul|electric_guitar|instrument_type|price_pen|marketplace_rules_accepted)\b|\{"|[a-z]+_[a-z]+_[a-z]+/;
    const detail = await pageShows(`/instrumentos/${submitted.slug}`, (page) => page.includes(submitted.title), "the listing");
    assert.doesNotMatch(detail, raw, "the listing page");
    assert.doesNotMatch(await pageText("/mi-cuenta/publicar", sellerCookie), raw, "the publishing form");
  });

  await check("LIFE-002", "Admin's rejection keeps the listing hidden, shows the reason to its owner and queues the e-mail", async () => {
    assert.ok(pedals, "LIST-008 created nothing");
    const reason = `Las fotos no muestran el pedal completo (${tag}).`;
    const { error } = await adminClient.rpc("review_listing", { p_listing_id: pedals.id, p_decision: "reject", p_reason: reason });
    assert.equal(error, null, error?.message);
    const stored = await listing(pedals.id, "status,rejection_reason");
    assert.deepEqual(stored, { status: "rejected", rejection_reason: reason });
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    assert.equal((await anon.from("listings").select("id").eq("id", pedals.id)).data.length, 0, "a rejected listing is public");
    assert.equal((await app(`/instrumentos/${pedals.slug}`)).status, 404);
    assert.ok((await pageText("/mi-cuenta/publicaciones", sellerCookie)).includes(reason), "the owner's listings page doesn't show the reason");
    const notices = await service.from("notifications").select("id").eq("user_id", seller.id).eq("listing_id", pedals.id).eq("event_type", "listing_rejected");
    assert.equal(notices.data.length, 1, "no notice for the owner");
    const queued = databaseValue(`select count(*) from laria_private.marketplace_email_deliveries where event_type = 'listing_rejected' and listing_id = '${pedals.id}'`);
    assert.equal(queued, "1", "no rejection e-mail queued");
    return "404 for visitors; reason on Mis publicaciones; one notice and one e-mail queued";
  });

  // ----------------------------------------------------------------------------------- the seller's identity
  const identity = await insertListing(listingRow(seller, { title: `QA Gate ${tag} identidad`, contact_name: "Contacto Antiguo", whatsapp_phone: "51900000001" }));
  let legacy = null;

  await check("LIST-015", "an account's listing shows the profile's name and opens WhatsApp to the profile's number", async () => {
    const text = await pageShows(`/instrumentos/${identity.slug}`, (page) => page.includes(identity.title), "the listing");
    assert.ok(text.includes(seller.name), "the page doesn't show the profile's name");
    assert.ok(!text.includes("Contacto Antiguo"), "the page shows the listing's own contact name");
    const answer = await contact(null, identity.id);
    assert.ok(answer.url.startsWith(`https://wa.me/${digits(seller.phone)}?`), `contact opens ${answer.url.split("?")[0]}`);
    return `name "${seller.name}", WhatsApp to the profile's number`;
  });

  await check("LIST-016", "a new profile name shows on the account's listing", async () => {
    const name = `QA Nombre Nuevo ${tag}`;
    const saved = await sellerClient.from("profiles").upsert({ id: seller.id, account_type: "seller", full_name: name, phone: seller.phone, city: "Lima", region: "Lima" }, { onConflict: "id" });
    assert.equal(saved.error, null, saved.error?.message);
    await pageShows(`/instrumentos/${identity.slug}`, (text) => text.includes(name), `the new name "${name}"`);
    seller.name = name;
  });

  await check("LIST-017", "a new profile WhatsApp number is the one the listing's contact opens", async () => {
    const number = phone();
    const saved = await sellerClient.from("profiles").upsert({ id: seller.id, account_type: "seller", full_name: seller.name, phone: number, city: "Lima", region: "Lima" }, { onConflict: "id" });
    assert.equal(saved.error, null, saved.error?.message);
    const answer = await contact(null, identity.id);
    assert.ok(answer.url.startsWith(`https://wa.me/${number}?`), `contact opens ${answer.url.split("?")[0]}`);
    seller.phone = number;
  });

  await check("LIST-018", "a listing without an account keeps its own contact name and number", async () => {
    const number = phone();
    legacy = await insertListing(listingRow(null, { title: `QA Gate ${tag} legado`, contact_name: `QA Legado ${tag}`, whatsapp_phone: number, created_by_source: "admin" }));
    const text = await pageShows(`/instrumentos/${legacy.slug}`, (page) => page.includes(legacy.title), "the listing");
    assert.ok(text.includes(`QA Legado ${tag}`), "the page doesn't show the listing's contact name");
    const answer = await contact(null, legacy.id);
    assert.ok(answer.url.startsWith(`https://wa.me/${number}?`), `contact opens ${answer.url.split("?")[0]}`);
  });

  await check("LIST-019", "a new account with the same number doesn't take over a listing without an account", async () => {
    assert.ok(legacy, "LIST-018 created nothing");
    const email = `qa-gate-claim-${tag}@example.invalid`;
    const link = await service.auth.admin.generateLink({ type: "signup", email, password: `Qa-${randomUUID()}`, options: { data: { account_type: "seller", full_name: `QA Mismo Número ${tag}`, phone: legacy.whatsapp_phone, city: "Lima", region: "Lima" } } });
    assert.equal(link.error, null, link.error?.message);
    created.users.push(link.data.user.id);
    const confirmed = await app(`/auth/callback?token_hash=${encodeURIComponent(link.data.properties.hashed_token)}&type=signup&next=%2Fmi-cuenta%2Fpublicaciones`);
    assert.equal(location(confirmed).pathname, "/mi-cuenta/publicaciones");
    const profile = await service.from("profiles").select("phone").eq("id", link.data.user.id).single();
    assert.equal(profile.data.phone, legacy.whatsapp_phone, "the new account doesn't have the same number");
    assert.equal((await listing(legacy.id, "owner_user_id")).owner_user_id, null, "the listing was claimed");
    const mine = await pageText("/mi-cuenta/publicaciones", cookieHeader(keepCookies(new Map(), confirmed)));
    assert.ok(!mine.includes(legacy.title), "the new account lists it");
  });

  // ---------------------------------------------------------------------------------------- editing a live listing
  const immediateEdits = [
    ["REV-001", "a new price", { price_pen: 1350 }, (row) => row.price_pen === 1350, (text) => /1[.,]350/.test(text)],
    ["REV-002", "a new description", { description: `Descripción actualizada en la corrida ${tag}, con estuche rígido original.` }, (row) => row.description.includes(`corrida ${tag}`), (text) => text.includes(`corrida ${tag}`)],
    ["REV-003", "a new place", { city: "Cusco", region: "Cusco" }, (row) => row.city === "Cusco" && row.region === "Cusco", (text) => text.includes("Cusco")],
    ["REV-004", "new characteristics", { attributes: { body_type: "hollow_body" } }, (row) => row.attributes.body_type === "hollow_body", (text) => text.includes("Hueca")],
  ];
  for (const [id, what, immediate, stored, shown] of immediateEdits) {
    await check(id, `${what} on a published listing applies at once, without review`, async () => {
      assert.ok(submitted, "LIST-003 created nothing");
      const answer = await manage(sellerCookie, submitted.id, { action: "edit", immediate, moderated: {} });
      assert.equal(answer.status, 200, answer.body?.message);
      const row = await listing(submitted.id, "status,price_pen,description,city,region,attributes");
      assert.equal(row.status, "approved");
      assert.ok(stored(row), `stored ${JSON.stringify(row)}`);
      const pending = await service.from("listing_revisions").select("id").eq("listing_id", submitted.id).eq("status", "pending");
      assert.equal(pending.data.length, 0, "a review was opened");
      await pageShows(`/instrumentos/${submitted.slug}`, shown, what);
    });
  }

  // A new category or type comes with that type's characteristics, as the edit page sends them (none filled in here):
  // the old type's don't fit it, so they go to review with it and the live listing keeps its own.
  const moderatedEdits = [
    ["REV-006", "category", { category: "basses", instrument_type: "bass" }, "category", { attributes: {} }],
    ["REV-007", "instrument type", { instrument_type: "acoustic_guitar" }, "instrument_type", { attributes: {} }],
    ["REV-008", "brand", { brand: "Gibson" }, "brand", {}],
    ["REV-009", "model", { model: "Les Paul Junior" }, "model", {}],
  ];
  for (const [id, what, moderated, field, immediate] of moderatedEdits) {
    await check(id, `a ${what} change waits for review while the published version stays live`, async () => {
      const live = await insertListing(listingRow(seller, { title: `QA Gate ${tag} revisión ${field}` }));
      const answer = await manage(sellerCookie, live.id, { action: "edit", immediate, moderated });
      assert.equal(answer.status, 200, answer.body?.message);
      const revision = await service.from("listing_revisions").select("status,changed_fields").eq("listing_id", live.id).eq("status", "pending");
      assert.equal(revision.data.length, 1, "no pending review");
      assert.ok(revision.data[0].changed_fields.includes(field), `the review holds ${revision.data[0].changed_fields}`);
      const row = await listing(live.id, `status,${field},attributes`);
      assert.equal(row.status, "approved");
      assert.equal(row[field], live[field], `the live ${field} changed`);
      assert.deepEqual(row.attributes, live.attributes, "the live characteristics changed");
      await pageShows(`/instrumentos/${live.slug}`, (text) => text.includes(live.title), "the listing");
      return `live ${field} stays "${live[field]}"`;
    });
  }

  // ------------------------------------------------------------------------------------------- sold and relisted
  await check("LIFE-007", "a sold listing leaves the catalog", async () => {
    assert.ok(submitted, "LIST-003 created nothing");
    assert.match(await pageText("/listados?sort=newest"), new RegExp(submitted.title), "the listing wasn't in the catalog before");
    const sold = await manage(sellerCookie, submitted.id, { action: "sold" });
    assert.equal(sold.status, 200, sold.body?.message);
    assert.equal((await listing(submitted.id, "status")).status, "sold");
    assert.doesNotMatch(await pageText("/listados?sort=newest"), new RegExp(submitted.title), "the catalog still shows it");
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    assert.equal((await anon.from("listings").select("id").eq("id", submitted.id).eq("status", "approved")).data.length, 0);
  });

  await check("LIFE-008", "a sold listing can't be put back on sale", async () => {
    assert.ok(submitted, "LIST-003 created nothing");
    const soldAt = (await listing(submitted.id, "sold_at")).sold_at;
    for (const body of [{ action: "restore" }, { action: "resubmit" }, { action: "edit", immediate: { price_pen: 1200 }, moderated: {} }]) {
      const answer = await manage(sellerCookie, submitted.id, body);
      assert.notEqual(answer.status, 200, `${body.action} was accepted`);
    }
    const direct = await sellerClient.from("listings").update({ status: "approved" }).eq("id", submitted.id).select("id");
    assert.ok(direct.error || !direct.data?.length, "the owner changed the status directly");
    for (const decision of ["approve", "restore"]) {
      assert.ok((await adminClient.rpc("review_listing", { p_listing_id: submitted.id, p_decision: decision })).error, `Admin's ${decision} was accepted`);
    }
    assert.deepEqual(await listing(submitted.id, "status,sold_at"), { status: "sold", sold_at: soldAt });
    return "restore, resubmit, edit, a direct update and Admin's approve or restore were all refused";
  });

  await check("LIFE-010", "a relisted Particular listing is a new copy that goes to review", async () => {
    assert.ok(submitted, "LIST-003 created nothing");
    const copy = await manage(sellerCookie, submitted.id, { action: "relist" });
    assert.equal(copy.status, 200, copy.body?.message);
    created.listings.push(copy.body.id);
    assert.notEqual(copy.body.id, submitted.id);
    const sent = await manage(sellerCookie, copy.body.id, { action: "resubmit" });
    assert.equal(sent.status, 200, sent.body?.message);
    assert.equal((await listing(copy.body.id, "status")).status, "pending");
    assert.equal((await listing(submitted.id, "status")).status, "sold");
  });

  for (const [id, owner, store, expected] of [["LIFE-011", storeOwner, normalStore, "pending"], ["LIFE-012", verifiedOwner, verifiedStore, "approved"]]) {
    await check(id, `a relisted ${store.is_verified ? "Tienda Verificada" : "Tienda"} listing goes ${expected === "approved" ? "straight to the catalog" : "to review"}`, async () => {
      const now = new Date().toISOString();
      const soldRow = await insertListing(listingRow(owner, { title: `QA Gate ${tag} ${store.is_verified ? "verificada" : "tienda"} vendida`, seller_type: "store", store_id: store.id, status: "sold", sold_at: now }));
      const cookie = await login(owner);
      const copy = await manage(cookie, soldRow.id, { action: "relist" });
      assert.equal(copy.status, 200, copy.body?.message);
      created.listings.push(copy.body.id);
      const sent = await manage(cookie, copy.body.id, { action: "resubmit" });
      assert.equal(sent.status, 200, sent.body?.message);
      const row = await listing(copy.body.id, "status,store_id,published_at");
      assert.equal(row.status, expected);
      assert.equal(row.store_id, store.id);
      if (expected === "approved") assert.ok(row.published_at, "no publication time");
      return `the copy is ${expected}`;
    });
  }

  // -------------------------------------------------------------------------------------- WhatsApp and buyers
  await check("WA-008", "only a signed-in contact makes a buyer selectable when the listing is sold", async () => {
    const forSale = await insertListing(listingRow(seller, { title: `QA Gate ${tag} contactos` }));
    const otherCookie = await login(other);
    const first = await contact(buyerCookie, forSale.id);
    await contact(buyerCookie, forSale.id);
    await contact(null, forSale.id);
    await contact(otherCookie, market.id);
    assert.ok(first.url.startsWith("https://wa.me/"), "contact doesn't open WhatsApp");
    const sold = await manage(sellerCookie, forSale.id, { action: "sold" });
    assert.equal(sold.status, 200, sold.body?.message);
    const eligible = await sellerClient.rpc("get_eligible_transaction_buyers", { p_listing_id: forSale.id });
    assert.equal(eligible.error, null, eligible.error?.message);
    const buyers = eligible.data.map((candidate) => candidate.buyer_user_id);
    const events = await service.from("marketplace_events").select("actor_user_id").eq("listing_id", forSale.id).eq("event_type", "whatsapp_contact");
    const anonymous = events.data.filter((event) => event.actor_user_id === null).length;
    const fromBuyer = events.data.filter((event) => event.actor_user_id === buyer.id).length;
    wa = { buyers, anonymous, fromBuyer };
    assert.deepEqual(buyers, [buyer.id]);
    assert.ok(anonymous >= 1, "the signed-out contact wasn't recorded");
    return `${events.data.length} contacts recorded, ${anonymous} signed out; one selectable buyer`;
  });

  await check("WA-009", "a signed-in account that never contacted the listing isn't selectable", async () => {
    assert.ok(wa, "WA-008 didn't run");
    assert.ok(!wa.buyers.includes(other.id), "an unrelated account is selectable");
    assert.ok(!wa.buyers.includes(seller.id), "the seller is selectable");
    return "the account that contacted another listing isn't offered";
  });

  await check("WA-010", "a buyer who contacted twice appears once", async () => {
    assert.ok(wa, "WA-008 didn't run");
    assert.equal(wa.buyers.filter((id) => id === buyer.id).length, 1);
    return `${wa.fromBuyer} contact events from the buyer, one candidate`;
  });

  // ------------------------------------------------------------------------------------------------- the store
  await check("SDASH-002", "a store owner changes the business and contact details; Admin's fields stay locked", async () => {
    const client = await browserClient(storeOwner);
    // The store form's write (components/store-registration-form.tsx).
    const changes = {
      description: `Tienda de la corrida ${tag}: guitarras, amplificadores y pedales revisados.`,
      contact_person: `QA Encargada ${tag}`,
      whatsapp_phone: phone(),
      opening_hours: "Lunes a sábado, 10:00 a 19:00",
      instagram_url: "https://www.instagram.com/qagate",
      facebook_url: "https://www.facebook.com/qagate",
      tiktok_url: "https://www.tiktok.com/@qagate",
      website_url: "https://qa-gate.example",
    };
    const saved = await client.from("stores").update(changes).eq("id", normalStore.id);
    assert.equal(saved.error, null, saved.error?.message);
    const row = (await service.from("stores").select(Object.keys(changes).join(",")).eq("id", normalStore.id).single()).data;
    assert.deepEqual(row, changes);
    const locked = [{ is_verified: true }, { status: "rejected" }, { listing_plan: "growth_50" }, { slug: `otra-${tag}` }, { owner_user_id: other.id }];
    for (const change of locked) {
      const refused = await client.from("stores").update(change).eq("id", normalStore.id);
      assert.ok(refused.error, `${Object.keys(change)[0]} changed`);
    }
    const foreign = await client.from("stores").update({ description: "Cambio ajeno" }).eq("id", verifiedStore.id).select("id");
    assert.ok(foreign.error || !foreign.data?.length, "the owner changed another store");
    const protectedRow = (await service.from("stores").select("is_verified,status,listing_plan,slug,owner_user_id").eq("id", normalStore.id).single()).data;
    assert.deepEqual(protectedRow, { is_verified: false, status: "active", listing_plan: "free", slug: normalStore.slug, owner_user_id: storeOwner.id });
    const page = await pageText(`/tiendas/${normalStore.slug}`);
    assert.ok(page.includes(changes.description), "the store page doesn't show the new description");
    return `${locked.length} protected fields refused; the store page shows the change`;
  });

  await check("SDASH-003", "a store owner sets the logo, banner and shop photos, and only from its own folder", async () => {
    const client = await browserClient(storeOwner);
    const folder = `${storeOwner.id}/${normalStore.id}`;
    const uploaded = {};
    for (const name of ["logo", "banner", "photo"]) {
      const path = `${folder}/profile-${Date.now()}-${name}.png`;
      const { error } = await client.storage.from("store-assets").upload(path, png, { contentType: "image/png" });
      assert.equal(error, null, error?.message);
      created.uploads.push({ bucket: "store-assets", path });
      uploaded[name] = client.storage.from("store-assets").getPublicUrl(path).data.publicUrl;
    }
    const saved = await client.from("stores").update({ logo_url: uploaded.logo, banner_url: uploaded.banner }).eq("id", normalStore.id);
    assert.equal(saved.error, null, saved.error?.message);
    const photo = await client.from("store_photos").insert({ store_id: normalStore.id, image_url: uploaded.photo, alt_text: "Foto del local", sort_order: 0 }).select("id").single();
    assert.equal(photo.error, null, photo.error?.message);
    const row = (await service.from("stores").select("logo_url,banner_url").eq("id", normalStore.id).single()).data;
    assert.deepEqual(row, { logo_url: uploaded.logo, banner_url: uploaded.banner });
    const outside = await client.from("stores").update({ logo_url: "https://evil.example/logo.png" }).eq("id", normalStore.id);
    assert.match(outside.error?.message ?? "", /STORE_IMAGE_URL_INVALID/, "an outside image was accepted");
    const removed = await client.from("store_photos").delete().eq("id", photo.data.id).select("id");
    assert.equal(removed.error, null, removed.error?.message);
    assert.equal((await service.from("store_photos").select("id").eq("id", photo.data.id)).data.length, 0, "the photo wasn't removed");
    return "logo, banner and a shop photo saved, the photo removed; an outside image refused; social links saved in SDASH-002";
  });

  // ----------------------------------------------------------------------------- one account, buying and selling
  await check("AUTH-016", "one Particular account saves favorites and alerts, contacts sellers and publishes", async () => {
    const favorite = await post("/api/favorites", { action: "set", id: market.id, saved: true }, { cookie: sellerCookie });
    assert.equal(favorite.status, 200, favorite.body?.message);
    const alert = await post("/api/alerts", { action: "create", filters: { category: "guitars", brand: `Marca ${tag}` }, frequency: "daily" }, { cookie: sellerCookie });
    assert.equal(alert.status, 200, alert.body?.message);
    const answer = await contact(sellerCookie, market.id);
    assert.ok(answer.url.startsWith("https://wa.me/"));
    const events = await service.from("marketplace_events").select("id").eq("listing_id", market.id).eq("actor_user_id", seller.id).eq("event_type", "whatsapp_contact");
    assert.ok(events.data.length >= 1, "the contact wasn't recorded for the account");
    assert.ok((await pageText("/mi-cuenta/favoritos", sellerCookie)).includes(market.title), "the favorite isn't listed");
    const own = await service.from("listings").select("id").eq("owner_user_id", seller.id);
    assert.ok(own.data.length >= 3, "the account has no listings of its own");
    return `the same account: 1 favorite, 1 alert, 1 contact and ${own.data.length} own listings`;
  });

  await check("AUTH-009", "signing out ends the session: account pages go to sign-in and the old session can't be renewed", async () => {
    const user = await account("logout");
    const jar = keepCookies(new Map(), await app("/api/auth/login", { method: "POST", body: { email: user.email, password: user.password } }));
    assert.equal((await app("/mi-cuenta", { cookie: cookieHeader(jar) })).status, 200);
    const refreshToken = sessionFromCookies(jar)?.refresh_token;
    assert.ok(refreshToken, "no session in the cookies");
    assert.equal((await app("/logout")).status, 405, "a GET signs out");
    const out = await app("/logout", { method: "POST", cookie: cookieHeader(jar), headers: { Origin: base } });
    assert.equal(out.status, 303);
    assert.equal(location(out).pathname, "/login");
    keepCookies(jar, out);
    assert.equal([...jar.keys()].filter((name) => name.startsWith("sb-")).length, 0, "the session cookies remain");
    const after = await app("/mi-cuenta", { cookie: cookieHeader(jar) });
    assert.equal(after.status, 307);
    assert.equal(location(after).pathname, "/login");
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const renewed = await anon.auth.refreshSession({ refresh_token: refreshToken });
    assert.ok(renewed.error, "the old session was renewed");
    return `cookies cleared, /mi-cuenta goes to /login; renewing the old session: "${renewed.error.message}"`;
  });

  // ------------------------------------------------------------------------------------ scope, signed in
  await check("SCOPE-001", "account pages offer no checkout or payment step", async () => {
    for (const [page] of await accountPages()) assert.doesNotMatch(page.text, CHECKOUT, page.name);
    return "account home, publishing form, my listings, favorites and the store page";
  });

  await check("SCOPE-003", "account pages offer no shipping step", async () => {
    for (const [page] of await accountPages()) assert.doesNotMatch(page.text, SHIPPING_WORKFLOW, page.name);
  });

  await check("SCOPE-004", "account pages charge no commission", async () => {
    for (const [page] of await accountPages()) {
      for (const sentence of sentencesWith(page.text, /comisi[oó]n(es)?/i)) assert.match(sentence, /\bno\b|\bni\b|\bsin\b/i, `${page.name}: "${sentence}"`);
    }
  });

  await check("SCOPE-005", "account pages sell no plan, subscription or boost", async () => {
    for (const [page] of await accountPages()) assert.doesNotMatch(page.text, PAID_PROMOTION, page.name);
  });

  await check("SCOPE-006", "account pages have no internal chat; contact opens WhatsApp", async () => {
    for (const [page] of await accountPages()) {
      assert.doesNotMatch(page.text, CHAT_FEATURE, page.name);
      assert.doesNotMatch(page.html, CHAT_LINK, page.name);
    }
    return "WhatsApp links checked in WA-008, LIST-015 and LIST-018";
  });

  await check("LEGAL-006", "account pages promise no guarantee", async () => {
    for (const [page] of await accountPages()) assert.doesNotMatch(page.text, GUARANTEE, page.name);
  });

})()
  .catch((error) => report(`FAIL SETUP the run stopped: ${error?.stack ?? error}`))
  .finally(async () => {
    await cleanup().catch((error) => console.log(`cleanup: ${error.message}`));
    const failed = results.filter((line) => line.startsWith("FAIL"));
    console.log(`${results.length - failed.length} of ${results.length} release-gate checks passed`);
    process.exitCode = failed.length ? 1 : 0;
  });


function sessionFromCookies(jar) {
  const name = [...jar.keys()].find((key) => /^sb-.+-auth-token(\.0)?$/.test(key));
  if (!name) return null;
  const prefix = name.replace(/\.0$/, "");
  const raw = jar.has(prefix) ? jar.get(prefix) : [...jar].filter(([key]) => key.startsWith(`${prefix}.`)).sort(([a], [b]) => Number(a.split(".").pop()) - Number(b.split(".").pop())).map(([, value]) => value).join("");
  const value = decodeURIComponent(raw);
  return JSON.parse(value.startsWith("base64-") ? Buffer.from(value.slice(7), "base64url").toString("utf8") : value);
}

// Everything the run made, newest first: listings (with the copies and revisions the app made), stores, uploads and
// the accounts. The stack is thrown away after the run; this keeps a reused stack clean.
async function cleanup() {
  const leftovers = [];
  const owned = created.users.length ? (await service.from("listings").select("id").in("owner_user_id", created.users)).data ?? [] : [];
  const listingIds = [...new Set([...created.listings, ...owned.map((row) => row.id)])];
  if (created.users.length) await service.from("marketplace_events").delete().in("actor_user_id", created.users);
  if (listingIds.length) {
    await service.from("marketplace_events").delete().in("listing_id", listingIds);
    const revisions = (await service.from("listing_revisions").select("id").in("listing_id", listingIds)).data ?? [];
    if (revisions.length) await service.from("listing_revision_photos").delete().in("revision_id", revisions.map((row) => row.id));
    await service.from("listing_revisions").delete().in("listing_id", listingIds);
    const removed = await service.from("listings").delete().in("id", listingIds);
    if (removed.error) leftovers.push(`listings: ${removed.error.message}`);
  }
  for (const id of created.stores) {
    await service.from("store_photos").delete().eq("store_id", id);
    const removed = await service.from("stores").delete().eq("id", id);
    if (removed.error) leftovers.push(`store: ${removed.error.message}`);
  }
  for (const bucket of ["listing-photos", "store-assets"]) {
    const paths = created.uploads.filter((upload) => upload.bucket === bucket).map((upload) => upload.path);
    if (paths.length) await service.storage.from(bucket).remove(paths);
  }
  for (const id of created.users) {
    let error = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      ({ error } = await service.auth.admin.deleteUser(id));
      if (!error) break;
      await sleep(500);
    }
    if (error) leftovers.push(`account ${id}: ${error.message}`);
  }
  console.log(leftovers.length ? `cleanup left: ${leftovers.join("; ")}` : "cleanup: every account, listing, store and upload of this run removed");
}
