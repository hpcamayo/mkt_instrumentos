// Actual local HTTP/Supabase proof of Sprint 4 event integrity and analytics.
// LARIA_TEST_ENV_FILE=/absolute/local.env node tests/analytics.integration.cjs http://localhost:3100
const assert = require("node:assert/strict");
const { loadEnvFile } = require("node:process");
const { createClient } = require("@supabase/supabase-js");

loadEnvFile(process.env.LARIA_TEST_ENV_FILE ?? ".env.local");
const base = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
assert.ok(base && localHosts.has(new URL(base).hostname), "Analytics QA must run only on a local app.");
assert.ok(url && localHosts.has(new URL(url).hostname), "Analytics QA must use local Supabase, never production.");
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonymous = createClient(url, anonKey, { auth: { persistSession: false } });
const users = [];
const listings = [];
const stores = [];
const objects = [];
const eventIds = [];
const sessionIds = [];
const suffix = crypto.randomUUID();
// Real, CRC-valid PNG bytes so browser decoding is part of the image proof.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAIAAABvFaqvAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAKElEQVR4nGNQTX5NFcQwapDqaBipjqaj5NEskjxajLweLSFfD2QtAgBZoULucEia/gAAAABJRU5ErkJggg==", "base64");

(async () => {
  try {
    const owner = await createUser("owner", "seller", "51999999501");
    const other = await createUser("other", "seller", "51999999502");
    const buyer = await createUser("buyer", "seller", "51999999505");
    const admin = await createUser("admin", "seller", "51999999504", { role: "admin" });
    const storeOwner = await createUser("store", "store_owner", "51999999503");
    const [ownerSession, otherSession, buyerSession, adminSession, storeSession] = await Promise.all([owner, other, buyer, admin, storeOwner].map(signIn));
    const visitors = await Promise.all([newVisitor(), newVisitor(), newVisitor()]);
    const live = await fixtureListing(owner.id, "approved", 7);
    const pending = await fixtureListing(owner.id, "pending");
    const sold = await fixtureListing(owner.id, "sold");
    const hidden = await fixtureListing(owner.id, "hidden");
    await fixtureListing(owner.id, "rejected");
    // Seven owned rows prove account aggregates are not limited to the latest-five summary query.
    await fixtureListing(owner.id, "approved");
    await fixtureListing(owner.id, "approved");

    const before = await eventCount({ listing_id: live.id, event_type: "listing_view" });
    for (const method of ["GET", "HEAD"]) {
      const response = await fetch(`${base}/instrumentos/${live.slug}`, { method });
      assert.equal(response.status, 200);
    }
    const prefetch = await fetch(`${base}/instrumentos/${live.slug}`, { headers: { RSC: "1", "Next-Router-Prefetch": "1" } });
    assert.equal(prefetch.status, 200);
    assert.equal(await eventCount({ listing_id: live.id, event_type: "listing_view" }), before, "SSR/prefetch alone cannot record a view.");

    const impression = await emit(buyerSession, { type: "listing_impression", listingId: live.id, source: "catalog" });
    assert.equal(impression.recorded, true);
    assert.equal((await emit(buyerSession, { type: "listing_impression", listingId: live.id, source: "catalog" })).recorded, false);
    assert.equal((await emit(visitors[0], { type: "listing_impression", listingId: live.id, source: "catalog" })).recorded, true);
    const firstView = await emit(buyerSession, { type: "listing_view", listingId: live.id, source: "detail" });
    assert.equal(firstView.recorded, true);
    assert.equal(firstView.view_count, 8);
    assert.equal((await emit(buyerSession, { type: "listing_view", listingId: live.id, source: "detail" })).recorded, false);
    const replaySession = await signIn(buyer);
    assert.equal((await emit(replaySession, { type: "listing_view", listingId: live.id, source: "detail" })).recorded, false, "Auth identity survives browser session rotation for dedupe.");
    for (const visitor of visitors.slice(0, 2)) assert.equal((await emit(visitor, { type: "listing_view", listingId: live.id, source: "detail" })).recorded, true);
    const raced = await Promise.all(Array.from({ length: 4 }, () => emit(visitors[2], { type: "listing_view", listingId: live.id, source: "detail" })));
    assert.equal(raced.filter((result) => result.recorded).length, 1, "Concurrent rolling-window requests must serialize to exactly one view.");
    assert.equal((await getListing(live.id)).view_count, 11);
    assert.equal(await eventCount({ listing_id: live.id, event_type: "listing_view" }), before + 4);
    for (const session of [ownerSession, adminSession]) {
      for (const type of ["listing_view", "listing_impression"]) assert.equal((await emit(session, { type, listingId: live.id, source: "detail" })).recorded, false);
    }
    for (const item of [pending, sold, hidden]) {
      for (const type of ["listing_view", "listing_impression"]) assert.equal((await emit(visitors[0], { type, listingId: item.id, source: "detail" })).recorded, false);
    }
    console.log("PASS AN-001/002: no SSR/prefetch view; anonymous/auth dedupe; session rotation; concurrent4→1; owner/admin/nonpublic exclusion; preserved legacy cache.");

    await verifyStrictTransport(buyerSession, ownerSession, live);
    for (const [session, source] of [[buyerSession, "detail"], [buyerSession, "seller_panel"], [visitors[0], "detail"]]) {
      const contact = await contactRequest(session, { listingId: live.id, source });
      assert.equal(new URL(contact.url).hostname, "wa.me");
      assert.equal(new URL(contact.url).pathname, "/51999999501", "Current profile contact, not stale listing-level phone, is canonical.");
    }
    const contactRows = await rows("marketplace_events", { listing_id: live.id, event_type: "whatsapp_contact" });
    assert.equal(contactRows.length, 3);
    assert.equal(contactRows.filter((row) => row.actor_user_id === buyer.id).length, 2);
    assert.equal(contactRows.filter((row) => row.actor_user_id === null).length, 1);
    assert.ok(contactRows.every((row) => row.seller_user_id === owner.id && row.store_id === null && Date.parse(row.created_at) > 0));
    assert.ok(contactRows.every((row) => Object.keys(row.metadata).length === 0));
    console.log("PASS WA-001–007: anonymous/auth contact URL, canonical seller/buyer/timestamp/source, repeat click counts, no message/draft telemetry.");

    const report = await rpc(ownerSession.client, "get_account_analytics", { p_days: 0 });
    assert.equal(report.listings.length, 7);
    assert.equal(report.summary.active, 3);
    assert.equal(report.summary.sold, 1);
    assert.equal(report.summary.views, 11);
    assert.equal(report.summary.recorded_views, 4);
    assert.equal(report.summary.impressions, 2);
    assert.equal(report.summary.contacts, 3);
    assert.equal(report.summary.ctr, 2);
    assert.equal(report.summary.contact_rate, 0.75);
    assert.ok(report.tracking_started_at);
    for (const days of [7, 30]) assert.equal((await rpc(ownerSession.client, "get_account_analytics", { p_days: days })).summary.views, 4);
    assert.equal(report.listings.find((item) => item.id === sold.id).status, "sold");
    assert.ok(report.listings.find((item) => item.id === live.id).published_at);
    assert.ok(report.listings.find((item) => item.id === sold.id).sold_at);
    assert.ok(!JSON.stringify(report).includes(buyer.id), "Aggregate output cannot expose a buyer directory.");
    for (const field of ["revenue", "gmv"]) assert.ok(!JSON.stringify(report).includes(field), `Inactive ${field} metric must not be fabricated.`);
    const empty = await rpc(otherSession.client, "get_account_analytics", { p_days: 0 });
    assert.equal(empty.summary.views, 0);
    assert.ok(empty.summary.ctr === null || empty.summary.ctr === 0);
    assertDenied(await otherSession.client.rpc("get_account_analytics", { p_owner_id: owner.id }), "P0001", "Analytics access denied.");
    assertDenied(await anonymous.rpc("get_account_analytics", {}));
    assertDenied(await buyerSession.client.rpc("get_marketplace_admin_analytics", {}), "P0001", "Admin access required.");
    const raw = await buyerSession.client.from("marketplace_events").select("id");
    assertDenied(raw);
    assertDenied(await buyerSession.client.rpc("record_marketplace_event", { p_event_type: "whatsapp_contact", p_session_id: crypto.randomUUID(), p_event_id: crypto.randomUUID(), p_actor_user_id: other.id, p_listing_id: live.id }));
    assertDenied(await buyerSession.client.rpc("increment_listing_view_count", { p_listing_id: live.id }));
    await rpc(ownerSession.client, "get_account_analytics", { p_days: 0 });
    console.log("PASS SANA-001/003–006/008/009, AN-012/013: complete seven-row aggregates, lifetime versus event windows, metadata, ratios, empty safety and ownership/raw-log/buyer privacy.");

    await verifySearchReceipts(visitors[0], adminSession);
    await verifyLifecycle(ownerSession, storeSession, adminSession, buyerSession, visitors[0]);
    if (process.env.LARIA_ANALYTICS_BROWSER === "1") {
      const { runAnalyticsBrowserSmoke } = require("./analytics-browser-smoke.cjs");
      const created = await runAnalyticsBrowserSmoke({ base, service, ownerSession, otherSession, storeSession, buyerSession, live, sold, visitor: visitors[0] });
      if (created?.eventIds) eventIds.push(...created.eventIds);
      if (created?.sessionIds) sessionIds.push(...created.sessionIds);
    }
    console.log("PASS analytics HTTP/DB acceptance integration.");
  } catch (error) {
    console.error("Analytics acceptance stage failed:", error);
    throw error;
  } finally {
    await cleanupFixtures();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

async function verifyStrictTransport(buyerSession, ownerSession, live) {
  for (const body of [
    { events: [{ type: "listing_view", listingId: live.id, actorUserId: ownerSession.user.id }] },
    { events: [{ type: "listing_view", listingId: live.id, sellerUserId: ownerSession.user.id }] },
    { events: [{ type: "listing_view", listingId: live.id, metadata: { message: "do not persist" } }] },
    { events: [{ type: "listing_approved", listingId: live.id }] },
    { events: [{ type: "listing_creation_started", listingId: live.id }] },
    { events: [{ type: "listing_view", listingId: "not-a-uuid" }] },
    { events: [{ type: "listing_view", listingId: live.id }], actorUserId: ownerSession.user.id },
  ]) await post("/api/events", buyerSession, body, [400, 403]);
  for (const body of [
    { listingId: live.id, actorUserId: ownerSession.user.id },
    { listingId: live.id, message: "do not persist" },
    { listingId: live.id, draft: "do not persist" },
    { listingId: live.id, storeId: crypto.randomUUID() },
  ]) await post("/api/contact", buyerSession, body, [400, 403]);
  await post("/api/events", buyerSession, { events: [{ type: "listing_view", listingId: live.id }] }, [400, 403], { Origin: "https://evil.example.invalid" });
  assert.ok((await fetch(`${base}/api/events`)).status >= 400, "GET must not record events.");
  console.log("PASS strict transport: forged actors/sellers/lifecycle/freeform drafts and cross-origin requests denied.");
}

async function verifySearchReceipts(visitor, adminSession) {
  const before = await rpc(adminSession.client, "get_marketplace_admin_analytics", { p_days: 0 });
  for (const [brand, expectZero] of [["Yamaha", false], [`nonexistent-${suffix}`, true]]) {
    const response = await fetch(`${base}/listados?brand=${encodeURIComponent(brand)}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    const receipt = extractSearchReceipt(html);
    assert.ok(receipt, "SSR must expose the signed canonical search receipt to its client tracker.");
    const eventId = crypto.randomUUID();
    const search = { type: "search", source: "catalog", searchReceipt: receipt, eventId };
    assert.equal((await emit(visitor, search)).recorded, true);
    assert.equal((await emit(visitor, search)).recorded, false);
    assert.equal((await emit(visitor, { type: "filter_applied", source: "catalog", searchReceipt: receipt })).recorded, true);
    const row = (await rows("marketplace_events", { id: eventId }))[0];
    assert.equal(row.metadata.zero_results, expectZero);
    assert.equal(row.metadata.filters.brand, brand);
    assert.equal(row.metadata.result_count === 0, expectZero);
    assert.ok(!Object.hasOwn(row.metadata.filters, "page"));
    await post("/api/events", visitor, { events: [{ ...search, eventId: crypto.randomUUID(), searchReceipt: `${receipt}x` }] }, [400, 403]);
    await post("/api/events", visitor, { events: [{ type: "search", source: "catalog", resultCount: 999999, query: "fabricated" }] }, [400, 403]);
  }
  const after = await rpc(adminSession.client, "get_marketplace_admin_analytics", { p_days: 0 });
  assert.equal(after.searches - before.searches, 2);
  assert.equal(after.zero_results - before.zero_results, 1);
  assert.equal(after.zero_result_rate, after.zero_results / after.searches);
  console.log("PASS AN-004/005/006/015: signed existing filter receipts, real zero result count, event replay, no page context, strict/tampered search refusal and aggregate rate.");
}

async function verifyLifecycle(ownerSession, storeSession, adminSession, buyerSession, visitor) {
  const ordinary = await submitListing("listing", ownerSession, "QA Analytics proceso rechazo");
  assert.equal(await eventCount({ listing_id: ordinary.id, event_type: "listing_submitted" }), 1);
  assert.equal(await eventCount({ submission_id: ordinary.id, event_type: "listing_creation_started" }), 1);
  await rpc(adminSession.client, "review_listing", { p_listing_id: ordinary.id, p_decision: "reject", p_reason: "QA motivo para confirmar eventos" });
  await post(`/api/listings/${ordinary.id}/manage`, ownerSession, { action: "resubmit" });
  await rpc(adminSession.client, "review_listing", { p_listing_id: ordinary.id, p_decision: "approve" });
  await post(`/api/listings/${ordinary.id}/manage`, ownerSession, { action: "sold" });
  for (const kind of ["listing_rejected", "listing_approved", "listing_sold"]) assert.equal(await eventCount({ listing_id: ordinary.id, event_type: kind }), 1);
  assert.ok((await getListing(ordinary.id)).published_at);

  const applied = await submitStore(storeSession);
  assert.equal(await eventCount({ store_id: applied.id, event_type: "store_application_submitted" }), 1);
  assert.equal(await eventCount({ submission_id: applied.id, event_type: "store_application_started" }), 1);
  const inventory = await submitListing("store_listing", storeSession, "QA Analytics inventario pendiente");
  assert.equal((await getListing(inventory.id)).status, "pending");
  assert.equal((await emit(visitor, { type: "listing_view", listingId: inventory.id, source: "detail" })).recorded, false);
  assert.equal((await emit(visitor, { type: "store_view", storeId: applied.id, source: "store" })).recorded, false);
  await rpc(adminSession.client, "review_store_application", { p_store_id: applied.id, p_decision: "approve" });
  assert.equal(await eventCount({ store_id: applied.id, event_type: "store_approved" }), 1);
  await rpc(adminSession.client, "set_store_verification", { p_store_id: applied.id, p_verified: true });
  await rpc(adminSession.client, "set_store_verification", { p_store_id: applied.id, p_verified: true });
  assert.equal((await getListing(inventory.id)).status, "approved");
  assert.equal(await eventCount({ listing_id: inventory.id, event_type: "listing_approved" }), 1);
  assert.equal(await eventCount({ store_id: applied.id, event_type: "store_verified" }), 1);
  assert.equal((await emit(visitor, { type: "store_view", storeId: applied.id, source: "store" })).recorded, true);
  assert.equal((await emit(visitor, { type: "store_view", storeId: applied.id, source: "store" })).recorded, false);
  assert.equal((await emit(visitor, { type: "listing_impression", listingId: inventory.id, source: "store" })).recorded, true);
  assert.equal((await emit(visitor, { type: "listing_view", listingId: inventory.id, source: "detail" })).recorded, true);
  const contact = await contactRequest(buyerSession, { listingId: inventory.id, source: "detail" });
  assert.equal(new URL(contact.url).pathname, "/51999999503");
  const contactRow = (await rows("marketplace_events", { listing_id: inventory.id, event_type: "whatsapp_contact" }))[0];
  assert.equal(contactRow.store_id, applied.id);
  assert.equal(contactRow.seller_user_id, storeSession.user.id);
  assert.equal(contactRow.actor_user_id, buyerSession.user.id);
  await contactRequest(visitor, { storeId: applied.id, source: "store" });
  const stats = await rpc(storeSession.client, "get_account_analytics", { p_days: 0 });
  assert.equal(stats.summary.views, 1);
  assert.equal(stats.summary.impressions, 1);
  assert.equal(stats.summary.contacts, 1);
  assert.equal(stats.summary.store_views, 1);
  assert.equal(stats.summary.store_contacts, 1);
  assert.equal(stats.summary.ctr, 1);
  assert.equal(stats.summary.contact_rate, 1);
  assertDenied(await ownerSession.client.rpc("get_account_analytics", { p_owner_id: storeSession.user.id }), "P0001", "Analytics access denied.");
  const accountHtml = await (await fetch(`${base}/mi-cuenta`, { headers: { Cookie: storeSession.cookie } })).text();
  assert.match(accountHtml, /Estadísticas/);
  console.log("PASS AN-007/008/009 + WA-003 + SDASH-008/009: authoritative funnels+replays, pending eligibility, atomic verify approval, exact store attribution and aggregate ratios/navigation.");
}

async function createUser(label, type, phone, appMetadata = {}) {
  const user = { email: `s4-analytics-${label}-${suffix}@example.invalid`, password: `Qa-${crypto.randomUUID()}` };
  const created = await service.auth.admin.createUser({ email: user.email, password: user.password, email_confirm: true, app_metadata: appMetadata, user_metadata: { account_type: type, full_name: `QA Analytics ${label}`, phone, city: "Lima", region: "Lima" } });
  assert.equal(created.error, null); user.id = created.data.user.id; users.push(user); return user;
}
async function newVisitor() {
  const response = await fetch(`${base}/api/events/session`, { method: "POST", headers: { Origin: new URL(base).origin } });
  assert.equal(response.status, 200);
  const values = response.headers.getSetCookie();
  assert.ok(values.some((value) => /httponly/i.test(value)), "Anonymous identity cookie must be HttpOnly.");
  assert.ok(values.some((value) => /samesite=lax/i.test(value)), "Identity cookie must be same-site bounded.");
  const sessionCookie = values.find((value) => value.startsWith("laria-marketplace-session="));
  assert.ok(sessionCookie);
  const encoded = sessionCookie.split(";", 1)[0].split("=", 2)[1].split(".", 1)[0];
  const sessionId = JSON.parse(Buffer.from(encoded, "base64url").toString()).id;
  assert.ok(sessionId);
  sessionIds.push(sessionId);
  return { cookie: values.map((value) => value.split(";", 1)[0]).join("; ") };
}
async function signIn(user) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  assert.equal((await client.auth.signInWithPassword({ email: user.email, password: user.password })).error, null);
  const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password: user.password }) });
  assert.equal(response.status, 200);
  const visitor = await newVisitor();
  const cookie = [visitor.cookie, ...response.headers.getSetCookie().map((value) => value.split(";", 1)[0])].join("; ");
  return { user, client, cookie };
}
async function post(path, session, body, expected = 200, extraHeaders = {}) {
  const response = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: new URL(base).origin, Cookie: session.cookie, ...extraHeaders }, body: JSON.stringify(body) });
  const result = await response.json();
  if (Array.isArray(expected)) assert.ok(expected.includes(response.status), `${path}: ${response.status} ${result.message ?? JSON.stringify(result)}`);
  else assert.equal(response.status, expected, `${path}: ${result.message ?? JSON.stringify(result)}`);
  return result;
}
async function emit(session, event) {
  const eventId = event.eventId ?? crypto.randomUUID(); eventIds.push(eventId);
  const result = await post("/api/events", session, { events: [{ ...event, eventId }] });
  assert.ok(Array.isArray(result.events) && result.events.length === 1, "Expected one typed event receipt.");
  return result.events[0];
}
async function contactRequest(session, body) { const eventId = crypto.randomUUID(); eventIds.push(eventId); return post("/api/contact", session, { ...body, eventId }); }
async function fixtureListing(ownerId, status, views = 0) {
  const id = crypto.randomUUID(); listings.push(id); const now = new Date().toISOString();
  const listing = { id, slug: `qa-analytics-${id}`, title: `QA Analytics ${status}`, seller_type: "individual", status, category: "guitars", instrument_type: "electric_guitar", attributes: {}, brand: "Yamaha", model: "QA 112J", condition: "Usado - buen estado", price_pen: 1200, city: "Lima", region: "Lima", contact_name: "QA stale contact", whatsapp_phone: "51999999999", description: "Registro temporal suficientemente descriptivo para probar las métricas de Sprint cuatro.", owner_user_id: ownerId, created_by_source: "self_service", marketplace_rules_accepted_at: now, published_at: ["approved", "sold", "hidden"].includes(status) ? now : null, sold_at: status === "sold" ? now : null, hidden_source: status === "hidden" ? "owner" : null, view_count: views };
  assert.equal((await service.from("listings").insert(listing)).error, null);
  const paths = [0, 1].map((n) => `qa/analytics-${id}-${n}.png`);
  for (const path of paths) {
    objects.push({ bucket: "listing-photos", path });
    assert.equal((await service.storage.from("listing-photos").upload(path, png, { contentType: "image/png" })).error, null);
  }
  assert.equal((await service.from("listing_photos").insert(paths.map((path, n) => ({ listing_id: id, image_url: `${url}/storage/v1/object/public/listing-photos/${path}`, sort_order: n })))).error, null);
  return listing;
}
async function submitListing(kind, session, title) {
  const started = await post("/api/submissions", session, { action: "start", kind }); listings.push(started.id);
  const paths = [0, 1].map((n) => `${started.folder}/${n}.png`);
  for (const path of paths) { objects.push({ bucket: "listing-photos", path }); assert.equal((await session.client.storage.from("listing-photos").upload(path, png, { contentType: "image/png" })).error, null); }
  const payload = { action: "complete", token: started.token, paths, roles: paths.map(() => null), fields: { title, category: "guitars", instrument_type: "electric_guitar", attributes: {}, brand: "Yamaha", model: "QA112J", condition: "Usado - buen estado", price_pen: 1200, city: "Lima", region: "Lima", description: "Registro temporal para comprobar que la publicación produce eventos correctos y únicos.", marketplace_rules_accepted: true } };
  await post("/api/submissions", session, payload); await post("/api/submissions", session, payload); return started;
}
async function submitStore(session) {
  const started = await post("/api/submissions", session, { action: "start", kind: "store" }); stores.push(started.id);
  const payload = { action: "complete", token: started.token, paths: [], roles: [], fields: { name: "QA Analytics Tienda", razon_social: "QA Analytics SAC", ruc: `20${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, email: session.user.email, contact_person: "QA Analytics Store", whatsapp_phone: "51999999503", city: "Lima", region: "Lima", address: "Av. Temporal Analytics 4" } };
  await post("/api/submissions", session, payload); await post("/api/submissions", session, payload); return started;
}
async function rows(table, filters) { let query = service.from(table).select("*"); for (const [key, value] of Object.entries(filters)) query = query.eq(key, value); const result = await query; assert.equal(result.error, null); return result.data; }
async function eventCount(filters) { return (await rows("marketplace_events", filters)).length; }
async function getListing(id) { return (await rows("listings", { id }))[0]; }
async function rpc(client, name, args = {}) { const result = await client.rpc(name, args); assert.equal(result.error, null, `${name}: ${result.error?.message}`); return result.data; }
function assertDenied(result, code = "42501", message) {
  assert.equal(result.error?.code, code, "Denial must be real authorization failure, not a database or schema-cache outage.");
  if (message) assert.equal(result.error.message, message);
}
function extractSearchReceipt(html) {
  // React Flight props are JSON-escaped inside inline script strings.
  for (const value of [html, html.replace(/\\"/g, '"'), html.replace(/&quot;/g, '"')]) {
    const match = value.match(/"searchReceipt"\s*:\s*"([^"\\]+)"/);
    if (match) return match[1];
  }
  return null;
}
async function cleanupFixtures() {
  if (eventIds.length) await cleanupOperation(() => service.from("marketplace_events").delete().in("id", [...new Set(eventIds)]));
  if (sessionIds.length) await cleanupOperation(() => service.from("marketplace_events").delete().in("session_id", [...new Set(sessionIds)]));
  if (users.length) await cleanupOperation(() => service.from("marketplace_events").delete().in("actor_user_id", users.map((user) => user.id)));
  if (listings.length) await cleanupOperation(() => service.from("listings").delete().in("id", listings));
  if (stores.length) await cleanupOperation(() => service.from("stores").delete().in("id", stores));
  for (const bucket of ["listing-photos", "store-assets"]) {
    const paths = objects.filter((item) => item.bucket === bucket).map((item) => item.path);
    if (paths.length) await cleanupOperation(() => service.storage.from(bucket).remove(paths));
    for (const path of paths) {
      const result = await service.storage.from(bucket).list(path.slice(0, path.lastIndexOf("/")), { search: path.slice(path.lastIndexOf("/") + 1) });
      assert.equal(result.error, null); assert.equal(result.data.length, 0, "Storage fixture residue.");
    }
  }
  for (const user of [...users].reverse()) await cleanupOperation(() => service.auth.admin.deleteUser(user.id));
  for (const [table, field, ids] of [["marketplace_events", "id", eventIds], ["profiles", "id", users.map((user) => user.id)], ["listings", "id", listings], ["stores", "id", stores]]) {
    if (!ids.length) continue;
    const result = await service.from(table).select(field, { count: "exact", head: true }).in(field, ids); assert.equal(result.error, null); assert.equal(result.count, 0, `${table} residue.`);
  }
  console.log("QA residue: 0 temporary Auth users/profiles/stores/listings/events/storage objects.");
}
async function cleanupOperation(operation) {
  let result;
  for (let attempt = 0; attempt < 8; attempt++) {
    result = await operation();
    if (!result.error) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(result.error, null, "QA cleanup did not complete; fixture IDs must be retained for recovery.");
}
