const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadTypeScript(filename, mocks) {
  const compiled = ts.transpileModule(fs.readFileSync(path.resolve(filename), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name), mod, mod.exports,
  );
  return mod.exports;
}

const listingId = "78000000-0000-4000-8000-000000000001";
const userId = "78000000-0000-4000-8000-000000000002";
const attemptId = "78000000-0000-4000-8000-000000000003";
const retiredPath = `${userId}/listing-edits/${listingId}/${attemptId}/0.jpg`;
const unusedPath = `${userId}/listing-edits/${listingId}/${attemptId}/1.png`;

function cleanupHarness({ available = true, claim, remove } = {}) {
  const calls = { clients: 0, claims: [], removals: [], signals: [] };
  const helper = loadTypeScript("lib/listing-photo-cleanup.ts", {
    "server-only": {},
    "@/lib/supabase/admin-client": { getSupabaseAdminClient() {
      calls.clients++;
      if (!available) return null;
      return {
        rpc(name, args) {
          calls.claims.push({ name, args });
          const request = Promise.resolve().then(() => claim ? claim(args, calls.claims.length) : { data: args.p_paths, error: null });
          request.abortSignal = (signal) => { calls.signals.push(signal); return request; };
          return request;
        },
        storage: { from: (bucket) => ({ async remove(paths, options) {
          calls.removals.push({ bucket, paths, options });
          return remove ? remove(paths, calls.removals.length) : { data: [], error: null };
        } }) },
      };
    } },
  });
  return { calls, cleanup: helper.cleanupListingEditUploads };
}

test("empty photo cleanup is genuinely successful without creating a service client", async () => {
  const helper = cleanupHarness({ available: false });
  assert.deepEqual(await helper.cleanup(listingId, userId, []), []);
  assert.equal(helper.calls.clients, 0);
  assert.equal(helper.calls.claims.length, 0);
  assert.equal(helper.calls.removals.length, 0);
});

test("no eligible cleanup paths is distinct from unavailable service or failed trusted claims", async () => {
  const noEligible = cleanupHarness({ claim: () => ({ data: [], error: null }) });
  assert.deepEqual(await noEligible.cleanup(listingId, userId, [retiredPath]), []);
  assert.deepEqual(noEligible.calls.removals, []);
  const unavailable = cleanupHarness({ available: false });
  assert.equal(await unavailable.cleanup(listingId, userId, [retiredPath]), null);
  const failedClaim = cleanupHarness({ claim: () => ({ data: [], error: { message: "Private service diagnostics" } }) });
  assert.equal(await failedClaim.cleanup(listingId, userId, [retiredPath]), null);
  assert.deepEqual(failedClaim.calls.removals, []);
});

test("cleanup deletes only deduplicated trusted eligible paths using the authenticated listing and user scope", async () => {
  const helper = cleanupHarness({ claim: () => ({ data: [unusedPath], error: null }) });
  assert.deepEqual(await helper.cleanup(listingId, userId, [retiredPath, unusedPath, retiredPath]), [unusedPath]);
  assert.deepEqual(helper.calls.claims, [{ name: "claim_listing_photo_cleanup", args: {
    p_listing_id: listingId, p_user_id: userId, p_bucket: "listing-edit-photos", p_paths: [retiredPath, unusedPath],
  } }]);
  assert.equal(helper.calls.removals.length, 1);
  assert.equal(helper.calls.removals[0].bucket, "listing-edit-photos");
  assert.deepEqual(helper.calls.removals[0].paths, [unusedPath]);
});

test("failed deletion remains an explicit failure and retries the exact already-retired paths safely", async () => {
  const helper = cleanupHarness({ remove: (_paths, number) => ({ error: number === 1 ? { message: "Storage temporarily unavailable" } : null }) });
  assert.equal(await helper.cleanup(listingId, userId, [retiredPath]), null);
  assert.deepEqual(await helper.cleanup(listingId, userId, [retiredPath]), [retiredPath]);
  assert.equal(helper.calls.claims.length, 2);
  assert.deepEqual(helper.calls.claims[1], helper.calls.claims[0]);
  assert.deepEqual(helper.calls.removals.map(({ bucket, paths }) => ({ bucket, paths })), [
    { bucket: "listing-edit-photos", paths: [retiredPath] },
    { bucket: "listing-edit-photos", paths: [retiredPath] },
  ]);
});

