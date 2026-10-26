// Launch audit A19: public pages come from the cache. The home and the listing pages are rebuilt in the background at
// most once a minute and the sitemap once an hour; the category landings, which read ?page, render on every request
// from their own folders; when a listing's owner or Admin changes it, its cached page is dropped at once.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { categoryLandingPages, legacyCategorySlugs } = require("@/lib/category-pages");

const read = (file) => fs.readFileSync(file, "utf8");
// Reading the request makes a page dynamic, and inside a cached page it fails at run time.
const REQUEST_BOUND = /searchParams|next\/headers|cookies\(|headers\(|connection\(|server-client|marketplace-events-server/;

test("A19: the home and listing pages are cached for a minute, the sitemap for an hour, and none reads the request", () => {
  const home = read("app/page.tsx");
  const listing = read("app/instrumentos/[slug]/page.tsx");
  for (const page of [home, listing]) {
    assert.match(page, /\nexport const revalidate = 60;\n/);
    assert.doesNotMatch(page, /force-dynamic/);
    assert.doesNotMatch(page, REQUEST_BOUND);
  }
  // No listing is built during the deploy: each one on its first visit.
  assert.match(listing, /export async function generateStaticParams\(\) \{\n {2}return \[\];\n\}/);
  const sitemap = read("app/sitemap.ts");
  assert.match(sitemap, /\nexport const revalidate = 3600;\n/);
  assert.doesNotMatch(sitemap, /force-dynamic/);
  assert.doesNotMatch(sitemap, REQUEST_BOUND);
});

test("A19: every category landing has its own folder and renders on every request", () => {
  const folders = fs.readdirSync("app/instrumentos", { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !/^[[_]/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(folders, categoryLandingPages.map((landing) => landing.slug).sort());
  for (const slug of folders) {
    const page = read(`app/instrumentos/${slug}/page.tsx`);
    assert.match(page, new RegExp(`categoryLandingRoute\\("${slug}"\\)`), slug);
    assert.match(page, /export const dynamic = "force-dynamic";/, slug);
    assert.match(page, /export const generateMetadata = route\.generateMetadata;\nexport default route\.Page;/, slug);
  }
  // A retired landing keeps no folder: the listing route answers it with a permanent redirect.
  for (const slug of Object.keys(legacyCategorySlugs)) assert.equal(fs.existsSync(`app/instrumentos/${slug}`), false, slug);
  assert.match(read("app/instrumentos/[slug]/page.tsx"), /const moved = legacyCategoryRedirect\(slug\);\n {2}if \(moved\) permanentRedirect\(moved\);/);
});

function loadModule(filename, mocks) {
  const Module = require("node:module");
  const ts = require("typescript");
  const source = require("node:path").resolve(filename);
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

const nextServer = { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json" } }) } };

// A query builder that answers every chain with one result.
function query(result) {
  const builder = { select: () => builder, eq: () => builder, in: () => builder, maybeSingle: async () => result, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
  return builder;
}

test("A19: dropping a listing's cached page never fails the change that asked for it", () => {
  const paths = [];
  let failing = false;
  const warnings = [];
  const { refreshListingPage } = loadModule("lib/listing-cache.ts", {
    "server-only": {},
    "next/cache": { revalidatePath: (path) => { if (failing) throw new Error("cache unavailable"); paths.push(path); } },
  });
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    refreshListingPage("fender-stratocaster-1b2c");
    refreshListingPage(null);
    refreshListingPage("");
    failing = true;
    assert.doesNotThrow(() => refreshListingPage("yamaha-p45-9f8e"));
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(paths, ["/instrumentos/fender-stratocaster-1b2c"]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /listing-page-refresh-failed cache unavailable/);
});

test("A19: an owner's change to price, status or details drops the listing's cached page; a refused one doesn't", async () => {
  const owner = crypto.randomUUID();
  const id = crypto.randomUUID();
  const refreshed = [];
  const rpcs = [];
  let rpcError = null;
  const listing = {
    id, slug: "fender-stratocaster-1b2c", owner_user_id: owner, status: "approved", title: "Fender Stratocaster", category: "guitars",
    instrument_type: "electric_guitar", brand: "Fender", model: "Stratocaster", condition: "Usado", price_pen: 2500, city: "Lima",
    region: "Lima", description: "Guitarra en muy buen estado, con estuche y cuerdas nuevas.", attributes: {}, listing_photos: [],
  };
  const server = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    from: (table) => query(table === "listings" ? { data: listing, error: null } : { data: null, error: null }),
    rpc: async (name) => { rpcs.push(name); return { data: { id }, error: rpcError }; },
  };
  const route = loadModule("app/api/listings/[id]/manage/route.ts", {
    "next/server": nextServer,
    "@/lib/supabase/server-client": { getSupabaseServerClient: async () => server },
    "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => null },
    "@/lib/listing-photo-cleanup": { cleanupListingEditUploads: async () => undefined },
    "@/lib/listing-cache": { refreshListingPage: (slug) => refreshed.push(slug) },
  });
  const post = (body) => route.POST(
    new Request(`http://localhost:3000/api/listings/${id}/manage`, { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );

  for (const body of [
    { action: "hide" }, { action: "restore" }, { action: "sold" }, { action: "price", price_pen: "2300" }, { action: "resubmit" },
    { action: "edit", immediate: { price_pen: "2200", description: "Guitarra en muy buen estado, con estuche, cuerdas nuevas y correa." }, moderated: {} },
  ]) {
    const response = await post(body);
    assert.equal(response.status, 200, `${body.action}: ${await response.clone().text()}`);
  }
  assert.deepEqual(rpcs, ["set_owned_listing_lifecycle", "set_owned_listing_lifecycle", "set_owned_listing_lifecycle", "set_owned_listing_price", "submit_listing_for_publication", "update_owned_listing"]);
  assert.deepEqual(refreshed, Array(6).fill("fender-stratocaster-1b2c"));

  // A copy is a new draft, not a change to this page.
  assert.equal((await post({ action: "duplicate" })).status, 200);
  rpcError = { message: "LISTING_PRICE_INVALID" };
  assert.equal((await post({ action: "price", price_pen: "2300" })).status, 409);
  assert.equal((await post({ action: "hide" })).status, 409);
  assert.equal(refreshed.length, 6);
});

test("A19: the browser's refresh call drops only the pages of listings its caller owns, or any page for Admin", async () => {
  const owner = crypto.randomUUID();
  const other = crypto.randomUUID();
  const adminUser = crypto.randomUUID();
  const mine = crypto.randomUUID();
  const theirs = crypto.randomUUID();
  const revision = crypto.randomUUID();
  const rows = {
    listings: { [mine]: { slug: "mi-bajo", owner_user_id: owner }, [theirs]: { slug: "su-teclado", owner_user_id: other } },
    listing_revisions: { [revision]: { listing_id: theirs } },
  };
  let signedIn = owner;
  let adminChecks = 0;
  const refreshed = [];
  const admin = { from: (table) => ({ select: () => ({ in: async (_column, ids) => ({ data: ids.map((id) => rows[table][id]).filter(Boolean), error: null }) }) }) };
  const server = {
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: signedIn } : null }, error: null }) },
    rpc: async (name) => { assert.equal(name, "is_admin"); adminChecks += 1; return { data: signedIn === adminUser, error: null }; },
  };
  const route = loadModule("app/api/listings/refresh/route.ts", {
    "next/server": nextServer,
    "@/lib/supabase/server-client": { getSupabaseServerClient: async () => server },
    "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => admin },
    "@/lib/listing-cache": { refreshListingPage: (slug) => refreshed.push(slug) },
  });
  const post = async (body) => {
    const response = await route.POST(new Request("http://localhost:3000/api/listings/refresh", { method: "POST", body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };

  // The owner, about their own listing: Admin isn't even asked.
  assert.deepEqual(await post({ listings: [mine, mine] }), { status: 200, body: { refreshed: 1 } });
  assert.equal(adminChecks, 0);
  // Someone else's listing, directly or through its revision, is skipped.
  assert.deepEqual(await post({ listings: [mine, theirs] }), { status: 200, body: { refreshed: 1 } });
  assert.deepEqual(await post({ revisions: [revision] }), { status: 200, body: { refreshed: 0 } });
  assert.deepEqual(refreshed, ["mi-bajo", "mi-bajo"]);
  // Admin, after deciding a revision: the page of the listing it belongs to.
  signedIn = adminUser;
  assert.deepEqual(await post({ revisions: [revision], listings: [mine] }), { status: 200, body: { refreshed: 2 } });
  assert.deepEqual(refreshed.slice(2).sort(), ["mi-bajo", "su-teclado"]);
  // An id nobody has is nothing to refresh.
  assert.deepEqual(await post({ listings: [crypto.randomUUID()] }), { status: 200, body: { refreshed: 0 } });

  signedIn = null;
  assert.equal((await post({ listings: [mine] })).status, 401);
  signedIn = owner;
  for (const body of [{}, { listings: [] }, { listings: "x" }, { listings: ["not-an-id"] }, { listings: [mine], revisions: [1] }, { listings: Array.from({ length: 101 }, () => crypto.randomUUID()) }]) {
    assert.equal((await post(body)).status, 400, JSON.stringify(body).slice(0, 60));
  }
  assert.equal(refreshed.length, 4);
});

test("A19: the browser asks for the refresh after changing a listing directly, and a failed call breaks nothing", async () => {
  const { refreshListingPages } = loadModule("lib/listing-page-refresh.ts", {});
  const calls = [];
  const fetchBefore = global.fetch;
  try {
    global.fetch = async (url, init) => { calls.push({ url, init }); throw new TypeError("offline"); };
    assert.equal(await refreshListingPages({ listings: ["a"] }), undefined);
  } finally {
    global.fetch = fetchBefore;
  }
  assert.equal(calls[0].url, "/api/listings/refresh");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.keepalive, true);
  assert.deepEqual(JSON.parse(calls[0].init.body), { listings: ["a"] });

  // Bulk actions in "Mis publicaciones" (and their undo), the pending actions, and Admin's listing and revision decisions.
  assert.match(read("components/listing-management-table.tsx"), /if \(result\.changed\.length\) void refreshListingPages\(\{ listings: result\.changed \}\);/);
  assert.match(read("components/pendientes-list.tsx"), /if \(action\.kind === "availability" \|\| action\.kind === "buyer_report"\) void refreshListingPages\(\{ listings: \[action\.listingId\] \}\);/);
  const workbench = read("components/admin-workbench.tsx");
  assert.match(workbench, /if \(mutation\.kind === "listing"\) void refreshListingPages\(\{ listings: \[mutation\.id\] \}\);/);
  assert.match(workbench, /if \(mutation\.kind === "revision"\) void refreshListingPages\(\{ revisions: \[mutation\.id\] \}\);/);
});
