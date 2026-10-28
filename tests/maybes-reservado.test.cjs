// Effortless Laria maybes (docs/ux-effortless/maybes-reservado.md): talk-06 "Reservado" (a Particular holds a published
// listing for a buyer for 1, 2, 3 or 5 days, people can ask "Avísame si se libera", and the seller is asked "¿Se vendió?"
// when the period ends) and talk-07 "Hacer una oferta" (an amount in soles in the visitor's own WhatsApp message, never
// stored). The database side is tests/maybes-reservado.sql; the catalog badge is in tests/catalog-recovery.test.cjs.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(source, mocks = {}) {
  const filename = path.resolve(source);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
  return mod.exports;
}

const source = (file) => fs.readFileSync(file, "utf8");
const reservations = require("@/lib/listing-reservations.ts");
const { absoluteUrl } = require("@/lib/site.ts");
const { formatPrice } = require("@/lib/price.ts");
const nextServer = { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init.headers } }) } };

// A query builder that answers every chain with one result.
function query(result) {
  const builder = { select: () => builder, eq: () => builder, in: () => builder, maybeSingle: async () => result, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
  return builder;
}

// A client whose rpc answers like PostgREST: a query that can be awaited, with abortSignal().
function rpcClient(answer) {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      const call = { name, args };
      calls.push(call);
      const result = Promise.resolve().then(() => answer(call));
      result.abortSignal = (signal) => {
        call.signal = signal;
        return result;
      };
      return result;
    },
  };
}

test("talk-06: the typed module keeps well-formed rows and words only the functions' own errors", () => {
  const id = crypto.randomUUID();
  const until = "2026-10-29T23:30:00Z";
  assert.deepEqual(reservations.RESERVATION_DAYS, [1, 2, 3, 5]);
  assert.deepEqual(reservations.parseReservedListings([
    { listing_id: id, reserved_until: until },
    { listing_id: id, reserved_until: "mañana" },
    { listing_id: "", reserved_until: until },
    null, [], "fila",
  ]), [{ listing_id: id, reserved_until: until }]);
  assert.deepEqual(reservations.parseReservedListings(null), []);
  assert.deepEqual(reservations.parseMyListingReservations([
    { listing_id: id, title: "Fender", slug: "fender", reserved_until: until, ended_at: null, watchers: 2 },
    { listing_id: id, title: "Fender", slug: "fender", reserved_until: until, ended_at: "2026-10-29T23:31:00Z", watchers: -1 },
    { listing_id: id, title: "Fender", slug: "fender", reserved_until: until, watchers: 1.5 },
    { listing_id: id, title: "", slug: "fender", reserved_until: until },
    { listing_id: id, title: "Fender", slug: "fender", reserved_until: null },
  ]), [
    { listing_id: id, title: "Fender", slug: "fender", reserved_until: until, ended_at: null, watchers: 2 },
    { listing_id: id, title: "Fender", slug: "fender", reserved_until: until, ended_at: "2026-10-29T23:31:00Z", watchers: 0 },
    { listing_id: id, title: "Fender", slug: "fender", reserved_until: until, ended_at: null, watchers: 0 },
  ]);
  assert.deepEqual([1, 2, 3, 5, 4, 0, 7, "2", null].map((value) => reservations.parseReservationDays(value)), [1, 2, 3, 5, null, null, null, null, null]);
  assert.deepEqual(["available", "sold", "hidden", undefined].map((value) => reservations.parseReservationOutcome(value)), ["available", "sold", null, null]);
  assert.equal(reservations.reservationErrorMessage("RESERVATION_DAYS_INVALID: Elige 1, 2, 3 o 5 días."), "Elige 1, 2, 3 o 5 días.");
  assert.equal(reservations.reservationErrorMessage("RELEASE_WATCH_OWN_LISTING: Es tu propia publicación."), "Es tu propia publicación.");
  assert.equal(reservations.reservationErrorMessage("STOCK_WATCH_UNAVAILABLE: Ya hay stock."), null);
  assert.equal(reservations.reservationErrorMessage("LISTING_SOLD_INVALID"), null);
  assert.equal(reservations.reservationErrorMessage(null), null);
});

