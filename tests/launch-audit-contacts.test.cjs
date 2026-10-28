// Launch audit A27 in the application (supabase/migrations/20261114130000_launch_audit_contact_reads.sql, then
// 20261114140000_launch_audit_contact_columns.sql; the database side is tests/launch-audit-contact-reads.sql and
// tests/launch-audit-contact-columns.sql): through the public API key the site reads a listing's public columns only,
// and no other user's profile. The listing page and the contact button read the contact on the server.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(file, "utf8");

// A listing's columns the public API key cannot read (owners also read rejection_reason, rejection_codes,
// hidden_source and hidden_reason, which visitors cannot; their pages are signed in).
const PRIVATE_LISTING_COLUMNS = ["contact_name", "whatsapp_phone", "archived_at", "hidden_at", "created_by_source",
  "marketplace_rules_accepted_at", "relisted_from_listing_id", "availability_checkin_at", "price_changed_at"];
// A computed field reads the whole row: on listings that needs every column, so pages read it on public_listings.
const COMPUTED_FIELDS = ["listing_photo_count", "recent_price_drop_at", "seller_verified_rank"];
const PUBLIC_LISTING_COLUMNS = ["id", "store_id", "owner_user_id", "seller_type", "status", "title", "slug", "description",
  "category", "instrument_type", "brand", "model", "condition", "attributes", "price_pen", "previous_price_pen",
  "price_dropped_at", "city", "region", "view_count", "stock_state", "published_at", "created_at", "updated_at",
  "content_changed_at", "availability_confirmed_at", "paused_until", "sold_at"];

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") && entry.name !== "database.types.ts" ? [full] : [];
  });
}

// The text from an opening parenthesis to its closing one, strings and template literals skipped.
function argumentsAt(code, open) {
  let depth = 0;
  let quote = null;
  for (let index = open; index < code.length; index += 1) {
    const char = code[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "(") depth += 1;
    else if (char === ")" && --depth === 0) return code.slice(open + 1, index);
  }
  return code.slice(open + 1);
}

// The receivers in a file that hold the service-role client.
function adminClients(code) {
  const names = new Set(["getSupabaseAdminClient()"]);
  for (const match of code.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*getSupabaseAdminClient\(\)/g)) names.add(match[1]);
  for (const match of code.matchAll(/\b([A-Za-z_$][\w$]*)\s*:\s*AdminClient\b/g)) names.add(match[1]);
  return names;
}

