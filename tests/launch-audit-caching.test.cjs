// Launch audit A19: public pages come from the cache. The home and the listing pages are rebuilt in the background at
// most once a minute and the sitemap once an hour; the category landings, which read ?page, render on every request
// from their own folders; when a listing's owner or Admin changes it, its own page is cleared at once; every change to
// what the cached pages show is recorded, and every cached listing page and the home are cleared every minute until a
// check page proves the cache took a clear after it; a failed read is never cached.
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

test("A19: a listing's own page, or every listing page, the home and the check page, are cleared, and a failed clear breaks nothing", () => {
  const calls = [];
  let failing = null;
  const warnings = [];
  const { dropListingPages, dropCachedListingPages, CACHE_PROBE_PATH } = loadModule("lib/listing-cache.ts", {
    "server-only": {},
    "next/cache": { revalidatePath: (...args) => { if (failing === args[0]) throw new Error("cache unavailable"); calls.push(args.filter(Boolean)); } },
  });
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    dropListingPages(["fender-stratocaster-1b2c", null, "fender-stratocaster-1b2c", "", "yamaha-c40"]);
    // Every listing page (its own, and the "Similares" and "Más del vendedor" rows of the others), the home, then the
    // check page.
    assert.equal(dropCachedListingPages(), true);
    // A failed clear is reported, the other page is still tried, and the check page is left alone: it shows no clear.
    failing = "/instrumentos/[slug]";
    assert.equal(dropCachedListingPages(), false);
    failing = "/";
    assert.equal(dropCachedListingPages(), false);
    failing = CACHE_PROBE_PATH;
    assert.equal(dropCachedListingPages(), false);
  } finally {
    console.warn = warn;
  }
  assert.equal(CACHE_PROBE_PATH, "/api/public-pages/probe");
  // Each deployment is named by its id, or its address; outside Vercel by nothing.
  const { currentDeployment } = loadModule("lib/listing-cache.ts", { "server-only": {}, "next/cache": { revalidatePath: () => undefined } });
  const env = { id: process.env.VERCEL_DEPLOYMENT_ID, url: process.env.VERCEL_URL };
  try {
    process.env.VERCEL_DEPLOYMENT_ID = "dpl_4Kc2";
    process.env.VERCEL_URL = "mkt-instrumentos-4kc2.vercel.app";
    assert.equal(currentDeployment(), "dpl_4Kc2");
    delete process.env.VERCEL_DEPLOYMENT_ID;
    assert.equal(currentDeployment(), "mkt-instrumentos-4kc2.vercel.app");
    delete process.env.VERCEL_URL;
    assert.equal(currentDeployment(), null);
  } finally {
    for (const [name, value] of [["VERCEL_DEPLOYMENT_ID", env.id], ["VERCEL_URL", env.url]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  assert.deepEqual(calls, [
    ["/instrumentos/fender-stratocaster-1b2c"], ["/instrumentos/yamaha-c40"],
    ["/instrumentos/[slug]", "page"], ["/"], ["/api/public-pages/probe"],
    ["/"],
    ["/instrumentos/[slug]", "page"],
    ["/instrumentos/[slug]", "page"], ["/"],
  ]);
  assert.equal(warnings.length, 3);
  assert.match(warnings[0], /listing-page-refresh-failed cache unavailable/);
});

test("A19: the check page is cached until a clear and says only its nonce and the deployment that built it", async () => {
  const source = read("app/api/public-pages/probe/route.ts");
  assert.match(source, /\nexport const dynamic = "force-static";\nexport const revalidate = false;\n/);
  assert.doesNotMatch(source, REQUEST_BOUND);
  const { GET } = loadModule("app/api/public-pages/probe/route.ts", { "next/server": nextServer, "@/lib/listing-cache": { currentDeployment: () => "dpl_4Kc2" } });
  const first = await GET().json();
  assert.deepEqual(Object.keys(first), ["nonce", "deployment"]);
  assert.match(first.nonce, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first.deployment, "dpl_4Kc2");
  assert.notEqual((await GET().json()).nonce, first.nonce);
  // Outside Vercel there is no deployment to name.
  const local = loadModule("app/api/public-pages/probe/route.ts", { "next/server": nextServer, "@/lib/listing-cache": { currentDeployment: () => null } });
  assert.equal((await local.GET().json()).deployment, null);
});

test("A19: every minute, recorded changes clear every cached page until the check page proves a clear after them", async () => {
  const before = { secret: process.env.CRON_SECRET };
  process.env.CRON_SECRET = "local-scheduler-secret";
  let deployment = "dpl_4Kc2";
  const SECRET = "Bearer local-scheduler-secret";
  const CLAIM = "7d420173-2925-4e4d-a5a0-405f12a61c59";
  const NONCE_A = "0f1e2d3c-4b5a-4968-8776-655443322110";
  const NONCE_B = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";
  const steps = [];
  const probes = [];
  const fetched = [];
  let claim = null;
  let report = { done: 0, waiting: 1 };
  let failing = null;
  let dropWorks = true;
  const admin = {
    from: () => { throw new Error("the job reads only the record"); },
    rpc: async (name, args) => {
      steps.push([name, args]);
      if (failing === name) return { data: null, error: { message: "timeout" } };
      return { data: name === "claim_public_page_changes" ? claim : report, error: null };
    },
  };
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    steps.push(["probe"]);
    fetched.push([url, init.headers["User-Agent"], typeof init.signal?.aborted]);
    const next = probes.shift() ?? { status: 200, headers: { "x-vercel-cache": "HIT" }, body: { nonce: NONCE_A, deployment: "dpl_4Kc2" } };
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body), { status: next.status, headers: next.headers });
  };
  const route = loadModule("app/api/internal/public-pages/refresh/route.ts", {
    "next/server": nextServer,
    "node:timers/promises": { setTimeout: async (ms) => { steps.push(["wait", ms]); } },
    "@/lib/site": { absoluteUrl: (path) => `https://laria.audio${path}` },
    "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => admin },
    "@/lib/listing-cache": { CACHE_PROBE_PATH: "/api/public-pages/probe", currentDeployment: () => deployment, dropCachedListingPages: () => { steps.push(["drop"]); return dropWorks; } },
  });
  const get = async (authorization) => {
    const response = await route.GET(new Request("http://localhost/api/internal/public-pages/refresh", authorization ? { headers: { Authorization: authorization } } : {}));
    return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
  };
  const claimed = (deployment = "dpl_4Kc2") => ["claim_public_page_changes", { p_deployment: deployment }];
  const reported = (nonce, from = "dpl_4Kc2") => ["complete_public_page_changes", { p_claim: CLAIM, p_nonce: nonce, p_deployment: from }];
  const logs = [];
  const consoleBefore = { info: console.info, warn: console.warn, error: console.error };
  console.info = (...args) => logs.push(args.join(" "));
  console.warn = (...args) => logs.push(args.join(" "));
  console.error = (...args) => logs.push(args.join(" "));
  try {
    assert.equal((await get()).status, 401);
    assert.equal((await get("Bearer ordinary-user-token")).status, 401);
    // Same length in characters, longer in bytes: refused, not an error.
    assert.equal((await get(`Bearer local-scheduler-secreé`)).status, 401);
    assert.deepEqual(steps, []);

    // A quiet minute: one call naming the deployment, nothing read or cleared.
    assert.deepEqual(await get(SECRET), { status: 200, body: { refreshed: false }, cache: "no-store" });
    assert.deepEqual(steps.splice(0), [claimed()]);

    // Waiting changes: claimed, the check page read, the nonce reported, and every page cleared while changes wait.
    claim = CLAIM;
    assert.deepEqual(await get(SECRET), { status: 200, body: { refreshed: true }, cache: "no-store" });
    assert.deepEqual(steps.splice(0), [claimed(), ["probe"], reported(NONCE_A), ["drop"]]);
    assert.deepEqual(fetched.at(-1), ["https://laria.audio/api/public-pages/probe", "Laria public pages refresh", "boolean"]);
    assert.match(logs.at(-1), /^public_pages_refreshed \{"done":0,"waiting":1,"checked":true\}$/);

    // Once nothing waits, nothing is cleared.
    report = { done: 1, waiting: 0 };
    assert.equal((await get(SECRET)).status, 200);
    assert.deepEqual(steps.splice(0), [claimed(), ["probe"], reported(NONCE_A)]);
    assert.match(logs.at(-1), /^public_pages_refreshed \{"done":1,"waiting":0,"checked":true\}$/);
    report = { done: 0, waiting: 1 };

    // A stale copy, served while the check page rebuilds, is read again a second later; locally Next.js names the copy.
    probes.push({ status: 200, headers: { "x-vercel-cache": "STALE" }, body: { nonce: NONCE_A, deployment: "dpl_4Kc2" } },
      { status: 200, headers: { "x-nextjs-cache": "MISS" }, body: { nonce: NONCE_B, deployment: "dpl_4Kc2" } });
    assert.equal((await get(SECRET)).status, 200);
    assert.deepEqual(steps.splice(0), [claimed(), ["probe"], ["wait", 1000], ["probe"], reported(NONCE_B), ["drop"]]);

    // A check page that can't be read: three tries, then a report without a nonce, and the pages are still cleared.
    probes.push(new Error("The operation was aborted due to timeout"),
      { status: 500, headers: { "x-vercel-cache": "MISS" }, body: { nonce: NONCE_B, deployment: "dpl_4Kc2" } },
      { status: 200, headers: { "x-vercel-cache": "HIT" }, body: { nonce: "not-a-nonce", deployment: "dpl_4Kc2" } });
    assert.equal((await get(SECRET)).status, 200);
    assert.deepEqual(steps.splice(0), [claimed(), ["probe"], ["wait", 1000], ["probe"], ["wait", 1000], ["probe"], reported(null), ["drop"]]);
    assert.ok(logs.includes('public_pages_probe_unavailable {"seen":"HIT"}'));
    assert.match(logs.at(-1), /"checked":false/);
    // A copy that names no cache isn't the cache's.
    probes.push(...Array(3).fill({ status: 200, headers: {}, body: { nonce: NONCE_B, deployment: "dpl_4Kc2" } }));
    await get(SECRET);
    assert.deepEqual(steps.splice(0).filter(([step]) => step !== "wait").at(-2), reported(null));
    // Codex's fifth review: the domain moved to another deployment while this one runs (a deploy, a rollback). Its
    // check page says nothing about this deployment's cache, so it isn't reported, nor is a copy that names none.
    probes.push(...Array(3).fill({ status: 200, headers: { "x-vercel-cache": "HIT" }, body: { nonce: NONCE_B, deployment: "dpl_9Zx1" } }));
    await get(SECRET);
    assert.deepEqual(steps.splice(0), [claimed(), ["probe"], ["wait", 1000], ["probe"], ["wait", 1000], ["probe"], reported(null), ["drop"]]);
    assert.ok(logs.includes('public_pages_probe_unavailable {"seen":"HIT other deployment"}'));
    probes.push(...Array(3).fill({ status: 200, headers: { "x-vercel-cache": "HIT" }, body: { nonce: NONCE_B } }));
    await get(SECRET);
    assert.deepEqual(steps.splice(0).filter(([step]) => step !== "wait").at(-2), reported(null));
    // Its own copy, after one from the other deployment, counts.
    probes.push({ status: 200, headers: { "x-vercel-cache": "HIT" }, body: { nonce: NONCE_A, deployment: "dpl_9Zx1" } },
      { status: 200, headers: { "x-vercel-cache": "HIT" }, body: { nonce: NONCE_B, deployment: "dpl_4Kc2" } });
    await get(SECRET);
    assert.deepEqual(steps.splice(0), [claimed(), ["probe"], ["wait", 1000], ["probe"], reported(NONCE_B), ["drop"]]);

    // A failed clear is an error, and the changes wait for the next run.
    dropWorks = false;
    assert.equal((await get(SECRET)).status, 503);
    assert.deepEqual(steps.splice(0), [claimed(), ["probe"], reported(NONCE_A), ["drop"]]);
    dropWorks = true;

    // Without the record nothing is cleared, so the cached copies keep serving.
    failing = "claim_public_page_changes";
    assert.equal((await get(SECRET)).status, 503);
    assert.deepEqual(steps.splice(0), [claimed()]);
    // After a failed report the changes still wait: the pages are cleared anyway, and the run is an error.
    failing = "complete_public_page_changes";
    assert.equal((await get(SECRET)).status, 503);
    assert.deepEqual(steps.splice(0), [claimed(), ["probe"], reported(NONCE_A), ["drop"]]);
    assert.match(logs.at(-1), /^public_pages_refresh_failure \{"step":"complete","message":"timeout"\}$/);
    failing = null;
    report = 3;
    assert.equal((await get(SECRET)).status, 503);
    assert.deepEqual(steps.splice(0).at(-1), ["drop"]);
    report = { done: 0, waiting: 1 };

    // Codex's sixth review: without a deployment name (Vercel's system environment variables off, or outside Vercel)
    // every deployment would call itself the same, so a run can't tell its cache from another's. It reads no check page
    // and reports no nonce: the changes wait, the pages are cleared on every run, and each run says why.
    deployment = null;
    probes.push({ status: 200, headers: { "x-nextjs-cache": "HIT" }, body: { nonce: NONCE_B, deployment: null } });
    assert.equal((await get(SECRET)).status, 200);
    assert.deepEqual(steps.splice(0), [claimed(null), reported(null, null), ["drop"]]);
    assert.ok(logs.includes("public_pages_no_deployment VERCEL_DEPLOYMENT_ID and VERCEL_URL are missing"));
    assert.match(logs.at(-1), /^public_pages_refreshed \{"done":0,"waiting":1,"checked":false\}$/);
    assert.equal(probes.length, 1);
    probes.length = 0;
    claim = null;
    await get(SECRET);
    assert.deepEqual(steps.splice(0), [claimed(null)]);
  } finally {
    Object.assign(console, consoleBefore);
    globalThis.fetch = fetchBefore;
    if (before.secret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = before.secret;
  }

  // Scheduled every minute.
  const crons = JSON.parse(read("vercel.json")).crons;
  assert.deepEqual(crons.find((cron) => cron.path === "/api/internal/public-pages/refresh"), { path: "/api/internal/public-pages/refresh", schedule: "* * * * *" });
});

