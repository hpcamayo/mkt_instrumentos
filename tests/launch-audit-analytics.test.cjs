// Launch audit A33: a visitor's event batch is recorded in one database call (the database side, the impression
// rollup and the analytics readers are tests/launch-audit-analytics.sql).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function load(filename, mocks = {}) {
  const source = path.resolve(filename);
  const compiled = ts.transpileModule(fs.readFileSync(source, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = new Module(source, module);
  mod.filename = source;
  mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = (name) => (Object.hasOwn(mocks, name) ? mocks[name] : original(name));
  mod._compile(compiled, source);
  return mod.exports;
}

const payload = load("lib/marketplace-event-payload.ts");
const listingId = "a3300000-0000-4000-8000-000000000021";
const storeId = "a3300000-0000-4000-8000-000000000010";
const sessionId = "a3300000-0000-4000-8000-000000000031";
const ids = Array.from({ length: 3 }, (_, index) => `a3300000-0000-4000-8000-00000000010${index + 1}`);

function recorder(respond) {
  const calls = [];
  const server = load("lib/marketplace-events-server.ts", {
    "server-only": {},
    "next/headers": { cookies: async () => ({}) },
    "@/lib/marketplace-event-payload": payload,
    "@/lib/supabase/server-client": { getSupabaseServerClient: async () => null },
    "@/lib/supabase/admin-client": {
      getSupabaseAdminClient: () => respond === null ? null : ({
        rpc: (name, args) => {
          const call = { name, args };
          calls.push(call);
          return { abortSignal: async (signal) => { call.signal = signal; return respond(args); } };
        },
      }),
    },
  });
  return { server, calls };
}

async function captureErrors(run) {
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);
  try {
    return { result: await run(), logged: logged.map((args) => ({ label: args[0], ...JSON.parse(args[1]) })) };
  } finally {
    console.error = original;
  }
}

const batch = [
  { type: "listing_view", eventId: ids[0], listingId, source: "detail" },
  { type: "listing_impression", eventId: ids[1], listingId, source: "catalog" },
  { type: "store_view", eventId: ids[2], storeId, source: "store" },
];

test("A33: the whole batch goes to the database in one call, with the verified session and actor only", async () => {
  const { server, calls } = recorder(() => ({
    data: [
      { event_id: ids[0], recorded: true, view_count: 6 },
      { event_id: ids[1], recorded: false },
      { event_id: ids[2], recorded: true, view_count: null },
    ],
    error: null,
  }));
  const receipts = await server.recordMarketplaceEvents({ sessionId, actorId: null, requestId: "request-id", events: [...batch.slice(0, 2), { ...batch[2], metadata: { result_count: 1 } }] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "record_marketplace_events");
  assert.deepEqual(Object.keys(calls[0].args).sort(), ["p_actor_user_id", "p_events", "p_session_id"]);
  assert.equal(calls[0].args.p_session_id, sessionId);
  assert.equal(calls[0].args.p_actor_user_id, undefined, "an anonymous visitor sends no actor");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args.p_events)), [
    { event_id: ids[0], event_type: "listing_view", listing_id: listingId, source: "detail", metadata: {} },
    { event_id: ids[1], event_type: "listing_impression", listing_id: listingId, source: "catalog", metadata: {} },
    { event_id: ids[2], event_type: "store_view", store_id: storeId, source: "store", metadata: { result_count: 1 } },
  ]);
  assert.ok(calls[0].signal instanceof AbortSignal, "the call has a deadline");
  // One receipt per event, in order, with its id; view_count only where the database gave one.
  assert.deepEqual(receipts, [
    { eventId: ids[0], recorded: true, view_count: 6 },
    { eventId: ids[1], recorded: false },
    { eventId: ids[2], recorded: true, view_count: null },
  ]);

  const signedIn = recorder(() => ({ data: [{ event_id: ids[0], recorded: true, view_count: 7 }], error: null }));
  await signedIn.server.recordMarketplaceEvents({ sessionId, actorId: storeId, events: [{ type: "listing_view", eventId: ids[0], listingId }] });
  assert.equal(signedIn.calls[0].args.p_actor_user_id, storeId);
  assert.equal(signedIn.calls[0].args.p_events[0].source, "other", "a missing source is sent as other, as before");
});