test("talk-06: a list of cards is read 200 ids at a time, and one failed read means no badge rather than a wrong one", async () => {
  const ids = Array.from({ length: 450 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
  const signal = new AbortController().signal;
  const client = rpcClient(({ args }) => ({ data: [{ listing_id: args.p_listing_ids[0], reserved_until: "2026-10-29T23:30:00Z" }], error: null }));
  const reserved = await reservations.reservedListingIds(client, [...ids, ids[0]], signal);
  assert.deepEqual(client.calls.map((call) => [call.name, call.args.p_listing_ids.length]), [["get_reserved_listings", 200], ["get_reserved_listings", 200], ["get_reserved_listings", 50]]);
  assert.ok(client.calls.every((call) => call.signal === signal));
  assert.deepEqual([...reserved], [ids[0], ids[200], ids[400]]);

  const idle = rpcClient(() => assert.fail("nothing to ask"));
  assert.deepEqual([...(await reservations.reservedListingIds(idle, []))], []);
  assert.equal(idle.calls.length, 0);

  const failing = rpcClient(({ args }) => (args.p_listing_ids.includes(ids[300]) ? { data: null, error: { message: "canceling statement due to statement timeout" } } : { data: [], error: null }));
  assert.equal(await reservations.reservedListingIds(failing, ids), null);
  assert.equal(await reservations.readReservedListings(failing, ids), null);
});

test("talk-06: the seller's and the visitor's calls name their functions and hand back the functions' own messages", async () => {
  const id = crypto.randomUUID();
  let answer = () => ({ data: "2026-10-29T23:30:00+00:00", error: null });
  const client = rpcClient((call) => answer(call));
  assert.deepEqual(await reservations.setListingReservation(client, id, 2), { data: "2026-10-29T23:30:00+00:00", error: null });
  answer = () => ({ data: 3, error: null });
  assert.deepEqual(await reservations.endListingReservation(client, id, "available"), { data: 3, error: null });
  answer = () => ({ data: true, error: null });
  assert.deepEqual(await reservations.setReleaseWatch(client, id, true), { data: true, error: null });
  assert.equal(await reservations.readReleaseWatch(client, id), true);
  answer = () => ({ data: [{ listing_id: id, title: "Fender", slug: "fender", reserved_until: "2026-10-29T23:30:00Z", ended_at: null, watchers: 1 }], error: null });
  assert.equal((await reservations.readMyListingReservations(client)).length, 1);
  assert.deepEqual(client.calls.map((call) => [call.name, call.args]), [
    ["set_listing_reservation", { p_listing_id: id, p_days: 2 }],
    ["end_listing_reservation", { p_listing_id: id, p_outcome: "available" }],
    ["set_listing_release_watch", { p_listing_id: id, p_watch: true }],
    ["get_listing_release_watch", { p_listing_id: id }],
    ["get_my_listing_reservations", undefined],
  ]);

  // Nobody waiting is a count of zero; an answer that is not a date is a failure.
  answer = () => ({ data: null, error: null });
  assert.deepEqual(await reservations.endListingReservation(client, id, "sold"), { data: 0, error: null });
  assert.deepEqual(await reservations.setListingReservation(client, id, 1), { data: null, error: "" });

  const refused = "RESERVATION_NOT_PUBLISHED: Solo puedes reservar una publicación publicada.";
  answer = () => ({ data: null, error: { message: refused } });
  assert.deepEqual(await reservations.setListingReservation(client, id, 1), { data: null, error: refused });
  assert.deepEqual(await reservations.endListingReservation(client, id, "sold"), { data: null, error: refused });
  assert.deepEqual(await reservations.setReleaseWatch(client, id, false), { data: null, error: refused });
  assert.equal(await reservations.readReleaseWatch(client, id), null);
  assert.equal(await reservations.readMyListingReservations(client), null);
});

test("talk-06: a period runs until its end, and the end is a date in Lima, never «mañana»", () => {
  const now = Date.parse("2026-10-28T12:00:00Z");
  assert.equal(reservations.isReservationRunning({ reserved_until: "2026-10-29T23:30:00Z" }, now), true);
  assert.equal(reservations.isReservationRunning({ reserved_until: "2026-10-28T11:59:59Z" }, now), false);
  assert.equal(reservations.isReservationRunning({ reserved_until: "2026-10-29T23:30:00Z", ended_at: "2026-10-28T11:00:00Z" }, now), false);
  assert.equal(reservations.isReservationRunning({ reserved_until: "nunca" }, now), false);
  assert.equal(reservations.isReservationRunning(null, now), false);
  const row = (listing_id, reserved_until, ended_at = null) => ({ listing_id, title: listing_id, slug: listing_id, reserved_until, ended_at, watchers: 0 });
  // The seller is asked as soon as the period ends, also in the minute before the job marks it ended.
  assert.deepEqual(reservations.endedReservations([
    row("running", "2026-10-29T23:30:00Z"),
    row("just-ended", "2026-10-28T11:00:00Z"),
    row("ended", "2026-10-27T11:00:00Z", "2026-10-27T11:00:30Z"),
  ], now).map((item) => item.listing_id), ["just-ended", "ended"]);

  assert.deepEqual(reservations.RESERVATION_DAYS.map((days) => reservations.reservationDaysLabel(days)), ["1 día", "2 días", "3 días", "5 días"]);
  // The time keeps no-break spaces, so "p. m." never wraps.
  assert.equal(reservations.reservationEndText("2026-10-29T23:30:00Z"), "el jueves 29 de octubre a las 6:30\u00a0p.\u00a0m.");
  assert.equal(reservations.reservationEndText("2026-10-30T18:05:00Z"), "el viernes 30 de octubre a la 1:05\u00a0p.\u00a0m.");
  assert.equal(reservations.reservationEndText("2026-11-02T14:00:00Z"), "el lunes 2 de noviembre a las 9:00\u00a0a.\u00a0m.");
  assert.equal(reservations.reservationEndText("nunca"), null);
  // "p. m." closes the sentence too: "… a las 6:30 p. m. Puedes pedir …", never "p. m..".
  assert.equal(reservations.endSentence("el jueves 29 de octubre a las 6:30 p. m."), "el jueves 29 de octubre a las 6:30 p. m.");
  assert.equal(reservations.endSentence("el jueves 29 de octubre"), "el jueves 29 de octubre.");
  assert.equal(reservations.reservationTagText("2026-10-29T23:30:00Z"), "Reservada hasta el jue 29 oct.");
  assert.equal(reservations.reservationTagText("nunca"), "Reservada");
  assert.equal(reservations.watchersText(1), "1 persona pidió que le avisemos si se libera.");
  assert.equal(reservations.watchersText(3), "3 personas pidieron que les avisemos si se libera.");
});

test("talk-06 and talk-07: the WhatsApp messages for a reserved listing and for an offer, with three round amounts", () => {
  const { listingContactMessage, offerContactMessage, offerSuggestions, withMessage } = require("@/lib/contact-message.ts");
  const link = absoluteUrl("/instrumentos/fender-stratocaster");
  const listing = { title: "Fender Stratocaster", slug: "fender-stratocaster", price_pen: 2000, seller_type: "individual" };
  // Prices keep their no-break space, as in every contact message.
  assert.equal(formatPrice(2000), "S/\u00a02,000");
  assert.equal(listingContactMessage(listing, { reserved: true }), `Hola, vi tu Fender Stratocaster en Laria a S/\u00a02,000: ${link} Vi que está reservado. Si se libera, ¿me avisas?`);
  assert.equal(listingContactMessage(listing), `Hola, vi tu Fender Stratocaster en Laria a S/\u00a02,000: ${link} ¿Sigue disponible?`);
  assert.equal(offerContactMessage(listing, 1900), `Hola, te ofrezco S/\u00a01,900 por tu Fender Stratocaster publicado en Laria: ${link}`);

  assert.deepEqual(offerSuggestions(2000), [1900, 1800, 1700]);
  assert.deepEqual(offerSuggestions(2500), [2300, 2200, 2100]);
  assert.deepEqual(offerSuggestions(500), [450, 400]);
  assert.deepEqual(offerSuggestions(299), [280, 260, 250]);
  assert.deepEqual(offerSuggestions(50), [45, 40]);
  for (const price of [5, 0, -10, 12.5, null]) assert.deepEqual(offerSuggestions(price), [], String(price));

  // The offer replaces the whole text of the page's own link: the seller's number stays, the quick questions do not.
  const wa = "https://wa.me/51987654321?text=Hola%2C%20vi%20tu%20Fender";
  assert.equal(withMessage(wa, "Hola, te ofrezco S/ 1,900 + estuche"), "https://wa.me/51987654321?text=Hola%2C%20te%20ofrezco%20S%2F%201%2C900%20%2B%20estuche");
  assert.equal(new URL(withMessage(wa, "Hola, te ofrezco S/ 1,900 + estuche")).searchParams.get("text"), "Hola, te ofrezco S/ 1,900 + estuche");
  assert.equal(withMessage("https://laria.audio/instrumentos/fender?text=a", "b"), "https://laria.audio/instrumentos/fender?text=a");
  assert.equal(withMessage("no es un enlace", "b"), "no es un enlace");
});

test("talk-06: the contact route's link says the listing is reserved, so Descubrir's WhatsApp button says it too", async () => {
  const LISTING = "d6000000-0000-4000-8000-000000000001";
  const row = (sellerType) => ({ id: LISTING, title: "Fender Stratocaster", slug: "fender-stratocaster", price_pen: 2000, stock_state: null, seller_type: sellerType,
    owner_user_id: "d6000000-0000-4000-8000-000000000002", city: "Lima", region: "Lima", created_at: "2026-10-01T00:00:00Z", stores: sellerType === "store" ? { whatsapp_phone: "987654322" } : null });
  const contactRow = { contact_name: "Ana", whatsapp_phone: "987654320", profiles: { full_name: "Ana", phone: "987654321", city: "Lima", region: "Lima", created_at: "2026-09-01T00:00:00Z" } };
  const client = (data) => ({ from: () => query({ data, error: null }) });
  const asked = [];
  const text = async (sellerType, reserved) => {
    const route = load("app/api/contact/route.ts", {
      "next/server": nextServer,
      "@/lib/supabase/public-client": { getPublicSupabaseClient: () => client(row(sellerType)) },
      "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => client(contactRow) },
      "@/lib/marketplace-events-server": { sameOriginEventRequest: () => true, getMarketplaceActor: async () => null, getMarketplaceSession: async () => null, recordMarketplaceEvent: async () => ({ recorded: true }), logMarketplaceEventFailure: () => {} },
      "@/lib/listing-reservations-server": { reservedCardIds: async (listings, deadline) => { asked.push({ listings, deadline }); return reserved(); } },
    });
    const response = await route.POST(new Request("https://laria.audio/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: crypto.randomUUID(), listingId: LISTING, source: "home" }),
    }));
    assert.equal(response.status, 200);
    return new URL((await response.json()).url).searchParams.get("text");
  };
  assert.match(await text("individual", () => new Set([LISTING])), /Vi que está reservado\. Si se libera, ¿me avisas\?$/);
  assert.deepEqual(asked[0].listings, [{ id: LISTING, seller_type: "individual" }], "the period is read beside the listing, by its id");
  assert.ok(asked[0].deadline.expiresAt - Date.now() <= 1500, "within the optional budget");
  assert.match(await text("individual", () => new Set()), /¿Sigue disponible\?$/);
  // A store's listing is never reserved, and a read that failed leaves the usual message: the contact still opens.
  assert.match(await text("store", () => new Set([LISTING])), /¿Sigue disponible\?$/);
  assert.match(await text("individual", () => { throw new Error("read failed"); }), /¿Sigue disponible\?$/);
});

test("talk-06: an ended period asks «¿Se vendió?» in Pendientes, and the row actions, notices and e-mails follow", () => {
  const { buildPendientes } = require("@/lib/pendientes.ts");
  const empty = {
    buyer: { pending_claims: [], reviews_due: [], purchase_checks: [], price_drops: 0, alert_matches: 0 },
    seller: { rejected: [], admin_hidden: [], drafts: [], buyer_reports: [], availability: [], unattributed: [], paused_until: null },
    store: null,
  };
  const items = buildPendientes(empty, { reservations: [
    { listing_id: "a", title: "Fender Stratocaster", watchers: 2 },
    { listing_id: "b", title: "Boss DS-1", watchers: 1 },
    { listing_id: "c", title: "Yamaha P-45", watchers: 0 },
  ] });
  assert.deepEqual(items.map((item) => [item.key, item.tone, item.title, item.detail, item.action]), [
    ["reservation:a", "action", "¿Se vendió «Fender Stratocaster»?", "Terminó la reserva. 2 personas esperan saber si se libera.", { kind: "reservation", listingId: "a" }],
    ["reservation:b", "action", "¿Se vendió «Boss DS-1»?", "Terminó la reserva. 1 persona espera saber si se libera.", { kind: "reservation", listingId: "b" }],
    ["reservation:c", "action", "¿Se vendió «Yamaha P-45»?", "Terminó la reserva que marcaste. Respóndelo en un toque.", { kind: "reservation", listingId: "c" }],
  ]);
  assert.deepEqual(buildPendientes(empty), []);

  const { rowActions } = require("@/lib/my-listings.ts");
  const approved = { status: "approved", hidden_source: null, inventoryItemId: null };
  assert.equal(rowActions(approved, { canReserve: true }).reserve, true);
  assert.equal(rowActions(approved).reserve, false);
  // A store holds units from Inventario.
  assert.equal(rowActions({ ...approved, inventoryItemId: "sku-1" }, { canReserve: true }).reserve, false);
  for (const status of ["pending", "draft", "rejected", "sold", "archived"]) assert.equal(rowActions({ ...approved, status }, { canReserve: true }).reserve, false, status);
  assert.equal(rowActions({ ...approved, status: "hidden", hidden_source: "owner" }, { canReserve: true }).reserve, false);

  const { notificationHref, notificationLabel } = require("@/lib/notifications.ts");
  assert.deepEqual(["listing_reservation_ended", "listing_released", "listing_reservation_sold"].map((type) => notificationLabel(type)), ["¿Se vendió?", "Se liberó una reserva", "Se vendió lo que esperabas"]);
  const notice = (event_type) => ({ event_type, listing_id: "l1", store_id: null });
  assert.equal(notificationHref(notice("listing_reservation_ended")), "/mi-cuenta");
  assert.equal(notificationHref(notice("listing_released")), "/instrumentos/l1");
  assert.equal(notificationHref(notice("listing_reservation_sold")), "/instrumentos/l1");

  const { renderMarketplaceEmail } = require("@/lib/email/templates.ts");
  const base = {
    delivery_id: "delivery", attempt_count: 1, recipient_email: "qa@example.invalid", recipient_name: "QA", context: {}, store: null, transaction: null,
    search_alert: null, listing: { title: "Fender <Strat>", slug: "fender-strat", price_pen: 2000 },
  };
  const ended = renderMarketplaceEmail({ ...base, event_type: "listing_reservation_ended" }, "https://laria.audio");
  assert.equal(ended.subject, "¿Se vendió “Fender <Strat>”?");
  assert.equal(ended.destination, "https://laria.audio/mi-cuenta");
  assert.match(ended.html, /Fender &lt;Strat&gt;/);
  assert.match(ended.text, /Responder: https:\/\/laria\.audio\/mi-cuenta/);
  const released = renderMarketplaceEmail({ ...base, event_type: "listing_released" }, "https://laria.audio");
  assert.equal(released.subject, "Se liberó una publicación que esperabas");
  assert.equal(released.destination, "https://laria.audio/instrumentos/fender-strat");
  assert.match(released.text, /Ya no está reservado/);
  assert.match(released.text, /Te avisamos una sola vez, como pediste\./);
  // Both answer something the person did or asked for: transactional, no preference link.
  for (const email of [ended, released]) {
    assert.match(email.text, /correo transaccional/);
    assert.doesNotMatch(email.text, /Elegir qué correos recibo/);
  }
});

test("talk-06: the seller reserves and ends a period through the listing's manage route, and the page is refreshed", async () => {
  const owner = crypto.randomUUID();
  const id = crypto.randomUUID();
  const refreshed = [];
  const rpcs = [];
  let answer = () => ({ data: null, error: null });
  const listing = { id, slug: "fender-stratocaster-1b2c", owner_user_id: owner, status: "approved", title: "Fender Stratocaster", listing_photos: [] };
  const server = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    from: () => query({ data: listing, error: null }),
    rpc: async (name, args) => {
      rpcs.push([name, args]);
      return answer(name, args);
    },
  };
  const route = load("app/api/listings/[id]/manage/route.ts", {
    "next/server": nextServer,
    "@/lib/supabase/server-client": { getSupabaseServerClient: async () => server },
    "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => null },
    "@/lib/listing-photo-cleanup": { cleanupListingEditUploads: async () => undefined },
    "@/lib/listing-cache": { dropListingPages: (slugs) => refreshed.push(...slugs) },
  });
  const post = async (body) => {
    const response = await route.POST(new Request(`http://localhost:3000/api/listings/${id}/manage`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
    return [response.status, await response.json()];
  };

  answer = () => ({ data: "2026-10-29T23:30:00+00:00", error: null });
  assert.deepEqual(await post({ action: "reserve", days: 2 }), [200, { ok: true, reservedUntil: "2026-10-29T23:30:00+00:00" }]);
  answer = () => ({ data: 2, error: null });
  assert.deepEqual(await post({ action: "end_reservation", outcome: "available" }), [200, { ok: true, told: 2 }]);
  assert.deepEqual(rpcs, [["set_listing_reservation", { p_listing_id: id, p_days: 2 }], ["end_listing_reservation", { p_listing_id: id, p_outcome: "available" }]]);
  assert.deepEqual(refreshed, ["fender-stratocaster-1b2c", "fender-stratocaster-1b2c"]);

  // Refused before any call: a period the picker does not offer, an outcome that does not exist.
  assert.deepEqual(await post({ action: "reserve", days: 4 }), [400, { message: "Elige 1, 2, 3 o 5 días." }]);
  assert.deepEqual(await post({ action: "reserve", days: "2" }), [400, { message: "Elige 1, 2, 3 o 5 días." }]);
  assert.deepEqual(await post({ action: "end_reservation", outcome: "hidden" }), [400, { message: "Acción no compatible." }]);
  assert.equal(rpcs.length, 2);

  // The functions' own words reach the seller; a refusal of the sold flow reads as it does on "Marcar vendida".
  answer = () => ({ data: null, error: { message: "RESERVATION_STORE_LISTING: Las tiendas separan unidades desde Inventario." } });
  assert.deepEqual(await post({ action: "reserve", days: 1 }), [409, { message: "Las tiendas separan unidades desde Inventario." }]);
  answer = () => ({ data: null, error: { message: "LISTING_SOLD_INVALID" } });
  assert.deepEqual(await post({ action: "end_reservation", outcome: "sold" }), [409, { message: "Solo una publicación publicada u ocultada por ti puede marcarse como vendida." }]);
  assert.equal(refreshed.length, 2);

  // Someone else's listing is not found, whatever the action.
  listing.owner_user_id = crypto.randomUUID();
  assert.equal((await post({ action: "reserve", days: 1 }))[0], 404);
  assert.equal(rpcs.length, 4);
});

test("talk-06: «Avísame si se libera» is read and saved beside «Avísame cuando vuelva», for a signed-in visitor only", async () => {
  const id = crypto.randomUUID();
  const rpcs = [];
  let user = { id: crypto.randomUUID() };
  let answer = (name) => ({ data: name === "get_listing_release_watch", error: null });
  const server = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: () => query({ data: { owner_user_id: crypto.randomUUID(), stock_state: null }, error: null }),
    rpc: async (name, args) => {
      rpcs.push([name, args]);
      return answer(name, args);
    },
  };
  const route = load("app/api/listing-viewer/route.ts", {
    "next/server": nextServer,
    "@/lib/supabase/server-client": { getSupabaseServerClient: async () => server },
    "@/lib/marketplace-events-server": { sameOriginEventRequest: () => true },
  });
  const call = async (method, body) => {
    const response = await route[method](new Request("http://localhost:3000/api/listing-viewer", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    return [response.status, await response.json()];
  };

  // A listing that is not reserved asks what it asked before.
  assert.deepEqual(await call("POST", { listingId: id }), [200, { authenticated: true, owner: false, stockManaged: false, watching: false }]);
  assert.deepEqual(rpcs.map(([name]) => name), ["get_listing_stock_watch"]);
  assert.deepEqual(await call("POST", { listingId: id, reserved: true }), [200, { authenticated: true, owner: false, stockManaged: false, watching: false, releaseWatching: true }]);
  assert.deepEqual(rpcs.slice(1).map(([name]) => name), ["get_listing_stock_watch", "get_listing_release_watch"]);

  rpcs.length = 0;
  answer = () => ({ data: true, error: null });
  assert.deepEqual(await call("PUT", { listingId: id, watch: true, kind: "release" }), [200, { watching: true }]);
  assert.deepEqual(rpcs, [["set_listing_release_watch", { p_listing_id: id, p_watch: true }]]);
  answer = () => ({ data: null, error: { message: "RELEASE_WATCH_UNAVAILABLE: Esta publicación ya no está reservada." } });
  assert.deepEqual(await call("PUT", { listingId: id, watch: true, kind: "release" }), [409, { message: "Esta publicación ya no está reservada." }]);
  answer = () => ({ data: null, error: { message: "canceling statement due to statement timeout" } });
  assert.deepEqual(await call("PUT", { listingId: id, watch: true, kind: "release" }), [503, { message: "No pudimos guardar el aviso. Intenta de nuevo." }]);
  rpcs.length = 0;
  assert.equal((await call("PUT", { listingId: id, watch: true, kind: "price" }))[0], 400);
  assert.equal(rpcs.length, 0);

  // A visitor is asked to sign in, and the page learns nothing else.
  user = null;
  assert.equal((await call("PUT", { listingId: id, watch: true, kind: "release" }))[0], 401);
  assert.deepEqual(await call("POST", { listingId: id, reserved: true }), [200, { authenticated: false, owner: false, stockManaged: false, watching: false }]);
  assert.equal(rpcs.length, 0);
});

test("talk-06: Mis publicaciones offers «Reservar», then the period's tag, who is waiting and the period's own actions", () => {
  const Link = ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children);
  const Img = ({ src, alt, className }) => React.createElement("img", { src, alt, className });
  const { ListingManagementTable } = load("components/listing-management-table.tsx", {
    "next/link": { __esModule: true, default: Link },
    "next/image": { __esModule: true, default: Img },
    "next/navigation": { useRouter: () => ({ refresh() {}, push() {} }) },
  });
  const base = { title: "Guitarra", slug: "guitarra", price_pen: 900, created_at: "2026-09-01T12:00:00Z", published_at: null, sold_at: null, rejection_reason: null, hidden_source: null, hidden_reason: null, revisionStatus: null, revisionReason: null };
  const row = (id, overrides = {}) => ({ ...base, id, status: "approved", ...overrides });
  const render = (listings, props = {}) => renderToStaticMarkup(React.createElement(ListingManagementTable, { listings, emptyMessage: "Vacío", ...props }));
  const rows = (html) => html.split("<tr").slice(2);
  const running = { until: "2026-10-29T23:30:00Z", ended: false, watchers: 2 };

  const [free, held, ended, pending, linked] = rows(render([
    row("a"),
    row("b", { reservation: running }),
    row("c", { reservation: { until: "2026-10-27T23:30:00Z", ended: true, watchers: 1 } }),
    row("d", { status: "pending" }),
    row("e", { inventoryItemId: "sku-1" }),
  ], { canReserve: true }));
  assert.match(free, />Reservar<\/button>/);
  assert.doesNotMatch(free, /Cambiar reserva|Quitar reserva|Reservada/);
  assert.match(held, /Reservada hasta el jue 29 oct\./);
  assert.match(held, /2 personas pidieron que les avisemos si se libera\./);
  for (const label of ["Cambiar reserva", "Quitar reserva", "Marcar vendida"]) assert.match(held, new RegExp(`>${label}</button>`), label);
  assert.doesNotMatch(held, />Reservar<\/button>/);
  assert.match(ended, /Terminó la reserva · ¿Se vendió\?/);
  assert.match(ended, /1 persona pidió que le avisemos si se libera\./);
  for (const label of ["Se vendió", "Sigue disponible", "Reservar otra vez"]) assert.match(ended, new RegExp(`>${label}</button>`), label);
  assert.doesNotMatch(ended, /Marcar vendida|Cambiar reserva/);
  assert.doesNotMatch(pending, /Reserva/);
  assert.doesNotMatch(linked, /Reserva/);

  // A store's table never offers it, even with a period in the data.
  assert.doesNotMatch(render([row("b", { reservation: running })]), /Reserva/);
});

test("talk-07: «Hacer una oferta» puts the amount in the message and opens WhatsApp with that text alone", () => {
  const href = "https://wa.me/51987654321?text=Hola%2C%20vi%20tu%20Fender%20Stratocaster";
  const listing = { title: "Fender Stratocaster", slug: "fender-stratocaster", price_pen: 2000 };
  // The button is pressed (open) and the amount typed: the sheet as the visitor sees it.
  const renderOffer = (typed) => {
    const { OfferButton } = load("components/listing/offer-sheet.tsx", {
      react: { ...React, useState: (initial) => [initial === false ? true : initial === "" ? typed : initial, () => {}] },
      "@/components/ui/sheet": { Sheet: ({ title, footer, children }) => React.createElement("section", { "aria-label": title }, children, footer) },
      "@/components/whatsapp-contact-link": {
        WhatsAppContactLink: ({ href: link, listingId, safety, addQuestions, children }) => React.createElement("a", { href: link, "data-listing": listingId, "data-safety": String(safety), "data-questions": String(addQuestions) }, children),
      },
    });
    return renderToStaticMarkup(React.createElement(OfferButton, { listingId: "l1", href, listing, safety: true }));
  };

  const html = renderOffer("1900");
  assert.match(html, /Hacer una oferta/);
  assert.match(html, /Precio publicado: <span[^>]*>S\/\u00a02,000<\/span>/);
  for (const amount of [1900, 1800, 1700]) assert.ok(html.includes(`>${formatPrice(amount)}<`), String(amount));
  const sent = /<a href="([^"]+)" data-listing="l1" data-safety="true" data-questions="false">/.exec(html);
  assert.ok(sent, html);
  const url = new URL(sent[1].replaceAll("&amp;", "&"));
  assert.equal(`${url.hostname}${url.pathname}`, "wa.me/51987654321");
  assert.equal(url.searchParams.get("text"), `Hola, te ofrezco S/\u00a01,900 por tu Fender Stratocaster publicado en Laria: ${absoluteUrl("/instrumentos/fender-stratocaster")}`);
  assert.match(html, /Enviar oferta por WhatsApp/);
  assert.match(html, /Laria no guarda el monto\./);
  assert.doesNotMatch(html, /precio publicado o más|muy por debajo/);

  // Nothing typed: nothing to send.
  const idle = renderOffer("");
  assert.match(idle, /Escribe un monto para ver tu mensaje\./);
  assert.match(idle, /disabled=""/);
  assert.doesNotMatch(idle, /wa\.me/);
  // The price itself, or far under it: a word, and the visitor can still send it.
  assert.match(renderOffer("2000"), /Es el precio publicado o más: también puedes escribir sin oferta\./);
  const low = renderOffer("1000");
  assert.match(low, /Una oferta muy por debajo del precio suele quedarse sin respuesta\./);
  assert.match(low, /te%20ofrezco%20S%2F%C2%A01%2C000/);

  // The amount lives in the message alone: the sheet makes no request, and the recorded contact is identity and source.
  assert.doesNotMatch(source("components/listing/offer-sheet.tsx"), /fetch\(|supabase|localStorage/);
  const { contactRequestBody } = require("@/components/whatsapp-contact-link.tsx");
  assert.deepEqual(contactRequestBody({ listingId: "l1", source: "detail" }, "event-1"), { eventId: "event-1", listingId: "l1", source: "detail" });
});

test("talk-06 and talk-07: the listing page, the account pages and the migration are wired as the doc says", () => {
  const page = source("app/instrumentos/[slug]/page.tsx");
  // Only a Particular's published listing; a failed read shows it as not reserved.
  assert.match(page, /if \(listing\.status !== "approved" \|\| listing\.seller_type !== "individual" \|\| listing\.store_id\) return null;/);
  assert.match(page, /readReservedListings\(supabase, \[listing\.id\], optionalReadSignal\(getRequestReads\(\)\.deadline\)\)\.catch\(\(\) => null\)/);
  assert.match(page, /const reservedUntil = !isSold && reservation && isReservationRunning\(reservation, now\) \? reservation\.reserved_until : null;/);
  // Feature ideas (FD-integration-6): no offer on a listing the seller marked "Precio fijo" (sell-07).
  assert.match(page, /const offer = !isSold && !purchase && !reservedUntil && listing\.seller_type === "individual" && listing\.price_pen !== null\n\s+&& listing\.price_pen > 0 && listing\.price_mode !== "fixed";/);
  assert.match(page, /buildWhatsAppUrl\(listing, \{ reserved: Boolean\(reservedUntil\) \}\)/);
  // While reserved, neither "sigue disponible" nor the quiet-listing note.
  assert.match(page, /\{reservedUntil \? null : availabilityConfirmed \? \(/);
  assert.match(page, /Quien vende lo reservó para otra persona hasta \{endSentence\(reservationEndText\(reservedUntil\) \?\? ""\)\} Puedes pedir/);
  assert.match(source("components/listing-management-table.tsx"), /notify\(until \? `Reservada hasta \$\{endSentence\(until\)\}` : "Publicación reservada\."\);/);
  for (const piece of [/<StatusTag domain="stock" status="reserved" \/>/, /<ReleaseAlert listingId=\{listing\.id\}/, /<OwnerBar listingId=\{listing\.id\} sold=\{isSold\} reserved=\{Boolean\(reservedUntil\)\}/, /reserved=\{Boolean\(reservedUntil\)\}\s+className="order-3 lg:order-3"/]) assert.match(page, piece);
  // The visitor's own state comes from the private viewer route after the cached page loads.
  const viewer = source("components/listing/listing-viewer.tsx");
  assert.match(viewer, /JSON\.stringify\(\{ listingId, watch: !current, kind: "release" \}\)/);
  assert.match(viewer, /JSON\.stringify\(reserved \? \{ listingId, reserved: true \} : \{ listingId \}\)/);
  assert.match(viewer, /if \(viewer\?\.owner\) return null;/);
  assert.match(viewer, /Ingresa para que te avisemos si se libera/);
  assert.match(source("lib/ui/status.ts"), /reserved: \{ label: "Reservado", tone: "warning"/);

  // Particular accounts only: a store's home and table never read or show periods.
  const home = source("app/mi-cuenta/page.tsx");
  assert.match(home, /supabase && !storeOwner \? readMyListingReservations\(supabase\) : null/);
  assert.match(home, /buildPendientes\(pendientes, \{ reservations: endedReservations\(reservations \?\? \[\]\) \}\)/);
  const mine = source("app/mi-cuenta/publicaciones/page.tsx");
  assert.match(mine, /supabase \? readMyListingReservations\(supabase\) : null/);
  assert.match(mine, /emptyMessage="Aún no tienes publicaciones" canReserve \/>/);
  assert.doesNotMatch(source("app/mi-cuenta/tienda/inventario/page.tsx"), /canReserve/);
  const pendientes = source("components/pendientes-list.tsx");
  for (const piece of [/Sí, se vendió/, /No, sigue disponible/, /action: "end_reservation"/, /\/mi-cuenta\/transacciones\//]) assert.match(pendientes, piece);

  const migration = source("supabase/migrations/20261120100000_ux_maybes_reservado.sql");
  assert.match(migration, /^set lock_timeout = '10s';$/m);
  assert.match(migration, /^reset lock_timeout;$/m);
  assert.match(migration, /select cron\.schedule\('listing-reservations', '\* \* \* \* \*', \$\$select laria_private\.run_listing_reservations\(\)\$\$\);/);
  // The cards' read is public; every change is the signed-in person's own.
  assert.match(migration, /grant execute on function public\.get_reserved_listings\(uuid\[\]\) to anon, authenticated, service_role;/);
  for (const signature of ["get_my_listing_reservations()", "set_listing_release_watch(uuid, boolean)", "get_listing_release_watch(uuid)", "set_listing_reservation(uuid, integer)", "end_listing_reservation(uuid, text)"]) {
    const escaped = signature.replace(/[()[\]]/g, "\\$&");
    assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon;`), signature);
    assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to authenticated, service_role;`), signature);
  }
  for (const table of ["listing_reservations", "listing_release_watches"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security;`), table);
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated;`), table);
  }
  // A13's lists are replaced whole by the integration migration, never here.
  assert.doesNotMatch(migration, /function laria_private\.app_error_(route_patterns|own_messages|messages)\(/);
  // Main kept the generated types to production's schema while these migrations waited. features/marketplace generates
  // them from every migration it carries (docs/database.md, scripts/local-db/gen-types.sh), so there they are typed.
  assert.match(source("lib/supabase/database.types.ts"), /\n      get_reserved_listings: \{/);
});