test("unexpected claim and Storage transport exceptions return failure rather than fabricated empty success", async () => {
  for (const options of [
    { claim: () => { throw new Error("Claim transport failed with private details"); } },
    { remove: () => { throw new Error("Storage transport failed with private details"); } },
  ]) {
    const helper = cleanupHarness(options);
    assert.equal(await helper.cleanup(listingId, userId, [retiredPath]), null);
  }
});

function routeHarness({ user = { id: userId }, owned = true, available = true, removed = [], cleanup } = {}) {
  const calls = { auth: 0, queries: [], cleanup: [] };
  const supabase = {
    auth: { getUser: async () => { calls.auth++; return { data: { user } }; } },
    from(table) {
      const query = { table, select: [], filters: [] };
      calls.queries.push(query);
      const chain = {
        select(fields) { query.select.push(fields); return chain; },
        eq(field, value) { query.filters.push([field, value]); return chain; },
        abortSignal() { return chain; },
        async maybeSingle() { return { data: owned ? { id: listingId } : null, error: null }; },
      };
      return chain;
    },
  };
  const { POST } = loadTypeScript("app/api/listings/[id]/photo-cleanup/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => new Response(JSON.stringify(body), { status: options.status ?? 200 }) } },
    "@/lib/supabase/server-client": { getSupabaseServerClient: async () => available ? supabase : null },
    "@/lib/listing-photo-cleanup": { async cleanupListingEditUploads(...args) {
      calls.cleanup.push(args);
      return cleanup ? cleanup(...args) : removed;
    } },
  });
  return {
    calls,
    post(body = { paths: [retiredPath], bucket: "listing-edit-photos" }) {
      return POST({ json: async () => body }, { params: Promise.resolve({ id: listingId }) });
    },
  };
}

test("cleanup endpoint requires a server-authenticated owner and binds cleanup to that identity, not client owner claims", async () => {
  const route = routeHarness({ removed: [retiredPath] });
  const result = await route.post({ paths: [retiredPath], bucket: "listing-edit-photos", userId: "forged-user", owner_user_id: "forged-owner" });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, removed: [retiredPath] });
  assert.deepEqual(route.calls.queries, [{ table: "listings", select: ["id"], filters: [["id", listingId], ["owner_user_id", userId]] }]);
  assert.deepEqual(route.calls.cleanup, [[listingId, userId, [retiredPath], "listing-edit-photos"]]);
});

test("anonymous, unavailable-auth and unrelated-owner cleanup are denied without any service operation", async () => {
  for (const [options, expected] of [[{ user: null }, 401], [{ available: false }, 401], [{ owned: false }, 404]]) {
    const route = routeHarness(options);
    const result = await route.post();
    assert.equal(result.status, expected);
    assert.deepEqual(route.calls.cleanup, []);
    assert.equal((await result.json()).ok, undefined);
  }
});

test("cleanup endpoint reports Storage or claim failure as generic 503, preserving caller retry evidence", async () => {
  const route = routeHarness({ removed: null });
  const result = await route.post();
  assert.equal(result.status, 503);
  const body = await result.json();
  assert.equal(body.ok, undefined);
  assert.equal(body.removed, undefined);
  assert.match(body.message, /limpieza segura.*Intenta nuevamente/);
  assert.equal(JSON.stringify(body).includes("service"), false);
});

test("cleanup endpoint reports zero eligible references as real 200 success, not outage", async () => {
  const route = routeHarness({ removed: [] });
  const result = await route.post();
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, removed: [] });
});

test("cleanup endpoint validates supported bucket/string paths and the one-hundred-path bound before authentication", async () => {
  const invalid = [null, {}, { paths: "bad", bucket: "listing-edit-photos" }, { paths: [7], bucket: "listing-edit-photos" }, { paths: [], bucket: "arbitrary-bucket" }, { paths: Array(101).fill(retiredPath), bucket: "listing-edit-photos" }];
  for (const body of invalid) {
    const route = routeHarness();
    const result = await route.post(body);
    assert.equal(result.status, 400);
    assert.equal(route.calls.auth, 0);
    assert.deepEqual(route.calls.cleanup, []);
  }
  const route = routeHarness();
  const result = await route.post({ paths: Array(100).fill(retiredPath), bucket: "listing-edit-photos" });
  assert.equal(result.status, 200);
  assert.equal(route.calls.cleanup[0][2].length, 100);
});
