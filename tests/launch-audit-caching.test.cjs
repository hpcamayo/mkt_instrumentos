// Launch audit A19: public pages come from the cache. The home and the listing pages are rebuilt in the background at
// most once a minute and the sitemap once an hour; the category landings, which read ?page, render on every request
// from their own folders; when a listing's owner or Admin changes it, its own page is dropped at once; every change to
// a public listing, its photos or an active store is recorded, and every cached listing page and the home are dropped
// within the minute; a failed read is never cached.
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

const nextServer = { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init.headers } }) } };

// A query builder that answers every chain with one result.
function query(result) {
  const builder = { select: () => builder, eq: () => builder, in: () => builder, maybeSingle: async () => result, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
  return builder;
}

test("A19: a listing's own page, or every listing page and the home, are dropped, and a failed drop breaks nothing", () => {
  const calls = [];
  let failing = null;
  const warnings = [];
  const { dropListingPages, dropCachedListingPages } = loadModule("lib/listing-cache.ts", {
    "server-only": {},
    "next/cache": { revalidatePath: (...args) => { if (failing === args[0]) throw new Error("cache unavailable"); calls.push(args.filter(Boolean)); } },
  });
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    dropListingPages(["fender-stratocaster-1b2c", null, "fender-stratocaster-1b2c", "", "yamaha-c40"]);
    // Every listing page (its own, and the "Similares" and "Más del vendedor" rows of the others) and the home.
    assert.equal(dropCachedListingPages(), true);
    // A failed drop is reported, and the other one is still tried.
    failing = "/instrumentos/[slug]";
    assert.equal(dropCachedListingPages(), false);
    failing = "/";
    assert.equal(dropCachedListingPages(), false);
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(calls, [
    ["/instrumentos/fender-stratocaster-1b2c"], ["/instrumentos/yamaha-c40"], ["/instrumentos/[slug]", "page"], ["/"],
    ["/"], ["/instrumentos/[slug]", "page"],
  ]);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /listing-page-refresh-failed cache unavailable/);
});

