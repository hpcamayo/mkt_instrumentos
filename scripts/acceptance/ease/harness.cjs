// Effortless Laria acceptance run (EASE-001 to EASE-882 in acceptance/cases.tsv): shared helpers for the browser checks.
//
// Local (default): a stack of main on this machine (scripts/prototype/README.md, without Docker): Postgres on :54322,
// the gateway on :54321, `next start` on BASE (http://localhost:3000). The helpers that write (account, store,
// listing, exec) create their own rows with @laria.test addresses, so the checks never depend on each other's data.
//
// Live (LIVE=1, BASE=https://laria.audio): only the cases marked `live` run, signed out. Every request that is not a
// GET or HEAD is refused before it leaves the browser (views, contacts, impressions and forms included), WhatsApp never
// opens, service workers are blocked, nothing signs in, the database helpers refuse to run, page loads are spaced three
// seconds apart and /listados and the catalog page route stay under 20 requests a minute (the firewall allows 30).
//
// Live with throwaway accounts (LIVE=1 LIVE_ACCOUNTS=1): the signed-in cases instead, on the real site with accounts of
// the run only; the database helpers go through live.cjs, which also keeps the run to its own data and removes it. A
// case that needs what only the local copy has (the demo accounts, the job secret, an Admin sign-in) stops as Not Run.
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { LocalOnly, LiveUnsafe } = require("./errors.cjs");

const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
const PILOT_BASE = (process.env.PILOT_BASE || "http://localhost:3200").replace(/\/$/, "");
const AI_BASE = (process.env.AI_BASE || "http://localhost:3100").replace(/\/$/, "");
const LIVE = process.env.LIVE === "1";
const LIVE_ACCOUNTS = LIVE && process.env.LIVE_ACCOUNTS === "1";
const live = LIVE_ACCOUNTS ? require("./live.cjs") : null;
const OUT = process.env.OUT || "/mnt/project-files/ux-ideas/acceptance-run/screens";
const PG = process.env.PGURL || "postgresql://postgres@127.0.0.1:54322/postgres";
const PHOTOS = process.env.PHOTO_DIR || "/tmp/laria-prototype/storage/listing-photos/descubrir";
const PHOTO_BASE = process.env.PHOTO_BASE || "http://127.0.0.1:54321/storage/v1/object/public/listing-photos/descubrir";
const CRON_SECRET = process.env.CRON_SECRET || "local-cron-secret";
const PASSWORD = live ? live.PASSWORD : "laria-demo-2026";
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const DEMO_SEED = {
  store: "demo-tienda@laria.test",
  admin: "admin@laria.test",
  buyer: "comprador@laria.test",
  particular: "particular@laria.test",
  storeId: "d1000000-0000-4000-8000-000000000001",
  storeSlug: "laria-demo-musica",
};
// The live site has none of the demo accounts. With throwaway accounts, the Admin's e-mail stands for the run's own
// account that Admin SQL is run as (live.actorId); everything else of the demo stops the case as local only.
const DEMO = LIVE
  ? new Proxy(DEMO_SEED, {
    get(target, key) {
      if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(target, key)) return target[key];
      if (key === "admin" && live) return live.actorEmail();
      throw new LocalOnly(`uses the demo ${key}, which only the local copy has`);
    },
  })
  : DEMO_SEED;
const WHATSAPP = /(^|\.)(wa\.me|whatsapp\.com)$/i;