// Every .from("<table>") call that does not run with the service role: its line, its select (string literals, or the
// const a bare name refers to) and the rest of its statement.
function publicKeyReads(table) {
  const reads = [];
  for (const file of ["app", "lib", "components"].flatMap(files)) {
    const code = read(file);
    const admin = adminClients(code);
    const pattern = new RegExp(`([A-Za-z_$][\\w$]*(?:\\(\\))?)!?\\s*\\??\\.\\s*from\\("${table}"\\)`, "g");
    for (const match of code.matchAll(pattern)) {
      if (admin.has(match[1])) continue;
      const after = match.index + match[0].length;
      const rest = code.slice(after);
      const end = rest.search(/;\s*\n|,\n\s*\]\)|\n\s*\n/);
      const statement = end === -1 ? rest : rest.slice(0, end);
      const selectAt = rest.search(/^\s*\.select\(/);
      let select = "";
      if (selectAt === 0) {
        const args = argumentsAt(rest, rest.indexOf("("));
        const literals = [...args.matchAll(/(["'`])((?:\\.|(?!\1)[\s\S])*)\1/g)].map((literal) => literal[2]);
        const name = args.match(/^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/);
        const named = name ? code.match(new RegExp(`\\bconst\\s+${name[1]}\\s*=\\s*(["'\`])([\\s\\S]*?)\\1`)) : null;
        select = named ? named[2] : literals.join(",");
      }
      reads.push({ where: `${file}:${code.slice(0, match.index).split("\n").length}`, select, statement });
    }
  }
  return reads;
}

const topLevelColumns = (select) => select.replace(/[\w!:]+\s*\([^()]*\)/g, "").split(",").map((column) => column.trim().split(":").pop().trim()).filter(Boolean);
const filteredColumns = (statement) => [...statement.matchAll(/\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|match|not|filter|order)\(\s*"([a-z_]+)"/g)].map((match) => match[1]);

test("A27: no read of listings through the public API key names a private column or a computed field", () => {
  const reads = publicKeyReads("listings");
  assert.ok(reads.length > 10, "the scan finds the site's listings reads");
  const offenders = [];
  for (const { where, select, statement } of reads) {
    const named = topLevelColumns(select).filter((column) => PRIVATE_LISTING_COLUMNS.includes(column) || COMPUTED_FIELDS.includes(column));
    const filtered = filteredColumns(statement).filter((column) => PRIVATE_LISTING_COLUMNS.includes(column));
    if (/\bprofiles\b/.test(select)) named.push("profiles");
    if (named.length || filtered.length) offenders.push(`${where}: ${[...named, ...filtered].join(", ")}`);
  }
  assert.deepEqual(offenders, [], "Read public columns with computed fields on public_listings, contacts with the service role");
});

test("A27: the site reads only its own profile through the public API key", () => {
  const reads = publicKeyReads("profiles").filter(({ statement }) => /^\s*\.select\(/.test(statement));
  assert.ok(reads.length >= 5, "the scan finds the own-profile reads");
  const offenders = reads.filter(({ statement }) => !/\.eq\(\s*"id",/.test(statement)).map(({ where }) => where);
  assert.deepEqual(offenders, [], "Another user's profile is read on the server");
});

test("A27: card queries read public_listings, and the free-text search returns its rows", () => {
  assert.match(read("lib/catalog.ts"), /supabase\.from\("public_listings"\)\.select\(select, options\)/);
  for (const file of ["lib/home.ts", "app/comparar/page.tsx", "app/tiendas/[slug]/page.tsx"]) {
    assert.match(read(file), /\.from\("public_listings"\)/, file);
  }
  const page = read("app/instrumentos/[slug]/page.tsx");
  assert.equal([...page.matchAll(/\.from\("public_listings"\)/g)].length, 2, "similar listings and more from the seller");
  const sql = read("supabase/migrations/20261114130000_launch_audit_contact_reads.sql");
  const view = sql.match(/create view public\.public_listings\s+with \(security_invoker = true\)\s+as\s+select([\s\S]*?)from public\.listings l;/);
  assert.ok(view, "a security invoker view of listings");
  assert.deepEqual(view[1].split(",").map((column) => column.trim().replace(/^l\./, "")), PUBLIC_LISTING_COLUMNS);
  assert.match(sql, /create function public\.catalog_search\(p_q text\)\s+returns setof public\.public_listings/);
  for (const field of COMPUTED_FIELDS) assert.match(sql, new RegExp(`function public\\.${field}\\((?:p_listing )?public\\.public_listings\\)`), field);
  assert.match(sql, /function public\.admin_get_listing[\s\S]*if not public\.is_admin\(\) then/);
  assert.match(sql, /revoke all on function public\.admin_get_listing\(uuid\) from public, anon;/);
});

test("A27 step 2: the public reads on listings exactly the columns of public_listings, and visitors no profile", () => {
  const view = read("supabase/migrations/20261114130000_launch_audit_contact_reads.sql")
    .match(/create view public\.public_listings\s+with \(security_invoker = true\)\s+as\s+select([\s\S]*?)from public\.listings l;/);
  const sql = read("supabase/migrations/20261114140000_launch_audit_contact_columns.sql");
  const grant = sql.match(/grant select \(([^)]*)\) on public\.listings to anon, authenticated;/);
  assert.ok(view && grant, "the view and the grant");
  const columns = (list) => list.split(",").map((column) => column.trim().replace(/^l\./, ""));
  assert.deepEqual(columns(grant[1]), columns(view[1]));
  assert.match(sql, /revoke select on public\.listings from anon, authenticated;/);
  assert.match(sql, /grant select \(rejection_reason, rejection_codes, hidden_source, hidden_reason\) on public\.listings to authenticated;/);
  assert.match(sql, /drop policy if exists "Public can read profiles for approved listings" on public\.profiles;/);
  assert.match(sql, /revoke select on public\.profiles from anon;/);
});

test("A27: Admin's listing editor loads the contact through admin_get_listing", () => {
  const editor = read("components/admin-record-editors.tsx");
  assert.match(editor, /\.rpc\("admin_get_listing", \{ p_listing_id: listingId \}\)\.select\(listingSelect\)\.single\(\)/);
  assert.doesNotMatch(editor, /\.from\("listings"\)\s*\.select\(/);
});

function loadModule(filename, mocks) {
  const Module = require("node:module");
  const ts = require("typescript");
  const source = path.resolve(filename);
  const compiled = ts.transpileModule(read(source), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = new Module(source, module);
  mod.filename = source;
  mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = (name) => (Object.hasOwn(mocks, name) ? mocks[name] : original(name));
  mod._compile(compiled, source);
  return mod.exports;
}

// A stand-in client: from(table).select(columns).eq(...).maybeSingle() answers with rows(table, columns, filters).
function fakeClient(rows, log, label) {
  return {
    from(table) {
      const query = { table, columns: "", filters: [] };
      const builder = {
        select(columns) { query.columns = columns; return builder; },
        eq(column, value) { query.filters.push([column, value]); return builder; },
        async maybeSingle() { log.push({ client: label, ...query }); return rows(query); },
      };
      return builder;
    },
    rpc: async () => ({ data: null, error: null }),
  };
}

const LISTING_ID = "a2720000-0000-4000-8000-000000000001";
const PUBLIC_ROW = { id: LISTING_ID, title: "Guitarra", slug: "guitarra", price_pen: 900, stock_state: null, seller_type: "individual",
  owner_user_id: "a2700000-0000-4000-8000-000000000001", city: "Lima", region: "Lima", created_at: "2026-10-01T00:00:00Z", stores: null };
const CONTACT_ROW = { contact_name: "Nombre de la publicación", whatsapp_phone: "987654320",
  profiles: { full_name: "Particular A27", phone: "987654321", city: "Lima", region: "Lima", created_at: "2026-09-01T00:00:00Z" } };

function contactRoute({ publicRows, adminRows, admin = true, log }) {
  return loadModule("app/api/contact/route.ts", {
    "next/server": { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init.headers } }) } },
    "@/lib/supabase/public-client": { getPublicSupabaseClient: () => fakeClient(publicRows, log, "public") },
    "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => (admin ? fakeClient(adminRows, log, "admin") : null) },
    // talk-06's optional reservation read (tests/maybes-reservado.test.cjs): none here.
    "@/lib/listing-reservations-server": { reservedCardIds: async () => new Set() },
    "@/lib/marketplace-events-server": {
      sameOriginEventRequest: () => true,
      getMarketplaceActor: async () => null,
      getMarketplaceSession: async () => null,
      recordMarketplaceEvent: async () => ({ recorded: true }),
      logMarketplaceEventFailure: () => {},
    },
  });
}

const contactRequest = () => new Request("https://laria.audio/api/contact", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ eventId: "0b1c2d3e-4f50-4a61-8b72-9c8d7e6f5a4b", listingId: LISTING_ID }),
});

