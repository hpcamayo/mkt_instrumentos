const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function load(filename, mocks = {}) {
  const source = path.resolve(filename);
  const compiled = ts.transpileModule(fs.readFileSync(source, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = new Module(source, module);
  mod.filename = source;
  mod.paths = module.paths;
  mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  mod._compile(compiled, source);
  return mod.exports;
}

const payload = load("lib/marketplace-event-payload.ts");
const listingId = "76000000-0000-4000-8000-000000000001";
const storeId = "76000000-0000-4000-8000-000000000002";
const eventId = "76000000-0000-4000-8000-000000000003";

test("client event transport has exact entity/type keys and no forged identity/authority", () => {
  const base = { type: "listing_view", eventId, listingId, source: "detail" };
  assert.deepEqual(payload.parseClientEvent(base), base);
  assert.ok(payload.parseClientEvent({ type: "listing_impression", eventId, listingId, source: "catalog" }));
  assert.ok(payload.parseClientEvent({ type: "store_view", eventId, storeId, source: "store" }));
  assert.ok(payload.parseClientEvent({ type: "search", eventId, searchReceipt: "signed-receipt", source: "catalog" }));
  assert.ok(payload.parseClientEvent({ type: "filter_applied", eventId, searchReceipt: "signed-receipt", source: "catalog" }));
  for (const field of ["actorUserId", "sellerUserId", "buyerId", "ownerUserId", "sessionId", "metadata", "message", "draft", "password", "resultCount", "query", "isAdmin"]) {
    assert.equal(payload.parseClientEvent({ ...base, [field]: "forged" }), null, field);
  }
  for (const type of ["whatsapp_contact", "store_contact", "listing_approved", "listing_rejected", "listing_sold", "store_verified", "listing_creation_started", "store_application_started", "favorite_added", "transaction_verified"]) {
    assert.equal(payload.parseClientEvent({ ...base, type }), null, type);
  }
  for (const value of [null, [], "json", {}, { ...base, eventId: "invalid" }, { ...base, listingId: "invalid" }, { ...base, storeId }, { ...base, searchReceipt: "invalid" }, { ...base, source: "uncontrolled" }, { type: "store_view", eventId, storeId, listingId }, { type: "search", eventId, searchReceipt: "x".repeat(8193) }]) {
    assert.equal(payload.parseClientEvent(value), null);
  }
});

test("search metadata uses actual catalog state, excludes pagination and bounds freeform values", () => {
  const filters = { category: "guitars", brand: "Y".repeat(300), city: "Lima", instrumentType: "electric_guitar", minPrice: 10, maxPrice: 500, sellerType: "store", sort: "newest", advanced: { body_type: "solid_body", handedness: "X".repeat(200), pickups: Array.from({ length: 30 }, () => "A".repeat(200)), enabled: false, pieces: 5 } };
  const metadata = payload.searchEventMetadata(filters, 2);
  assert.equal(metadata.query.length, 200);
  assert.equal(metadata.filters.brand.length, 200);
  assert.equal(metadata.filters.advanced.handedness.length, 100);
  assert.equal(metadata.filters.advanced.pickups.length, 20);
  assert.equal(metadata.filters.advanced.pickups[0].length, 100);
  assert.equal(metadata.filters.advanced.enabled, false);
  assert.equal(metadata.filters.advanced.pieces, 5);
  assert.equal(metadata.result_count, 2);
  assert.equal(metadata.zero_results, false);
  assert.ok(!Object.hasOwn(metadata.filters, "page"));
  assert.ok(!Object.hasOwn(metadata.filters, "q"));
  assert.equal(payload.searchEventMetadata({ sort: "newest", advanced: {} }, 0).zero_results, true);
  assert.equal(payload.searchEventMetadata(filters, 10000001).result_count, 10000000);
});

function serverWithJar(jar) {
  return load("lib/marketplace-events-server.ts", {
    "server-only": {},
    "next/headers": { cookies: async () => jar },
    "@/lib/marketplace-event-payload": payload,
    "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => null },
    "@/lib/supabase/server-client": { getSupabaseServerClient: async () => null },
  });
}

test("anonymous identity is a signed random first-party HttpOnly session, not a browser fingerprint", async () => {
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-only-unit-test-signing-key";
  let value;
  let options;
  const jar = { get: () => value ? { value } : undefined, set: (_name, nextValue, settings) => { value = nextValue; options = settings; } };
  try {
    const server = serverWithJar(jar);
    const first = await server.getMarketplaceSession();
    assert.ok(payload.isUuid(first));
    assert.equal(await server.getMarketplaceSession(), first);
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, "lax");
    assert.equal(options.maxAge, 86400);
    assert.equal(options.path, "/");
    const signedToken = value;
    const sessionPayload = JSON.parse(Buffer.from(value.split(".")[0], "base64url").toString());
    assert.deepEqual(Object.keys(sessionPayload).sort(), ["id", "issuedAt"]);
    assert.equal(sessionPayload.id, first);
    value += "x";
    assert.notEqual(await server.getMarketplaceSession(), first);
    value = signedToken;
    assert.equal(await server.getMarketplaceSession(), first);
    assert.equal(await server.getMarketplaceActor(), null);
    assert.equal(await server.recordMarketplaceEvent({ type: "listing_view", sessionId: first, eventId, actorId: null, listingId }), null, "Configuration outages are explicit, not synthetic zero metrics.");
  } finally {
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test("the trusted recorder supplies only verified actor/session and canonical target inputs", async () => {
  const calls = [];
  const server = load("lib/marketplace-events-server.ts", {
    "server-only": {},
    "next/headers": { cookies: async () => ({}) },
    "@/lib/marketplace-event-payload": payload,
    "@/lib/supabase/server-client": { getSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: storeId } } }) } }) },
    "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => ({ rpc: (name, args) => { calls.push({ name, args }); return { abortSignal: async () => ({ data: { recorded: true, view_count: 8 }, error: null }) }; } }) },
  });
  const actorId = await server.getMarketplaceActor();
  assert.equal(actorId, storeId);
  const result = await server.recordMarketplaceEvent({ type: "listing_view", actorId, sessionId: eventId, eventId, listingId, source: "detail" });
  assert.deepEqual(result, { recorded: true, view_count: 8 });
  assert.equal(calls[0].name, "record_marketplace_event");
  assert.equal(calls[0].args.p_actor_user_id, actorId);
  assert.equal(calls[0].args.p_session_id, eventId);
  assert.equal(calls[0].args.p_listing_id, listingId);
  assert.deepEqual(calls[0].args.p_metadata, {});
  assert.ok(!Object.hasOwn(calls[0].args, "p_seller_user_id"));
});