test("A33: a failed, partial or mismatched batch is reported as not recorded, so the browser resends it once", async () => {
  const send = (respond) => {
    const { server } = recorder(respond);
    return captureErrors(() => server.recordMarketplaceEvents({ sessionId, actorId: null, requestId: "request-id", events: batch }));
  };
  const failed = await send(() => ({ data: null, error: { code: "40P01", message: "deadlock detected" } }));
  assert.equal(failed.result, null);
  assert.deepEqual(failed.logged, [{ label: "marketplace_event_failure", request_id: "request-id", event_type: "event_batch", failure_category: "database_rpc", failure_code: "40P01" }]);

  const receipt = (index, extra = {}) => ({ event_id: ids[index], recorded: true, ...extra });
  for (const data of [
    null,
    { recorded: true },
    [receipt(0), receipt(1)],
    [receipt(0), receipt(2), receipt(1)],
    [receipt(0), receipt(1), receipt(2), receipt(2)],
    [receipt(0), receipt(1), { event_id: ids[2], recorded: "true" }],
    [receipt(0), null, receipt(2)],
  ]) {
    const mismatch = await send(() => ({ data, error: null }));
    assert.equal(mismatch.result, null, JSON.stringify(data));
    assert.equal(mismatch.logged[0].failure_code, "receipt_mismatch");
  }

  const timedOut = await send(() => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); });
  assert.equal(timedOut.result, null);
  assert.equal(timedOut.logged[0].failure_category, "timeout");
  const lost = await send(() => { throw new TypeError("fetch failed"); });
  assert.equal(lost.result, null);
  assert.deepEqual([lost.logged[0].failure_category, lost.logged[0].failure_code], ["transport", "TypeError"]);

  const { server } = recorder(null);
  const unconfigured = await captureErrors(() => server.recordMarketplaceEvents({ sessionId, actorId: null, events: batch }));
  assert.equal(unconfigured.result, null);
  assert.deepEqual([unconfigured.logged[0].failure_category, unconfigured.logged[0].failure_code], ["configuration", "admin_client_unavailable"]);
});

test("A33: /api/events answers with the receipts of one batch call, 503 when it was not recorded, and checks input first", async () => {
  let receipts;
  const batches = [];
  const route = load("app/api/events/route.ts", {
    "next/server": { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init.headers } }) } },
    "@/lib/marketplace-event-payload": payload,
    "@/lib/marketplace-events-server": {
      sameOriginEventRequest: (request) => request.headers.get("Origin") !== "https://evil.example.invalid",
      getMarketplaceActor: async () => null,
      getMarketplaceSession: async () => sessionId,
      readSearchReceipt: () => null,
      recordMarketplaceEvents: async (input) => { batches.push(input); return receipts; },
      recordMarketplaceEvent: async () => { throw new Error("the batch route records no event on its own"); },
      logMarketplaceEventFailure: () => undefined,
    },
  });
  const post = async (body, headers = {}) => {
    const response = await route.POST(new Request("https://laria.audio/api/events", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json(), headers: response.headers };
  };

  receipts = batch.map((event, index) => ({ eventId: event.eventId, recorded: index !== 1, ...(index === 0 ? { view_count: 6 } : {}) }));
  const ok = await post({ events: batch });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { events: receipts });
  assert.equal(ok.headers.get("Cache-Control"), "no-store");
  assert.ok(ok.headers.get("X-Request-Id"));
  assert.equal(batches.length, 1, "one database call for the whole batch");
  assert.equal(batches[0].sessionId, sessionId);
  assert.equal(batches[0].actorId, null);
  assert.equal(batches[0].requestId, ok.headers.get("X-Request-Id"));
  assert.deepEqual(batches[0].events.map((event) => event.eventId), ids);
  assert.deepEqual(batches[0].events.map((event) => event.metadata), [{}, {}, {}]);

  receipts = null;
  const unavailable = await post({ events: batch });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(unavailable.body, { error: "No se pudo registrar la actividad." });
  assert.equal(batches.length, 2);

  const tooMany = Array.from({ length: 21 }, () => ({ type: "listing_impression", eventId: crypto.randomUUID(), listingId, source: "catalog" }));
  for (const body of [{ events: [] }, { events: tooMany }, { events: [{ ...batch[0], sellerUserId: storeId }] }, { events: batch, extra: true }]) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal((await post({ events: batch }, { Origin: "https://evil.example.invalid" })).status, 403);
  assert.equal(batches.length, 2, "nothing reaches the database before the batch is valid");
});