function loadPlaywright() {
  for (const name of ["playwright", "playwright-core"]) {
    try {
      return require(name);
    } catch {}
  }
  throw new Error("playwright or playwright-core is needed (set NODE_PATH)");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ------------------------------------------------------------------ live pacing
const pace = { navigation: 0, catalog: [] };
async function paceNavigation() {
  if (!LIVE) return;
  const wait = pace.navigation + 3000 - Date.now();
  if (wait > 0) await sleep(wait);
  pace.navigation = Date.now();
}
async function paceCatalog() {
  for (;;) {
    const now = Date.now();
    pace.catalog = pace.catalog.filter((at) => now - at < 60_000);
    if (pace.catalog.length < 20) {
      pace.catalog.push(now);
      return;
    }
    await sleep(60_000 - (now - pace.catalog[0]) + 50);
  }
}

// ------------------------------------------------------------------ database (local, or live.cjs with throwaway accounts)
function refuseLive(what) {
  if (LIVE && !LIVE_ACCOUNTS) throw new LocalOnly(`${what} needs the database, which signed-out live checks never use`);
}
const literal = (value) => (value === null || value === undefined ? "null" : `'${String(value).replace(/'/g, "''")}'`);

// Rows of a query as objects.
function sql(query) {
  refuseLive("sql");
  if (live) return live.rows(query);
  const out = execFileSync("psql", [PG, "-At", "-v", "ON_ERROR_STOP=1", "-c", `select coalesce(json_agg(q), '[]'::json) from (${query}) q`], { encoding: "utf8" });
  return JSON.parse(out.trim() || "[]");
}
// Statements, in one transaction, with the listing admin fields allowed (published_at and the like, as the seeds do).
function exec(statements) {
  refuseLive("exec");
  if (live) return live.exec(statements);
  execFileSync("psql", [PG, "-v", "ON_ERROR_STOP=1", "-q", "-o", "/dev/null", "-c",
    `begin; select set_config('app.allow_listing_admin_fields', 'true', true); ${statements}; commit;`], { encoding: "utf8" });
}
// Run a function as a signed-in user (or anon with userId null), the way the SQL suites do. Returns the rows.
function sqlAs(userId, query, { admin = false } = {}) {
  refuseLive("sqlAs");
  if (live) return live.rowsAs(userId, query, { admin });
  const claims = userId
    ? { sub: userId, role: "authenticated", aal: "aal2", ...(admin ? { app_metadata: { role: "admin" } } : {}) }
    : { role: "anon" };
  const role = userId ? "authenticated" : "anon";
  const out = execFileSync("psql", [PG, "-At", "-v", "ON_ERROR_STOP=1", "-c",
    `begin; set local role ${role}; select set_config('request.jwt.claims', ${literal(JSON.stringify(claims))}, true); ` +
    `select coalesce(jsonb_agg(q), '[]'::jsonb) from (${query}) q; commit;`], { encoding: "utf8" });
  const line = out.split("\n").find((row) => row.startsWith("[")) || "[]";
  return JSON.parse(line);
}

let sequence = 0;
const tag = () => `${process.pid.toString(36)}${Date.now().toString(36)}${(sequence++).toString(36)}`;
const slugify = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

// A new account: kind buyer (name and e-mail only), particular (with WhatsApp and city), store_owner or admin.
function account({ kind = "buyer", name, phone, city = "Lima", region = "Lima" } = {}) {
  refuseLive("account");
  if (live) return live.account({ kind, name, phone, city, region });
  const id = crypto.randomUUID();
  const label = tag();
  const email = `ease-${label}@laria.test`;
  const fullName = name || `Prueba ${label.slice(-4)}`;
  const meta = { account_type: kind === "store_owner" ? "store_owner" : "seller", full_name: fullName };
  const whatsapp = phone || `519${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;
  if (kind !== "buyer") Object.assign(meta, { phone: whatsapp, city, region });
  const app = { provider: "email", providers: ["email"], ...(kind === "admin" ? { role: "admin" } : {}) };
  exec(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', ${literal(id)}, 'authenticated', 'authenticated', ${literal(email)},
      extensions.crypt(${literal(PASSWORD)}, extensions.gen_salt('bf')), now(), ${literal(JSON.stringify(app))},
      ${literal(JSON.stringify(meta))}, '', '', now(), now())`);
  return { id, email, name: fullName, phone: kind === "buyer" ? null : whatsapp, city };
}

// A store for an owner account. verified: Tienda verificada; inventory: Inventario on (as Admin turns it on).
function store(owner, { name, verified = true, status = "active", inventory = false, city = "Lima", district = "Miraflores",
  address = "Av. Prueba 123", showAddress = false, plan = "growth_50" } = {}) {
  const id = crypto.randomUUID();
  const storeName = name || `Tienda Prueba ${tag().slice(-5)}`;
  const slug = `${slugify(storeName)}-${tag().slice(-4)}`;
  const ruc = `20${String(Math.floor(100_000_000 + Math.random() * 899_999_999))}`;
  exec(`insert into public.stores (id, slug, name, razon_social, ruc, email, contact_person, contact_name, whatsapp_phone,
      city, district, region, address, description, owner_user_id, status, listing_plan, is_verified, show_address)
    values (${literal(id)}, ${literal(slug)}, ${literal(storeName)}, ${literal(`${storeName} SAC`)}, ${literal(ruc)},
      ${literal(owner.email)}, ${literal(owner.name)}, ${literal(owner.name)}, ${literal(owner.phone || (live ? live.PHONE : "51999000199"))},
      ${literal(city)}, ${literal(district)}, ${literal(city)}, ${literal(address)},
      'Tienda de prueba para la aceptación.', ${literal(owner.id)}, ${literal(status)}, ${literal(plan)}, ${verified}, ${showAddress})`);
  if (inventory) {
    const adminId = live ? live.actorId() : sql(`select id from auth.users where email = ${literal(DEMO.admin)}`)[0].id;
    sqlAs(adminId, `select public.admin_set_store_inventory_enabled(${literal(id)}, true, 'Aceptación EASE') as ok`, { admin: true });
  }
  return { id, slug, name: storeName, ruc };
}