test("A19: every minute, recorded changes to public pages drop every cached listing page and the home, then are reported", async () => {
  const before = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "local-scheduler-secret";
  const steps = [];
  let claim = null;
  let failing = null;
  let dropWorks = true;
  const admin = {
    from: () => { throw new Error("the job reads only the record"); },
    rpc: async (name, args) => {
      steps.push(args ? [name, args] : [name]);
      if (failing === name) return { data: null, error: { message: "timeout" } };
      return { data: name === "claim_public_page_changes" ? claim : 2, error: null };
    },
  };
  const route = loadModule("app/api/internal/public-pages/refresh/route.ts", {
    "next/server": nextServer,
    "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => admin },
    "@/lib/listing-cache": { dropCachedListingPages: () => { steps.push(["drop"]); return dropWorks; } },
  });
  const get = async (authorization) => {
    const response = await route.GET(new Request("http://localhost/api/internal/public-pages/refresh", authorization ? { headers: { Authorization: authorization } } : {}));
    return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
  };
  const logs = [];
  const info = console.info;
  const error = console.error;
  console.info = (...args) => logs.push(args.join(" "));
  console.error = (...args) => logs.push(args.join(" "));
  try {
    assert.equal((await get()).status, 401);
    assert.equal((await get("Bearer ordinary-user-token")).status, 401);
    // Same length in characters, longer in bytes: refused, not an error.
    assert.equal((await get(`Bearer local-scheduler-secre\u00e9`)).status, 401);
    assert.deepEqual(steps, []);

    // A quiet minute drops nothing.
    assert.deepEqual(await get("Bearer local-scheduler-secret"), { status: 200, body: { refreshed: false }, cache: "no-store" });
    assert.deepEqual(steps.splice(0), [["claim_public_page_changes"]]);

    // Waiting changes: claimed, every page dropped, then reported with the claim.
    claim = "7d420173-2925-4e4d-a5a0-405f12a61c59";
    assert.deepEqual(await get("Bearer local-scheduler-secret"), { status: 200, body: { refreshed: true }, cache: "no-store" });
    assert.deepEqual(steps.splice(0), [["claim_public_page_changes"], ["drop"], ["complete_public_page_changes", { p_claim: claim }]]);
    assert.match(logs.at(-1), /public_pages_refreshed \{"done":2\}/);

    // A failed drop is not reported, so the changes wait for the next run.
    dropWorks = false;
    assert.equal((await get("Bearer local-scheduler-secret")).status, 503);
    assert.deepEqual(steps.splice(0), [["claim_public_page_changes"], ["drop"]]);
    dropWorks = true;

    // Without the record nothing is dropped, so the cached copies keep serving; a failed report is an error too.
    failing = "claim_public_page_changes";
    assert.equal((await get("Bearer local-scheduler-secret")).status, 503);
    assert.deepEqual(steps.splice(0), [["claim_public_page_changes"]]);
    failing = "complete_public_page_changes";
    assert.equal((await get("Bearer local-scheduler-secret")).status, 503);
    assert.deepEqual(steps.splice(0), [["claim_public_page_changes"], ["drop"], ["complete_public_page_changes", { p_claim: claim }]]);
    assert.match(logs.at(-1), /public_pages_refresh_failure \{"step":"complete","message":"timeout"\}/);
  } finally {
    console.info = info;
    console.error = error;
    if (before === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = before;
  }

  // Scheduled every minute.
  const crons = JSON.parse(read("vercel.json")).crons;
  assert.deepEqual(crons.find((cron) => cron.path === "/api/internal/public-pages/refresh"), { path: "/api/internal/public-pages/refresh", schedule: "* * * * *" });
});

test("A19: the database records changes to public listings, photos and active stores for the job", () => {
  const migration = read("supabase/migrations/20261112130000_launch_audit_page_refresh.sql");
  for (const table of ["listings", "stores", "listing_photos"]) {
    for (const event of ["insert", "update", "delete"]) {
      assert.match(migration, new RegExp(`create trigger ${table}_public_page_changes_${event}\\nafter ${event} on public\\.${table}\\nreferencing [^\\n]+\\nfor each statement`), `${table} ${event}`);
    }
  }
  // View counts and the check-in reminder's time change no page.
  assert.match(migration, /array\['view_count', 'availability_checkin_at', 'updated_at'\]/);
  // The claim and the report are the service role's alone (tests/launch-audit-page-refresh.sql runs them).
  assert.match(migration, /grant execute on function public\.claim_public_page_changes\(\), public\.complete_public_page_changes\(uuid\)\nto service_role;/);
  assert.match(read("tests/launch-audit-page-refresh.sql"), /the third review's case/);
});

test("A19: a failed read is never cached; during the deploy the page is rendered per request instead", async () => {
  const warnings = [];
  let asked = 0;
  const { renderPerRequestIfBuilding } = loadModule("lib/cache-build.ts", {
    "server-only": {},
    "next/server": { connection: async () => { asked += 1; throw new Error("Dynamic server usage: connection"); } },
  });
  const phase = process.env.NEXT_PHASE;
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    delete process.env.NEXT_PHASE;
    await renderPerRequestIfBuilding("/sitemap.xml");
    assert.equal(asked, 0, "at run time the page just throws and the cache keeps its last good copy");
    process.env.NEXT_PHASE = "phase-production-build";
    await assert.rejects(renderPerRequestIfBuilding("/sitemap.xml"), /Dynamic server usage/);
    assert.equal(asked, 1);
    assert.deepEqual(warnings, ["cached-page-read-failed-during-build /sitemap.xml"]);
  } finally {
    console.warn = warn;
    if (phase === undefined) delete process.env.NEXT_PHASE; else process.env.NEXT_PHASE = phase;
  }

  // The sitemap: a failed batch throws instead of caching a partial list for an hour.
  const building = [];
  const batches = { stores: [{ data: [{ id: "s1", slug: "casa-grau", updated_at: "2026-10-01" }], error: null }], listings: [] };
  const client = {
    from: (table) => {
      const builder = { select: () => builder, eq: () => builder, or: () => builder, order: () => builder, range: async () => batches[table].shift() };
      return builder;
    },
  };
  const { default: sitemap } = loadModule("app/sitemap.ts", {
    "@/lib/cache-build": { renderPerRequestIfBuilding: async (page) => { building.push(page); } },
    "@/lib/category-pages": { categoryLandingPages: [] },
    "@/lib/legal-pages": { legalPages: [] },
    "@/lib/listings": { DISCOVERABLE_STOCK_FILTER: "stock_state.is.null" },
    "@/lib/site": { absoluteUrl: (path) => `https://laria.audio${path}`, isIndexableDeployment: () => true },
    "@/lib/request-deadline": { READ_BUDGETS: { coreMs: 1 }, createDeadline: () => ({}) },
    "@/lib/supabase/public-read-client": { createPublicReadClient: () => client },
  });
  batches.listings.push({ data: null, error: { message: "canceling statement due to statement timeout" } });
  await assert.rejects(sitemap(), /The sitemap's listings could not be read: canceling statement/);
  assert.deepEqual(building, ["/sitemap.xml"]);
  batches.stores.push({ data: [], error: null });
  batches.listings.push({ data: [{ id: "l1", slug: "fender-1", updated_at: "2026-10-02" }], error: null });
  const entries = await sitemap();
  assert.ok(entries.some((entry) => entry.url === "https://laria.audio/instrumentos/fender-1"));

  // A listing-id address whose lookup fails throws too, instead of caching a 404 (the main read already does).
  assert.match(read("app/instrumentos/[slug]/page.tsx"),
    /const \{ data, error \} = await client\.from\("listings"\)\.select\("slug"\)[\s\S]*?if \(error\) throw new Error\(`The listing's address could not be read: \$\{error\.message\}`\);/);
});

test("A19: an owner's change to price, status or details drops the listing's page; a refused one doesn't", async () => {
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
    "@/lib/listing-cache": { dropListingPages: (slugs) => refreshed.push(...slugs) },
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

test("A19: the browser's refresh call drops only the pages of listings its caller owns, or any for Admin, that just changed", async () => {
  const owner = crypto.randomUUID();
  const other = crypto.randomUUID();
  const adminUser = crypto.randomUUID();
  const mine = crypto.randomUUID();
  const theirs = crypto.randomUUID();
  const untouched = crypto.randomUUID();
  const revision = crypto.randomUUID();
  const now = new Date().toISOString();
  const rows = {
    listings: {
      [mine]: { slug: "mine-1", owner_user_id: owner, updated_at: now },
      [theirs]: { slug: "theirs-1", owner_user_id: other, updated_at: now },
      // Last changed eleven minutes ago: asking again and again rebuilds nothing.
      [untouched]: { slug: "untouched-1", owner_user_id: owner, updated_at: new Date(Date.now() - 11 * 60 * 1000).toISOString() },
    },
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
    "@/lib/listing-cache": { dropListingPages: (slugs) => refreshed.push(...slugs) },
  });
  const post = async (body) => {
    const response = await route.POST(new Request("http://localhost:3000/api/listings/refresh", { method: "POST", body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };

  // The owner, about their own listing: Admin isn't even asked.
  assert.deepEqual(await post({ listings: [mine, mine] }), { status: 200, body: { refreshed: 1 } });
  assert.equal(adminChecks, 0);
  // Someone else's listing, directly or through its revision, is skipped, and so is one that hasn't changed lately.
  assert.deepEqual(await post({ listings: [mine, theirs] }), { status: 200, body: { refreshed: 1 } });
  assert.deepEqual(await post({ revisions: [revision] }), { status: 200, body: { refreshed: 0 } });
  assert.deepEqual(await post({ listings: [untouched] }), { status: 200, body: { refreshed: 0 } });
  // Only those listings' own pages, never every page.
  assert.deepEqual(refreshed, ["mine-1", "mine-1"]);
  // Admin, after deciding a revision: the listing it belongs to counts.
  signedIn = adminUser;
  assert.deepEqual(await post({ revisions: [revision], listings: [mine] }), { status: 200, body: { refreshed: 2 } });
  assert.deepEqual(refreshed.slice(2).sort(), ["mine-1", "theirs-1"]);
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