test("A27: the contact button reads the listing with the public key and its number with the service role", async () => {
  const log = [];
  // The public key: a listing's public columns only, as under the step 2 grants.
  const publicRows = ({ columns }) => {
    const named = topLevelColumns(columns).filter((column) => PRIVATE_LISTING_COLUMNS.includes(column));
    if (named.length || /\bprofiles\b/.test(columns)) return { data: null, error: { message: `permission denied: ${named.join(", ") || "profiles"}` } };
    return { data: PUBLIC_ROW, error: null };
  };
  const route = contactRoute({ publicRows, adminRows: () => ({ data: CONTACT_ROW, error: null }), log });
  const response = await route.POST(contactRequest());
  assert.equal(response.status, 200);
  const body = await response.json();
  // An account's listing opens its owner's current number, from the profile (51 added to a 9-digit mobile).
  assert.match(body.url, /^https:\/\/wa\.me\/51987654321\?text=/);
  assert.deepEqual(log.map(({ client, table }) => `${client} ${table}`).sort(), ["admin listings", "public listings"]);
  const publicRead = log.find(({ client }) => client === "public");
  assert.deepEqual(publicRead.filters, [["id", LISTING_ID], ["status", "approved"]], "row-level security and the status decide it is public");
  assert.match(log.find(({ client }) => client === "admin").columns, /contact_name,whatsapp_phone,profiles!listings_owner_user_id_fkey\(/);
});

test("A27: a listing the public key cannot read gives no number, and the button needs the service role", async () => {
  const log = [];
  const hidden = contactRoute({ publicRows: () => ({ data: null, error: null }), adminRows: () => ({ data: CONTACT_ROW, error: null }), log });
  const response = await hidden.POST(contactRequest());
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /987654321|wa\.me/);
  const failedContact = contactRoute({ publicRows: () => ({ data: PUBLIC_ROW, error: null }), adminRows: () => ({ data: null, error: { message: "timeout" } }), log });
  assert.equal((await failedContact.POST(contactRequest())).status, 404);
  const unconfigured = contactRoute({ publicRows: () => ({ data: PUBLIC_ROW, error: null }), adminRows: () => ({ data: CONTACT_ROW, error: null }), admin: false, log });
  assert.equal((await unconfigured.POST(contactRequest())).status, 503);
});