const photoFiles = () => fs.readdirSync(PHOTOS).filter((name) => name.endsWith(".jpg")).sort();

// A listing with photos. seller: an account from account(); for a store listing pass storeRow (from store()) too.
// publishedDaysAgo sets published_at and created_at; status approved, pending, rejected, sold, hidden, draft ...
function listing(seller, { storeRow = null, status = "approved", title, category = "guitars", type = "electric_guitar",
  brand = "Fender", model = "Player Stratocaster", condition = "Usado - buen estado", price = 1500, city = "Lima",
  region = "Lima", photos = 2, publishedDaysAgo = 0, attributes = {}, description, extra = {} } = {}) {
  const id = crypto.randomUUID();
  const listingTitle = title || `${brand} ${model} ${tag().slice(-4)}`;
  const slug = `${slugify(listingTitle)}-${tag().slice(-5)}`;
  const at = `now() - make_interval(days => ${Number(publishedDaysAgo)})`;
  const columns = {
    id, slug, title: listingTitle, seller_type: storeRow ? "store" : "individual", status, category,
    instrument_type: type, brand, model, condition, price_pen: price, city, region,
    contact_name: seller.name, whatsapp_phone: seller.phone || (live ? live.PHONE : "51999000198"),
    description: description || `${listingTitle}. Publicación de prueba para la aceptación, en buen estado y lista para tocar.`,
    owner_user_id: seller.id, store_id: storeRow ? storeRow.id : null, created_by_source: "self_service",
    attributes: JSON.stringify(attributes), ...extra,
  };
  const names = Object.keys(columns);
  const values = names.map((name) => literal(columns[name]));
  exec(`insert into public.listings (${names.join(", ")}, marketplace_rules_accepted_at, published_at, created_at)
    values (${values.join(", ")}, now(), ${status === "approved" || status === "sold" ? at : "null"}, ${at})`);
  if (photos > 0) {
    // Live: uploaded to Storage as the seller; local: the stack's sample photos.
    const files = live ? null : photoFiles();
    const start = live ? 0 : Math.floor(Math.random() * files.length);
    const urls = live ? live.photoUrls(seller, photos)
      : Array.from({ length: photos }, (_, n) => `${PHOTO_BASE}/${files[(start + n) % files.length]}`);
    const rows = urls.map((url, n) => `(${literal(id)}, ${literal(url)}, ${literal(`Foto ${n + 1} de ${listingTitle}`)}, ${n})`);
    exec(`insert into public.listing_photos (listing_id, image_url, alt_text, sort_order) values ${rows.join(", ")}`);
  }
  return { id, slug, title: listingTitle, price, path: `/instrumentos/${slug}` };
}

const emails = (where = "true") => sql(`select * from laria_private.marketplace_email_deliveries where ${where} order by created_at`);
const notifications = (userId) => sql(`select * from public.notifications where user_id = ${literal(userId)} order by created_at`);

// The internal job routes (e-mail and push workers and the like), as the schedule calls them.
async function cron(route, { base = BASE, method = "POST" } = {}) {
  if (LIVE) throw new LocalOnly("needs the job secret, which only the local copy has");
  const response = await fetch(`${base}${route}`, { method, headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  return { status: response.status, body: await response.text() };
}

// RFC 6238 code for an authenticator secret (base32), as an authenticator app shows it.
function totp(secret, at = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.replace(/[=\s]/g, "").toUpperCase()].map((c) => alphabet.indexOf(c)).filter((v) => v >= 0)
    .map((v) => v.toString(2).padStart(5, "0")).join("");
  const key = Buffer.from((bits.match(/.{8}/g) || []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = crypto.createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

function axePath() {
  if (process.env.AXE) return process.env.AXE;
  const store = path.join(__dirname, "..", "..", "..", "node_modules", ".pnpm");
  const folder = fs.existsSync(store) ? fs.readdirSync(store).filter((name) => name.startsWith("axe-core@")).sort().pop() : null;
  if (!folder) throw new Error("axe-core not found; set AXE to axe.min.js");
  return path.join(store, folder, "node_modules", "axe-core", "axe.min.js");
}

module.exports = {
  BASE, PILOT_BASE, AI_BASE, LIVE, LIVE_ACCOUNTS, live, LocalOnly, LiveUnsafe, OUT, PG, PASSWORD, DEMO, WCAG, CRON_SECRET, WHATSAPP,
  loadPlaywright, sleep, paceNavigation, paceCatalog, literal, sql, exec, sqlAs, account, store, listing, emails,
  notifications, cron, totp, axePath, slugify, tag,
};
