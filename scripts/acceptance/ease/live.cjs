// Live checks with throwaway accounts on the real site: LIVE=1 LIVE_ACCOUNTS=1 BASE=https://laria.audio, run from
// Henri's Mac under his approval line (README.md here). The accounts are delivered+ease-<run>-<n>@resend.dev, Resend's
// test inbox, made straight in Auth (no sign-up e-mail) with a password made for the run and kept in memory only.
// The run keeps to its own data:
// - guardRequest refuses, before it leaves the browser, a write that names a listing, store, account or question that
//   is not the run's (a favorite, offer, question or report on someone else's listing), and any Libro de
//   Reclamaciones entry; view counters and analytics about other people's listings are dropped quietly;
// - exec refuses to commit when a real buyer's saved-search alert would match one of the run's public listings (the
//   alert's notice and e-mail roll back with it);
// - every few seconds the fence cancels queued e-mails and push notices of the run's accounts and about the run's
//   listings and stores, so they reach nobody and don't spend the daily sending allowance;
// - after each case its listings and stores are deleted (afterCase), and finish() deletes the accounts and everything
//   they made, then counts what is left, which must be nothing.
// The database is reached through LIVE_DB (default live-db.sh: SQL on stdin, the JSON text of the last statement's
// first column on stdout), on Henri's Mac `supabase db query --linked`.
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFile, execFileSync } = require("node:child_process");
const { LocalOnly, LiveUnsafe } = require("./errors.cjs");

const RUN = (process.env.LIVE_RUN || `r${Date.now().toString(36)}`).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
const PASSWORD = process.env.LIVE_PASSWORD || `Ease-${crypto.randomBytes(18).toString("base64url")}`;
const DB = process.env.LIVE_DB || path.join(__dirname, "live-db.sh");
const PHONE = process.env.LIVE_PHONE || "51999000198";
const PHOTO_DIR = process.env.LIVE_PHOTO_DIR || path.join(__dirname, "..", "..", "prototype", "samples", "01-catalogo-nuevo", "fotos");
// LIKE patterns over auth.users.email: the accounts of any run (never a real person's) and of this run.
const ANY_RUN = "delivered+ease-%@resend.dev";
const THIS_RUN = `delivered+ease-${RUN}-%@resend.dev`;
// Supabase Auth allows 30 password sign-ins per 5 minutes from one address; the run keeps well under it.
const SIGN_INS = { limit: Number(process.env.LIVE_SIGN_INS || 20), window: 5 * 60_000, at: [] };