test("A19: the database records changes to what the cached pages show, from listings to reviews", () => {
  const migration = read("supabase/migrations/20261113130000_launch_audit_page_refresh.sql");
  const all = ["insert", "update", "delete"];
  const triggers = {
    "public.listings": all, "public.listing_photos": all, "public.listing_sound_clips": all, "public.stores": all,
    "public.profiles": ["update", "delete"], "public.transaction_reviews": all, "public.store_payment_methods": all,
    "public.store_inventory_items": all, "laria_private.assisted_commerce_settings": ["update"],
  };
  for (const [table, events] of Object.entries(triggers)) {
    const [schema, name] = table.split(".");
    for (const event of events) {
      assert.match(migration, new RegExp(`create or replace trigger ${name}_public_page_changes_${event}\\nafter ${event} on ${schema}\\.${name}\\nreferencing [^\\n]+\\nfor each statement`), `${table} ${event}`);
    }
  }
  assert.equal(migration.match(/^create or replace trigger /gm).length, 24);
  // Codex's fifth review: replacing a trigger takes the same SHARE ROW EXCLUSIVE lock as creating it, where dropping one
  // takes ACCESS EXCLUSIVE, which blocks reads too.
  assert.doesNotMatch(migration, /^(drop|create) trigger /m);
  // The listing page's sound clip and, during the payments pilot, its purchase details are covered too. The triggers
  // judge what those show as the functions that read them do, so a change to either function shows here.
  assert.match(read("components/selling/listing-sound-clip.tsx"), /from\("listing_sound_clips"\)/);
  assert.match(read("app/instrumentos/[slug]/page.tsx"), /rpc\("get_listing_purchase_request"/);
  const latest = (name) => {
    const made = new RegExp(`create (or replace )?function ${name.replace(".", "\\.")}\\(`);
    const file = fs.readdirSync("supabase/migrations").sort().reverse()
      .find((candidate) => made.test(read(`supabase/migrations/${candidate}`)));
    const text = read(`supabase/migrations/${file}`);
    const start = text.search(made);
    return text.slice(start, text.indexOf("$$;", start));
  };
  const purchase = latest("public.get_listing_purchase_request");
  assert.match(purchase, /methods := laria_private\.public_payment_methods\(listing_record\.store_id\);/);
  assert.match(purchase, /select i\.merchant_sku, i\.quantity_available into sku, available[\s\S]*i\.inventory_status = 'active';/);
  assert.match(purchase, /least\(greatest\(available, 1\), 10\)/);
  assert.match(latest("laria_private.public_payment_methods"),
    /jsonb_build_object\('method', m\.method, 'provider_label', m\.provider_label\)[\s\S]*m\.status = 'approved' and s\.status = 'active' and s\.is_verified;/);
  assert.match(migration, /\(select o\.store_id, o\.method, o\.provider_label from old_rows o where o\.status = 'approved'/);
  assert.match(migration, /where s\.status = 'active' and s\.is_verified\n/);
  assert.match(migration, /\(select o\.listing_id, o\.merchant_sku, least\(greatest\(o\.quantity_available, 1\), 10\) from old_rows o\n\s+where o\.listing_id is not null and o\.inventory_status = 'active'/);
  // Changes that come with time: a review's deadline (laria_private.review_is_visible) and a pause's end
  // (public.listing_is_paused).
  assert.match(latest("laria_private.review_is_visible"), /review_deadline\s*<=\s*now\(\)/);
  assert.match(latest("public.listing_is_paused"), /p_paused_until > \(now\(\) at time zone 'America\/Lima'\)::date/);
  // A review in either direction counts: the second one reveals the first.
  assert.doesNotMatch(migration, /direction = 'buyer_to_seller'/);
  // View counts and the check-in reminder's time change no page; sold listings stay at their address.
  assert.match(migration, /array\['view_count', 'availability_checkin_at', 'updated_at'\]/);
  assert.match(migration, /select p_status in \('approved', 'sold'\)/);
  // Every store field a cached page reads counts, and nothing else does.
  const counted = new Set([...migration.match(/row\(o\.status[\s\S]*?\)\n/)[0].matchAll(/o\.(\w+)/g)].map((match) => match[1]));
  const listingPage = read("app/instrumentos/[slug]/page.tsx");
  const shown = [
    ...listingPage.match(/\n {8}stores \(([\s\S]*?)\)/)[1].split(","),
    ...read("lib/catalog.ts").match(/const STORE_AND_PHOTO_COLUMNS = ` \(([\s\S]*?)\)/)[1].split(","),
    ...read("lib/home.ts").match(/\.from\("stores"\)\s*\.select\("([^"]+)"\)/)[1].split(","),
    ...[...read("supabase/migrations/20261109120000_ux_effortless_integration.sql")
      .match(/function public\.get_public_seller_facts[\s\S]*?\n\$\$;/)[0].matchAll(/store_row\.(\w+)/g)].map((match) => match[1]),
  ].map((field) => field.trim()).filter((field) => field && field !== "id");
  for (const field of shown) assert.ok(counted.has(field), `store field ${field} is shown but not counted`);
  for (const field of ["email", "contact_person", "listing_plan", "rejection_reason", "updated_at"]) assert.ok(!counted.has(field), field);
  // The seller's and reviewers' names, the seller's contact and start date.
  assert.match(migration, /where row\(o\.full_name, o\.phone, o\.city, o\.region, o\.created_at\)/);
  for (const field of ["full_name", "phone", "city", "region", "created_at"]) assert.match(listingPage, new RegExp(`profiles!listings_owner_user_id_fkey \\([^)]*\\b${field}\\b`), field);
  // The claim and the report are the service role's alone (tests/launch-audit-page-refresh.sql runs them).
  assert.match(migration, /grant execute on function public\.claim_public_page_changes\(text\), public\.complete_public_page_changes\(uuid, text, text\)\nto service_role;/);
  assert.match(migration, /claimed_at >= first_claimed_at \+ interval '35 seconds'/);
  // A proof counts only in the deployment that armed the row, and only a run in a named deployment arms or finishes one.
  assert.match(migration, /if length\(p_nonce\) between 8 and 100 and length\(p_deployment\) between 1 and 200 then\n\s+delete from laria_private\.public_page_changes\n\s+where claim_id = p_claim and armed_deployment = p_deployment and armed_nonce <> p_nonce;/);
  assert.match(migration, /check \(\(armed_nonce is null\) = \(armed_deployment is null\)\)/);
  assert.doesNotMatch(migration, /is not distinct from p_deployment|p_deployment is null/);
  // Codex's sixth review: a second run locks nothing of the record, since a writer holds its table's lock while its
  // trigger inserts into the record.
  assert.doesNotMatch(migration, /^\s*(alter table|create (unique )?index|drop function|create policy)\b/im);
  // Codex's seventh review: writers take the triggers' tables in many orders, so the first statement locks all of them
  // at once without waiting, lets go of all of them while one is busy, and gives up after 30 seconds. Nothing else
  // locks a table. tests/launch-audit-page-refresh-locks.integration.cjs replays a writer on each of them.
  const locks = [...migration.matchAll(/^\s*lock table ([\s\S]*?)\n\s*in (\w+(?: \w+)*) mode( nowait)?;/gm)];
  assert.equal(locks.length, 1);
  assert.equal(migration.match(/\block table\b/g).length, 1);
  assert.deepEqual(locks[0][1].split(",").map((table) => table.trim()).sort(), Object.keys(triggers).sort());
  assert.equal(locks[0][2], "share row exclusive");
  assert.equal(locks[0][3], " nowait");
  const statements = migration.replace(/^--.*\n/gm, "").trimStart();
  assert.match(statements, /^set lock_timeout = '10s';\n\ndo \$\$\ndeclare\n  give_up timestamptz := clock_timestamp\(\) \+ interval '30 seconds';\nbegin\n  loop\n    begin\n      lock table /);
  assert.match(migration, / in share row exclusive mode nowait;\n      exit;\n    exception when lock_not_available then\n      if clock_timestamp\(\) > give_up then\n        raise exception using errcode = 'lock_not_available',\n          message = 'PAGE_REFRESH_TABLES_BUSY: [^']+';\n      end if;\n      perform pg_sleep\(/);
  for (const page of ["app/page.tsx", "app/instrumentos/[slug]/page.tsx"]) assert.match(read(page), /\nexport const maxDuration = 30;\n/, page);
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
  const batches = { stores: [{ data: [{ id: "s1", slug: "casa-grau", updated_at: "2026-10-01" }], error: null }], listings: [], collections: [], services: [] };
  const client = {
    from: (table) => {
      const builder = { select: () => builder, eq: () => builder, or: () => builder, order: () => builder, range: async () => batches[table].shift() };
      return builder;
    },
    // feature-ideas services (bet-02) and discovery (disc-03) add the services and the collections.
    rpc: async () => batches.services.shift(),
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
  // The services and the collections throw on a failed read too (feature ideas, after A19).
  for (const failing of ["services", "collections"]) {
    batches.stores.push({ data: [], error: null });
    batches.listings.push({ data: [], error: null });
    batches.services.push(failing === "services" ? { data: null, error: { message: "timeout" } } : { data: [], error: null });
    if (failing === "collections") batches.collections.push({ data: null, error: { message: "timeout" } });
    await assert.rejects(sitemap(), new RegExp(`The sitemap's ${failing} could not be read: timeout`));
  }
  batches.stores.push({ data: [], error: null });
  batches.listings.push({ data: [{ id: "l1", slug: "fender-1", updated_at: "2026-10-02" }], error: null });
  batches.services.push({ data: [{ path: "/servicios/luthier/taller-ayacucho", updated_at: "2026-10-03" }], error: null });
  batches.collections.push({ data: [{ slug: "andino", updated_at: "2026-10-04" }], error: null });
  const entries = await sitemap();
  assert.ok(entries.some((entry) => entry.url === "https://laria.audio/instrumentos/fender-1"));
  assert.ok(entries.some((entry) => entry.url === "https://laria.audio/servicios/luthier/taller-ayacucho"));
  assert.ok(entries.some((entry) => entry.url === "https://laria.audio/colecciones/andino"));

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
    // Feature ideas, listing-details: the sale terms and the companions show on the page too.
    { action: "details", details: {} }, { action: "companions", companionIds: [] },
  ]) {
    const response = await post(body);
    assert.equal(response.status, 200, `${body.action}: ${await response.clone().text()}`);
  }
  assert.deepEqual(rpcs, ["set_owned_listing_lifecycle", "set_owned_listing_lifecycle", "set_owned_listing_lifecycle", "set_owned_listing_price", "submit_listing_for_publication", "update_owned_listing", "update_owned_listing_details", "set_listing_companions"]);
  assert.deepEqual(refreshed, Array(8).fill("fender-stratocaster-1b2c"));

  // A copy is a new draft, not a change to this page.
  assert.equal((await post({ action: "duplicate" })).status, 200);
  rpcError = { message: "LISTING_PRICE_INVALID" };
  assert.equal((await post({ action: "price", price_pen: "2300" })).status, 409);
  assert.equal((await post({ action: "hide" })).status, 409);
  assert.equal(refreshed.length, 8);
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

test("A19 follow-up: the claim's update of every waiting row has a WHERE clause, which Supabase requires on API calls", () => {
  const claimOf = (file) =>
    read(`supabase/migrations/${file}`).match(/create or replace function public\.claim_public_page_changes[\s\S]*?\n\$\$;\n/)[0];
  const first = claimOf("20261113130000_launch_audit_page_refresh.sql");
  const fixed = claimOf("20261113140000_launch_audit_page_refresh_safeupdate.sql");
  // The same function but for that one statement (tests/api-safeupdate.integration.cjs scans every function).
  assert.equal(
    fixed.replace(/\n {2}-- Every waiting row[^\n]*\n {2}--[^\n]*\n/, "\n").replace("set claim_id = claim where true;", "set claim_id = claim;"),
    first,
  );
  assert.match(fixed, /\n {2}update laria_private\.public_page_changes set claim_id = claim where true;\n/);
  const fix = read("supabase/migrations/20261113140000_launch_audit_page_refresh_safeupdate.sql");
  assert.doesNotMatch(fix.replace(/^--.*\n/gm, ""), /\b(lock table|alter table|grant|revoke|create policy|create (or replace )?trigger)\b/i);
});