test("search receipts authenticate canonical counts/state and reject tampering, expiry and future issuance", () => {
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const now = Date.now;
  const fixed = now();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-only-unit-test-signing-key";
  Date.now = () => fixed;
  try {
    const server = serverWithJar({});
    const filters = { brand: "Yamaha", city: "Lima", sort: "newest", advanced: {} };
    const receipt = server.createSearchReceipt(filters, 2);
    assert.ok(receipt);
    assert.deepEqual(server.readSearchReceipt(receipt), payload.searchEventMetadata(filters, 2));
    assert.equal(server.readSearchReceipt(`${receipt}x`), null);
    assert.equal(server.readSearchReceipt("broken"), null);
    const [data, signature] = receipt.split(".");
    const altered = JSON.parse(Buffer.from(data, "base64url").toString());
    altered.metadata.result_count = 9999;
    assert.equal(server.readSearchReceipt(`${Buffer.from(JSON.stringify(altered)).toString("base64url")}.${signature}`), null);
    Date.now = () => fixed + 15 * 60 * 1000 + 1;
    assert.equal(server.readSearchReceipt(receipt), null);
    Date.now = () => fixed - 1;
    assert.equal(server.readSearchReceipt(receipt), null);
  } finally {
    Date.now = now;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test("event writes reject cross-site/cross-origin but allow same-origin ordinary requests", () => {
  const server = serverWithJar({});
  assert.equal(server.sameOriginEventRequest(new Request("https://laria.audio/api/events", { headers: { Origin: "https://laria.audio" } })), true);
  assert.equal(server.sameOriginEventRequest(new Request("https://laria.audio/api/events")), true);
  assert.equal(server.sameOriginEventRequest(new Request("https://laria.audio/api/events", { headers: { Origin: "https://evil.example.invalid" } })), false);
  assert.equal(server.sameOriginEventRequest(new Request("https://laria.audio/api/events", { headers: { "Sec-Fetch-Site": "cross-site" } })), false);
});