const literal = (value) => (value === null || value === undefined ? "null" : `'${String(value).replace(/'/g, "''")}'`);
const sleepSync = (ms) => { if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// ------------------------------------------------------------------ database
function failure(error) {
  const detail = `${error.stderr || ""} ${error.stdout || ""} ${error.message || ""}`.replace(/\s+/g, " ").trim();
  if (detail.includes("LIVE_UNSAFE_ALERT")) {
    return new LiveUnsafe("a real buyer's saved-search alert would match a test listing, so it was not published");
  }
  return new Error(`live database: ${detail.slice(0, 900)}`);
}
function run(text) {
  try {
    return execFileSync(DB, [], { input: text, encoding: "utf8", maxBuffer: 64 << 20, timeout: 180_000, stdio: ["pipe", "pipe", "pipe"] });
  } catch (error) {
    throw failure(error);
  }
}
function runAsync(text) {
  return new Promise((resolve, reject) => {
    const child = execFile(DB, [], { encoding: "utf8", maxBuffer: 64 << 20, timeout: 180_000 }, (error, stdout, stderr) =>
      (error ? reject(failure(Object.assign(error, { stdout, stderr }))) : resolve(stdout)));
    child.stdin.end(text);
  });
}
// The JSON the wrapper printed: the last line that parses, unwrapping the CLI's own row objects if it printed those.
function parse(out) {
  const text = String(out).trim();
  for (const line of [text, ...text.split("\n").reverse()].map((value) => value.trim())) {
    if (!/^[[{]/.test(line)) continue;
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    const only = Array.isArray(value) && value.length === 1 ? value[0] : value;
    if (only && typeof only === "object" && !Array.isArray(only) && Object.keys(only).length === 1 && typeof only.result === "string") {
      return JSON.parse(only.result);
    }
    return value;
  }
  throw new Error(`live database: no JSON in the answer (${text.slice(0, 300)})`);
}
// jsonb prints on one line, which the wrappers rely on (json_agg breaks lines between rows).
const wrap = (query) => `select coalesce(jsonb_agg(q), '[]'::jsonb)::text as result from (${query}) q`;
const rows = (query) => parse(run(wrap(query)));
const rowsAsync = async (query) => parse(await runAsync(wrap(query)));

const RUN_USERS = `(select id from auth.users where email like ${literal(ANY_RUN)})`;
const RUN_STORES = `(select id from public.stores where owner_user_id in ${RUN_USERS})`;
const RUN_LISTINGS = `(select id from public.listings where owner_user_id in ${RUN_USERS} or store_id in ${RUN_STORES})`;

// Raised inside the transaction that would make a test listing public: the trigger's alert notices roll back with it.
const ALERT_GUARD = `do $guard$ begin
  if exists (
    select 1 from public.listings l
    join public.saved_search_alerts a on a.status = 'active' and a.deleted_at is null
      and a.match_bucket in ('all', 'category:' || l.category, 'type:' || coalesce(l.instrument_type, ''))
    where l.id in ${RUN_LISTINGS}
      and a.user_id not in ${RUN_USERS}
      and public.listing_is_public(l.id)
      and laria_private.listing_matches_saved_search(l, a.search_filters)
  ) then raise exception 'LIVE_UNSAFE_ALERT'; end if;
end $guard$`;

function exec(statements) {
  run(`begin; select set_config('app.allow_listing_admin_fields', 'true', true); ${statements}; ${ALERT_GUARD}; commit;`);
}
// As a signed-in user, the way PostgREST runs a request. Admin claims belong to a test account of the run (an Admin
// account is never made); a call that could publish is refused first if any test listing would match a real alert.
function rowsAs(userId, query, { admin = false } = {}) {
  const claims = userId
    ? { sub: userId, role: "authenticated", aal: "aal2", ...(admin ? { app_metadata: { role: "admin" } } : {}) }
    : { role: "anon" };
  if (alertMatches({ anyStatus: true })) {
    throw new LiveUnsafe("a real buyer's saved-search alert would match a test listing, so nothing that could publish it ran");
  }
  // Session-level settings: each call is a session of its own, and the query must be the script's last statement.
  return parse(run(`select set_config('request.jwt.claims', ${literal(JSON.stringify(claims))}, false);
    set role ${userId ? "authenticated" : "anon"};
    ${wrap(query)};`));
}
// Real alerts a test listing matches (or would match once public, with anyStatus).
function alertMatches({ anyStatus = false } = {}) {
  const [row] = rows(`select count(*)::int as n from public.listings l
    join public.saved_search_alerts a on a.status = 'active' and a.deleted_at is null
      and a.match_bucket in ('all', 'category:' || l.category, 'type:' || coalesce(l.instrument_type, ''))
    where l.id in ${RUN_LISTINGS} and a.user_id not in ${RUN_USERS}
      ${anyStatus ? "" : "and public.listing_is_public(l.id)"}
      and laria_private.listing_matches_saved_search(l, a.search_filters)`);
  return row.n;
}

// ------------------------------------------------------------------ accounts
const accounts = [];
let currentCase = null;
let count = 0;
let actor = null;
let shape = null;

function authShape() {
  if (!shape) {
    const columns = rows(`select table_name, column_name, data_type, is_generated from information_schema.columns
      where table_schema = 'auth' and table_name in ('users', 'identities')`);
    shape = { users: columns.filter((c) => c.table_name === "users"), identities: columns.filter((c) => c.table_name === "identities") };
  }
  return shape;
}

// Same kinds and return value as harness.account. No Admin: an Admin account is never made on the live site.
function account({ kind = "buyer", name, phone, city = "Lima", region = "Lima" } = {}) {
  if (kind === "admin") throw new LocalOnly("needs an Admin account, which is never made on the live site");
  const { users, identities } = authShape();
  const id = crypto.randomUUID();
  count += 1;
  const email = `delivered+ease-${RUN}-${count}@resend.dev`;
  const fullName = name || `Prueba EASE ${count}`;
  const whatsapp = phone || PHONE;
  const meta = { account_type: kind === "store_owner" ? "store_owner" : "seller", full_name: fullName };
  if (kind !== "buyer") Object.assign(meta, { phone: whatsapp, city, region });
  const values = {
    instance_id: literal("00000000-0000-0000-0000-000000000000"), id: literal(id), aud: "'authenticated'", role: "'authenticated'",
    email: literal(email), encrypted_password: `extensions.crypt(${literal(PASSWORD)}, extensions.gen_salt('bf'))`,
    email_confirmed_at: "now()", raw_app_meta_data: literal(JSON.stringify({ provider: "email", providers: ["email"] })),
    raw_user_meta_data: literal(JSON.stringify(meta)), created_at: "now()", updated_at: "now()",
  };
  // Auth reads these as strings: a NULL there makes its sign-in fail ("Database error querying schema").
  for (const column of users) {
    if (column.is_generated === "ALWAYS" || column.column_name in values) continue;
    if (/^(character varying|text)$/.test(column.data_type) && /(token|^email_change$|^phone_change$)/.test(column.column_name)) {
      values[column.column_name] = "''";
    }
  }
  const has = (list, name) => list.some((column) => column.column_name === name && column.is_generated !== "ALWAYS");
  const userColumns = Object.keys(values).filter((name) => has(users, name));
  let statements = `insert into auth.users (${userColumns.join(", ")}) values (${userColumns.map((name) => values[name]).join(", ")})`;
  if (identities.length) {
    const idColumn = identities.find((column) => column.column_name === "id");
    const identity = {
      id: idColumn && idColumn.data_type === "uuid" ? "gen_random_uuid()" : literal(id), user_id: literal(id), provider_id: literal(id),
      provider: "'email'", identity_data: literal(JSON.stringify({ sub: id, email, email_verified: true, phone_verified: false })),
      last_sign_in_at: "now()", created_at: "now()", updated_at: "now()",
    };
    const identityColumns = Object.keys(identity).filter((name) => has(identities, name));
    statements += `; insert into auth.identities (${identityColumns.join(", ")}) values (${identityColumns.map((name) => identity[name]).join(", ")})`;
  }
  exec(statements);
  accounts.push({ id, email, kind, caseId: currentCase });
  return { id, email, name: fullName, phone: kind === "buyer" ? null : whatsapp, city };
}

// The account Admin claims are made for (store inventory switched on and the like): one of the run's own. It never
// signs in, since Admin pages need an Admin sign-in, which the live run never has.
function actorId() {
  if (!actor) actor = account({ kind: "particular", name: "Prueba EASE Admin" });
  return actor.id;
}
function actorEmail() {
  actorId();
  return actor.email;
}
const isActor = (email) => Boolean(actor && email === actor.email);

// ------------------------------------------------------------------ sign-ins and photos
const supabase = { origin: process.env.LIVE_SUPABASE_URL || null, apikey: process.env.LIVE_SUPABASE_ANON_KEY || null };
const sessions = new Map(); // email -> { state, at }
const tokens = new Map(); // email -> { access, refresh, expires }
const uploads = new Map(); // email -> [paths]

function signInSlot() {
  for (;;) {
    const now = Date.now();
    SIGN_INS.at = SIGN_INS.at.filter((at) => now - at < SIGN_INS.window);
    if (SIGN_INS.at.length < SIGN_INS.limit) {
      SIGN_INS.at.push(now);
      return 0;
    }
    const wait = SIGN_INS.window - (now - SIGN_INS.at[0]) + 100;
    if (wait > 0) return wait;
  }
}
async function paceSignIn() {
  for (let wait = signInSlot(); wait; wait = signInSlot()) await sleep(wait);
}
function paceSignInSync() {
  for (let wait = signInSlot(); wait; wait = signInSlot()) sleepSync(wait);
}

// What the browser's own sign-in showed: Supabase's address and public key, and the account's tokens.
function rememberSignIn(email, response) {
  const request = response.request();
  const url = new URL(response.url());
  supabase.origin = supabase.origin || url.origin;
  supabase.apikey = supabase.apikey || request.headers().apikey || null;
  return response.json().then((body) => {
    if (body && body.access_token) {
      tokens.set(email, { access: body.access_token, refresh: body.refresh_token, expires: Date.now() + (body.expires_in || 3600) * 1000 });
    }
  }).catch(() => {});
}
const savedSession = (email) => {
  const saved = sessions.get(email);
  return saved && Date.now() - saved.at < 40 * 60_000 ? saved.state : null;
};
const saveSession = (email, state) => sessions.set(email, { state, at: Date.now() });

function curl(args, input) {
  return execFileSync("curl", ["-sS", "--max-time", "60", ...args], { input, encoding: input ? undefined : "utf8", maxBuffer: 16 << 20 });
}
function token(email) {
  const known = tokens.get(email);
  if (known && known.expires - Date.now() > 5 * 60_000) return known.access;
  if (!supabase.origin || !supabase.apikey) throw new Error("live: Supabase's address is not known yet (the preflight sign-in shows it)");
  paceSignInSync();
  const out = curl(["-X", "POST", `${supabase.origin}/auth/v1/token?grant_type=password`, "-H", `apikey: ${supabase.apikey}`,
    "-H", "Content-Type: application/json", "--data-binary", "@-"], JSON.stringify({ email, password: PASSWORD }));
  const body = JSON.parse(String(out));
  if (!body.access_token) throw new Error(`live: sign-in for photos failed (${String(out).slice(0, 200)})`);
  tokens.set(email, { access: body.access_token, refresh: body.refresh_token, expires: Date.now() + (body.expires_in || 3600) * 1000 });
  return body.access_token;
}

const photoFiles = () => fs.readdirSync(PHOTO_DIR).filter((name) => /\.jpe?g$/i.test(name)).sort();

// Photos for a listing made by harness.listing: uploaded as its seller, at a path of the seller's own folder named the
// way the sell form names them (Storage's daily sweep removes such files once nothing points at them).
function photoUrls(seller, howMany) {
  const files = photoFiles();
  const folder = `${seller.id}/${crypto.randomUUID()}`;
  const access = token(seller.email);
  const start = Math.floor(Math.random() * files.length);
  const urls = [];
  for (let n = 0; n < howMany; n += 1) {
    const objectPath = `${folder}/${n}.jpg`;
    const out = curl(["-X", "POST", `${supabase.origin}/storage/v1/object/listing-photos/${objectPath}`,
      "-H", `Authorization: Bearer ${access}`, "-H", `apikey: ${supabase.apikey}`, "-H", "Content-Type: image/jpeg",
      "-H", "x-upsert: false", "-w", "\n%{http_code}", "--data-binary", `@${path.join(PHOTO_DIR, files[(start + n) % files.length])}`]);
    const status = String(out).trim().split("\n").pop();
    if (!/^2/.test(status)) throw new Error(`live: photo upload answered ${status} (${String(out).slice(0, 200)})`);
    uploads.set(seller.email, [...(uploads.get(seller.email) || []), objectPath]);
    urls.push(`${supabase.origin}/storage/v1/object/public/listing-photos/${objectPath}`);
  }
  return urls;
}

// ------------------------------------------------------------------ the request guard
const known = new Map(); // uuid or slug -> "ours" | "theirs"
const INCIDENTAL = /^\/api\/(events|client-errors|csp-report)(\/|$)|\/view$|impression/i;

async function classify(ids, slugs) {
  const idList = ids.filter((id) => !known.has(id));
  const slugList = slugs.filter((slug) => !known.has(`slug:${slug}`));
  if (!idList.length && !slugList.length) return;
  const found = await rowsAsync(`
    with ids(id) as (select unnest(array[${idList.map((id) => `${literal(id)}::uuid`).join(", ") || "null::uuid"}]))
    select ids.id::text as key, case
        when ids.id in ${RUN_USERS} or ids.id in ${RUN_LISTINGS} or ids.id in ${RUN_STORES} then 'ours'
        when exists (select 1 from public.listing_questions q where q.id = ids.id and q.listing_id in ${RUN_LISTINGS}) then 'ours'
        when exists (select 1 from public.listings l where l.id = ids.id) or exists (select 1 from public.stores s where s.id = ids.id)
          or exists (select 1 from public.profiles p where p.id = ids.id)
          or exists (select 1 from public.listing_questions q where q.id = ids.id) then 'theirs'
      end as kind
    from ids where ids.id is not null
    union all
    select 'slug:' || l.slug, case when l.id in ${RUN_LISTINGS} then 'ours' else 'theirs' end
      from public.listings l where l.slug = any(array[${slugList.map(literal).join(", ") || "null"}]::text[])
    union all
    select 'slug:' || s.slug, case when s.id in ${RUN_STORES} then 'ours' else 'theirs' end
      from public.stores s where s.slug = any(array[${slugList.map(literal).join(", ") || "null"}]::text[])`);
  for (const row of found) if (row.kind) known.set(row.key, row.kind);
}

// null when the request may go; otherwise { reason, incidental }.
async function guardRequest(request) {
  const method = request.method();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return null;
  const url = new URL(request.url());
  let pathname = url.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {}
  const type = request.headers()["content-type"] || "";
  const body = /^(image|audio|video)\//.test(type) ? "" : (request.postData() || "").slice(0, 500_000);
  if (/reclamac|complaints[-_]book/i.test(`${pathname} ${url.search}`) || /complaints_book/i.test(body.slice(0, 2000))) {
    return { reason: "a Libro de Reclamaciones entry is never made on the live site", incidental: false };
  }
  const ids = [...new Set(`${pathname} ${url.search} ${body}`.toLowerCase().match(UUID) || [])];
  const slugs = [...new Set([...pathname.matchAll(/\/(?:instrumentos|tiendas)\/([a-z0-9-]+)/g)].map((match) => match[1]))];
  await classify(ids, slugs);
  const theirs = [...ids.filter((id) => known.get(id) === "theirs"), ...slugs.filter((slug) => known.get(`slug:${slug}`) === "theirs")];
  if (!theirs.length) return null;
  return { reason: `${method} ${pathname} names someone else's ${theirs.slice(0, 2).join(", ")}`, incidental: INCIDENTAL.test(pathname) };
}

// ------------------------------------------------------------------ fence, cases, clean-up
const FENCE = `
  update laria_private.marketplace_email_deliveries set status = 'cancelled'
    where status in ('pending', 'retry')
      and (recipient_user_id in ${RUN_USERS} or listing_id in ${RUN_LISTINGS} or store_id in ${RUN_STORES});
  update laria_private.push_deliveries set status = 'skipped'
    where status = 'pending'
      and (user_id in ${RUN_USERS} or notification_id in (select n.id from public.notifications n
        where n.listing_id in ${RUN_LISTINGS} or n.store_id in ${RUN_STORES}))`;
let fenceTimer = null;
let fenceBusy = false;
function startFence() {
  fenceTimer = setInterval(() => {
    if (fenceBusy) return;
    fenceBusy = true;
    runAsync(`begin; ${FENCE}; commit;`).catch((error) => console.log(`  fence: ${error.message.slice(0, 200)}`))
      .finally(() => { fenceBusy = false; });
  }, Number(process.env.LIVE_FENCE_MS || 10_000));
  fenceTimer.unref();
}

let caseStarted = null;
function beginCase(id) {
  currentCase = id;
  caseStarted = new Date().toISOString();
}

// Everything the given accounts made, in an order the foreign keys allow; the accounts too when withAccounts.
function cleanupSql(userIds, { withAccounts }) {
  const U = `(select id from auth.users where email like ${literal(ANY_RUN)} and id = any(array[${userIds.map((id) => `${literal(id)}::uuid`).join(", ")}]))`;
  const S = `(select id from public.stores where owner_user_id in ${U})`;
  const L = `(select id from public.listings where owner_user_id in ${U} or store_id in ${S})`;
  const R = `(select id from public.transaction_reviews where reviewer_user_id in ${U} or subject_user_id in ${U} or subject_store_id in ${S})`;
  const C = `(select id from public.transaction_claims where listing_id in ${L} or store_id in ${S} or seller_user_id in ${U} or buyer_user_id in ${U})`;
  const steps = [
    `delete from public.reports where listing_id in ${L} or store_id in ${S} or reporter_user_id in ${U} or review_id in ${R}
      or question_id in (select id from public.listing_questions where listing_id in ${L} or asker_user_id in ${U})`,
    `delete from public.review_moderation_actions where review_id in ${R}`,
    `delete from public.transaction_reviews where id in ${R}`,
    `delete from public.purchase_checkins where listing_id in ${L} or store_id in ${S} or buyer_user_id in ${U} or seller_user_id in ${U} or claim_id in ${C}`,
    `delete from public.verified_transactions where claim_id in ${C} or listing_id in ${L} or store_id in ${S} or buyer_user_id in ${U} or seller_user_id in ${U}`,
    `delete from public.transaction_claims where id in ${C}`,
    `delete from public.store_stock_movements where store_id in ${S} and corrects_movement_id is not null`,
    `delete from public.store_stock_movements where store_id in ${S}`,
    `delete from public.store_inventory_changes where store_id in ${S}`,
    `delete from public.store_inventory_items where store_id in ${S} or listing_id in ${L}`,
    `delete from public.store_import_sessions where store_id in ${S}`,
    `delete from public.listing_revisions where listing_id in ${L} or store_id in ${S} or owner_user_id in ${U}`,
    `delete from laria_private.marketplace_email_deliveries where listing_id in ${L} or store_id in ${S}`,
    `update public.listings set relisted_from_listing_id = null where relisted_from_listing_id in ${L}`,
    `delete from public.listings where id in ${L}`,
    `delete from public.stores where id in ${S}`,
  ];
  if (withAccounts) {
    steps.push(
      `delete from public.marketplace_events where actor_user_id in ${U} or seller_user_id in ${U}`,
      `delete from laria_private.ai_requests where user_id in ${U}`,
      `delete from laria_private.listing_impression_days where seller_user_id in ${U}`,
      `update public.listing_questions set answered_by = null where answered_by in ${U}`,
      `update public.listing_questions set hidden_by = null where hidden_by in ${U}`,
      `delete from public.complaints_book_entries where user_id in ${U}`,
      `delete from public.profiles where id in ${U}`,
      `delete from auth.users where id in ${U}`,
    );
  }
  return `begin; ${steps.join(";\n")}; commit;`;
}

// After a case: what reached people outside the run (reported, never expected), then the case's listings and stores go.
async function afterCase(record) {
  const ids = accounts.filter((entry) => entry.caseId === record.id).map((entry) => entry.id);
  const since = literal(caseStarted);
  const [touched] = await rowsAsync(`select
      (select count(*) from public.notifications n where n.created_at >= ${since}::timestamptz and n.user_id not in ${RUN_USERS}
        and (n.listing_id in ${RUN_LISTINGS} or n.store_id in ${RUN_STORES}))::int as notices,
      (select count(*) from laria_private.marketplace_email_deliveries d where d.created_at >= ${since}::timestamptz
        and d.recipient_user_id not in ${RUN_USERS} and (d.listing_id in ${RUN_LISTINGS} or d.store_id in ${RUN_STORES}))::int as emails,
      (select count(*) from laria_private.marketplace_email_deliveries d where d.created_at >= ${since}::timestamptz
        and d.recipient_user_id not in ${RUN_USERS} and (d.listing_id in ${RUN_LISTINGS} or d.store_id in ${RUN_STORES})
        and d.status = 'sent')::int as sent`);
  if (touched.notices || touched.emails) {
    record.touched = touched;
    record.problems.push(`reached people outside the run: ${touched.notices} notices, ${touched.emails} e-mails (${touched.sent} sent)`);
  }
  await runAsync(`begin; ${FENCE}; commit;`);
  if (ids.length) await runAsync(cleanupSql(ids, { withAccounts: false }));
}

// End of the run: the accounts and everything they made go, then the count of what is left (all zero).
async function finish() {
  if (fenceTimer) clearInterval(fenceTimer);
  await runAsync(`begin; ${FENCE}; commit;`);
  const [mail] = await rowsAsync(`select coalesce(json_object_agg(status, n), '{}'::json) as statuses from (
      select status, count(*)::int as n from laria_private.marketplace_email_deliveries where recipient_user_id in ${RUN_USERS} group by status) s`);
  const ids = (await rowsAsync(`select id::text from auth.users where email like ${literal(THIS_RUN)}`)).map((row) => row.id);
  // Photos go now while the seller's token is still good; the rest, named as the sell form names them, go with Storage's
  // daily sweep once nothing points at them (supabase/migrations/20261114120000_launch_audit_privacy.sql).
  const photos = { removed: 0, sweep: 0 };
  for (const [email, paths] of uploads) {
    const known = tokens.get(email);
    if (!known || known.expires - Date.now() < 2 * 60_000) {
      photos.sweep += paths.length;
      continue;
    }
    try {
      curl(["-X", "DELETE", `${supabase.origin}/storage/v1/object/listing-photos`, "-H", `Authorization: Bearer ${known.access}`,
        "-H", `apikey: ${supabase.apikey}`, "-H", "Content-Type: application/json", "--data-binary", "@-"], JSON.stringify({ prefixes: paths }));
      photos.removed += paths.length;
    } catch (error) {
      photos.sweep += paths.length;
      console.log(`  photos of ${email} stay for the daily sweep: ${error.message.slice(0, 160)}`);
    }
  }
  if (ids.length) await runAsync(cleanupSql(ids, { withAccounts: true }));
  const [left] = await rowsAsync(`select
      (select count(*) from auth.users where email like ${literal(THIS_RUN)})::int as accounts,
      (select count(*) from public.profiles p where p.id in (select id from auth.users where email like ${literal(THIS_RUN)}))::int as profiles,
      (select count(*) from public.listings where owner_user_id in ${RUN_USERS})::int as listings,
      (select count(*) from public.stores where owner_user_id in ${RUN_USERS})::int as stores`);
  return { run: RUN, accounts: ids.length, emails: mail.statuses, photos, left };
}

// Before the first case: the database answers, the shape of Auth is known, the real alerts are counted (each would
// stop the cases whose listings it matches) and nothing of an earlier run is left.
function preflight() {
  // The wrapper must run a call's statements in one session, in order, and print the last one.
  const [claim] = parse(run(`select set_config('request.jwt.claims', '{"sub":"preflight"}', false);
    select jsonb_build_array(current_setting('request.jwt.claims', true))::text as result;`));
  if (!String(claim).includes("preflight")) throw new Error(`live database: statements of one call don't share a session (${claim})`);
  const [probe] = rows(`select current_setting('server_version') as version, (select count(*)::int from auth.users where email like ${literal(ANY_RUN)}) as leftovers,
      (select count(*)::int from public.saved_search_alerts a where a.status = 'active' and a.deleted_at is null) as alerts,
      (select coalesce(json_object_agg(bucket, n), '{}'::json) from (select match_bucket as bucket, count(*)::int as n
        from public.saved_search_alerts where status = 'active' and deleted_at is null group by match_bucket) b) as buckets`);
  authShape();
  return { run: RUN, ...probe };
}

// Recovery after a run that could not finish: every run's accounts and their data, whichever run made them.
//   LIVE_DB=... node scripts/acceptance/ease/live.cjs --clean-up
async function cleanupEveryRun() {
  const ids = (await rowsAsync(`select id::text from auth.users where email like ${literal(ANY_RUN)}`)).map((row) => row.id);
  if (ids.length) await runAsync(`begin; ${FENCE}; commit;`);
  if (ids.length) await runAsync(cleanupSql(ids, { withAccounts: true }));
  const [left] = await rowsAsync(`select (select count(*) from auth.users where email like ${literal(ANY_RUN)})::int as accounts`);
  return { removed: ids.length, left };
}
if (require.main === module && process.argv.includes("--clean-up")) {
  cleanupEveryRun().then((report) => console.log(JSON.stringify(report)), (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  RUN, PASSWORD, PHONE, rows, rowsAsync, exec, rowsAs, account, actorId, actorEmail, isActor, photoUrls, alertMatches,
  paceSignIn, rememberSignIn, savedSession, saveSession, guardRequest, startFence, beginCase, afterCase, finish, preflight,
};
