// Feature ideas, store-locations batch (docs/feature-ideas/store-locations.md): sedes (run-02) and the boleta from
// Mostrador (run-03). Database rules are in tests/store-locations.sql and tests/store-receipts.sql. Nothing here calls
// Nubefact: the server half gets a fake fetch.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

// "server-only" throws outside a React server build; tests load the server file directly.
const originalLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, ...rest);
};

const load = (file) => require(path.resolve(file));
const locations = load("lib/store-locations.ts");
const nubefact = load("lib/einvoice/nubefact.ts");
const secret = load("lib/einvoice/secret.ts");
const server = load("lib/einvoice/server.ts");
const { inventoryCall } = load("lib/inventory-actions.ts");
const { saleRequest } = load("lib/inventory-counter.ts");

const ID = "0a1b2c3d-0000-4000-8000-000000000001";
const ID2 = "0a1b2c3d-0000-4000-8000-000000000002";

// ------------------------------------------------------------------ run-02

test("the availability line names the locations, never how many", () => {
  assert.equal(locations.availabilityLine([]), null);
  assert.equal(locations.availabilityLine(["Miraflores"]), "Disponible en Miraflores");
  assert.equal(locations.availabilityLine(["Miraflores", "Centro"]), "Disponible en Miraflores y Centro");
  assert.equal(locations.availabilityLine(["Miraflores", "San Isidro", "Centro"]), "Disponible en Miraflores, San Isidro y Centro");
  assert.equal(locations.pickupSentence("Centro"), "Quiero recogerlo en la sede Centro.");
  assert.equal(locations.locationPlace({ district: "Lima", city: "Lima" }), "Lima");
});

test("Inventario shows the units per location, empty ones left out", () => {
  const list = [{ id: "a", name: "Miraflores" }, { id: "b", name: "Centro" }, { id: "c", name: "Sur" }];
  const stock = [{ location_id: "a", item_id: "x", quantity_on_hand: 3 }, { location_id: "b", item_id: "x", quantity_on_hand: 12 }, { location_id: "c", item_id: "x", quantity_on_hand: 0 }, { location_id: "a", item_id: "y", quantity_on_hand: 9 }];
  assert.equal(locations.breakdownText(locations.locationBreakdown(list, stock, "x")), "Miraflores 3 · Centro 12");
});

test("the Stock por sede sheet reads counts per location and reports bad rows", () => {
  const list = [{ id: "a", name: "Miraflores" }, { id: "b", name: "Centro de Lima" }];
  const rows = [
    ["Inventario de la tienda"],
    ["SKU", "Nombre", "Stock Miraflores", "stock centro de  lima"],
    ["GTR-1", "Guitarra", "3", ""],
    ["CAB-1", "Cable", "x", "4"],
    ["GTR-1", "Guitarra otra vez", "1", "1"],
    ["", "", "", ""],
    ["", "Sin SKU", "2", ""],
  ];
  const read = locations.readStockSheet(rows, list);
  assert.deepEqual(read.counts, [{ location_id: "a", sku: "GTR-1", quantity: 3 }, { location_id: "b", sku: "CAB-1", quantity: 4 }]);
  assert.deepEqual(read.problems.map((problem) => problem.row), [4, 5, 7]);
  assert.equal(locations.readStockSheet([["Nombre"]], list).problems[0].message, "Falta la columna SKU.");
  assert.match(locations.readStockSheet([["SKU", "Stock Sur"]], list).problems[0].message, /Stock <sede>/);
});

test("counts go out per location in requests of at most 200 SKU", () => {
  const counts = Array.from({ length: 450 }, (_, index) => ({ location_id: index < 401 ? "a" : "b", item_id: `i${index}`, quantity: 1 }));
  assert.deepEqual(locations.countBatches(counts).map((batch) => [batch.location_id, batch.counts.length]), [["a", 200], ["a", 200], ["a", 1], ["b", 49]]);
});

test("location actions map to their functions with shaped arguments", () => {
  assert.deepEqual(inventoryCall({ action: "location_save", fields: { name: "Centro" } }), { fn: "save_store_location", args: { p_location_id: null, p_fields: { name: "Centro" } } });
  assert.equal(inventoryCall({ action: "location_save", location_id: "nope", fields: {} }), null);
  assert.equal(inventoryCall({ action: "location_transfer", item_id: ID, from: ID, to: ID2, quantity: 2, key: "traslado-1234" }).fn, "transfer_location_stock");
  assert.equal(inventoryCall({ action: "location_bulk_stock", location_id: ID, operations: [], key: "short" }), null);
  assert.equal(inventoryCall({ action: "location_counts", location_id: ID, counts: new Array(201).fill({}), key: "conteo-12345" }), null);
  assert.equal(inventoryCall({ action: "location_archive", location_id: ID, move_to: null, key: "archivar-1234" }).args.p_move_to, null);
});

test("a Mostrador sale at a location uses the location function, otherwise the usual one", () => {
  const sale = { key: "mostrador-1234", channel: "tienda_fisica", lines: [{ item_id: ID, merchant_sku: "A", quantity: 2 }] };
  assert.equal(saleRequest(sale).action, "bulk_stock");
  const here = saleRequest({ ...sale, location_id: ID2 });
  assert.equal(here.action, "location_bulk_stock");
  assert.equal(here.location_id, ID2);
  assert.deepEqual(here.operations, [{ item_id: ID, type: "sale", quantity: 2, channel: "tienda_fisica", reference: "Mostrador" }]);
});

// ------------------------------------------------------------------ run-03

const receipt = (over = {}) => ({
  id: ID, kind: "boleta", series: "B001", number: 7, status: "pending", customer_doc_type: "none", customer_doc_number: null,
  customer_name: null, customer_address: null, customer_email: null, igv_affectation: "gravado", total_cents: 0,
  issue_date: "2026-11-03", attempts: 0, provider_link: null, pdf_url: null, xml_url: null, cdr_url: null,
  sunat_accepted: null, sunat_description: null, error_message: null, void_reason: null, voided_at: null,
  location_id: null, sale_key: "mostrador-1234", created_at: "2026-11-03T15:00:00Z",
  lines: [
    { item_id: ID, sku: "GTR-1", description: "Guitarra", quantity: 1, unit_price_cents: 349990 },
    { item_id: ID2, sku: "CAB-1", description: "Cable · 3 m", quantity: 3, unit_price_cents: 2500 },
  ],
  ...over,
});

test("amounts: lines add up exactly to the totals, IGV included in the price", () => {
  const amounts = nubefact.receiptAmounts(receipt().lines, "gravado");
  assert.equal(amounts.total, 3574.9);
  assert.equal(Math.round((amounts.taxable + amounts.igv) * 100), 357490);
  assert.equal(Math.round(amounts.lines.reduce((sum, line) => sum + line.subtotal, 0) * 100), Math.round(amounts.taxable * 100));
  assert.equal(amounts.lines[1].unitPrice, 25);
  assert.equal(amounts.lines[1].total, 75);
  assert.equal(amounts.lines[1].subtotal, 63.56);
  assert.equal(amounts.lines[1].igv, 11.44);
  const exempt = nubefact.receiptAmounts(receipt().lines, "exonerado");
  assert.equal(exempt.igv, 0);
  assert.equal(exempt.exempt, 3574.9);
  assert.equal(exempt.taxable, 0);
});

test("the issue payload follows the provider's fields", () => {
  const payload = nubefact.issuePayload(receipt({ kind: "factura", series: "F001", customer_doc_type: "ruc", customer_doc_number: "20123456789", customer_name: "Música Andina SAC", customer_email: "a@b.pe" }), { emailCustomer: true });
  assert.equal(payload.operacion, "generar_comprobante");
  assert.equal(payload.tipo_de_comprobante, 1);
  assert.equal(payload.cliente_tipo_de_documento, "6");
  assert.equal(payload.fecha_de_emision, "03-11-2026");
  assert.equal(payload.moneda, 1);
  assert.equal(payload.porcentaje_de_igv, 18);
  assert.equal(payload.enviar_automaticamente_a_la_sunat, true);
  assert.equal(payload.enviar_automaticamente_al_cliente, true);
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[0].tipo_de_igv, 1);
  assert.equal(payload.items[0].unidad_de_medida, "NIU");
  const boleta = nubefact.issuePayload(receipt(), { emailCustomer: true });
  assert.equal(boleta.tipo_de_comprobante, 2);
  assert.equal(boleta.cliente_tipo_de_documento, "-");
  assert.equal(boleta.enviar_automaticamente_al_cliente, false, "no e-mail without an address");
  assert.equal(nubefact.voidPayload(receipt(), "Error en el precio").operacion, "generar_anulacion");
});

test("provider answers are read into issued, refused, credentials, exists and not found", () => {
  const issued = nubefact.readProviderAnswer(200, { enlace: "https://www.nubefact.com/cpe/x", enlace_del_pdf: "https://www.nubefact.com/cpe/x.pdf", enlace_del_xml: "javascript:alert(1)", aceptada_por_sunat: false, sunat_description: "" });
  assert.equal(issued.kind, "issued");
  assert.equal(issued.xml, null, "only https links are kept");
  assert.equal(issued.sunatAccepted, false);
  assert.equal(nubefact.readProviderAnswer(200, { errors: "Token incorrecto", codigo: 10 }).kind, "credentials");
  assert.equal(nubefact.readProviderAnswer(200, { errors: "Ya existe", codigo: 23 }).kind, "exists");
  assert.equal(nubefact.readProviderAnswer(200, { errors: "No existe", codigo: 24 }).kind, "not_found");
  assert.equal(nubefact.readProviderAnswer(200, { errors: "El campo total es inválido", codigo: 21 }).kind, "refused");
  assert.equal(nubefact.readProviderAnswer(502, null).kind, "unreachable");
  assert.equal(nubefact.readProviderAnswer(401, null).kind, "credentials");
});

test("Mostrador checks the customer the way the database does", () => {
  const problem = (request, total = 1000) => nubefact.receiptProblem(request, total);
  assert.equal(problem({ kind: "boleta", customer: { doc_type: "none" } }), null);
  assert.match(problem({ kind: "boleta", customer: { doc_type: "none" } }, 70_000), /S\/ 700/);
  assert.match(problem({ kind: "boleta", customer: { doc_type: "dni", doc_number: "1234", name: "Ana" } }), /8 dígitos/);
  assert.match(problem({ kind: "factura", customer: { doc_type: "ruc", doc_number: "20123456789" } }), /razón social/);
  assert.match(problem({ kind: "factura", customer: { doc_type: "ruc", doc_number: "30123456789", name: "X SAC" } }), /RUC/);
  assert.equal(problem({ kind: "factura", customer: { doc_type: "ruc", doc_number: "20123456789", name: "X SAC" } }), null);
  assert.match(problem({ kind: "boleta", customer: { doc_type: "none" }, lines: [{ item_id: ID, unit_price_cents: null }] }), /precio/);
});

test("the WhatsApp copy opens the store's own WhatsApp with the PDF link", () => {
  const href = nubefact.receiptWhatsAppHref("987 654 321", receipt({ pdf_url: "https://www.nubefact.com/cpe/x.pdf" }), "Tienda A");
  assert.ok(href.startsWith("https://wa.me/51987654321?text="));
  assert.match(decodeURIComponent(href), /boleta B001-7 de Tienda A: https:\/\/www\.nubefact\.com\/cpe\/x\.pdf/);
  assert.equal(nubefact.receiptWhatsAppHref("123", receipt({ pdf_url: "https://x.pe/a" }), "A"), null);
  assert.equal(nubefact.receiptWhatsAppHref("987654321", receipt(), "A"), null, "nothing to send before the PDF exists");
});

test("the token is sealed per store and the feature is off without a valid key", () => {
  assert.equal(secret.einvoiceAvailable({}), false);
  assert.equal(secret.einvoiceAvailable({ LARIA_EINVOICE_KEY: "short" }), false);
  const env = { LARIA_EINVOICE_KEY: Buffer.alloc(32, 7).toString("base64") };
  const key = secret.einvoiceKey(env);
  assert.ok(key);
  const sealed = secret.sealToken("abcDEF1234567890abcdEF12", "store-a", key);
  assert.match(sealed, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(secret.openToken(sealed, "store-a", key), "abcDEF1234567890abcdEF12");
  assert.equal(secret.openToken(sealed, "store-b", key), null, "another store's id does not open it");
  assert.equal(secret.openToken(sealed, "store-a", Buffer.alloc(32, 8)), null);
  assert.equal(secret.tokenHint("abcDEF1234567890abcdEF12"), "EF12");
  assert.equal(secret.einvoiceKey({ LARIA_EINVOICE_KEY: "ab".repeat(32) }).length, 32);
});

// A fake admin client: the sealed settings row and the results the server records.
function fakeAdmin(storeId, token) {
  process.env.LARIA_EINVOICE_KEY = Buffer.alloc(32, 3).toString("base64");
  const sealed = secret.sealToken(token, storeId, secret.einvoiceKey());
  const recorded = [];
  return {
    recorded,
    from() {
      return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { api_url: "https://api.nubefact.com/api/v1/abcdef12-3456", token_ciphertext: sealed, email_customer: true }, error: null }) };
    },
    rpc: async (fn, args) => {
      recorded.push({ fn, ...args });
      return { data: { receipt: { ...receipt(), status: args.p_result.status === "accepted" ? "accepted" : "error", error_message: args.p_result.error_message ?? null } }, error: null };
    },
  };
}

function fakeFetch(answers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return { status: next.status ?? 200, json: async () => next.body };
  };
  return { calls, fetchImpl };
}

test("sending a receipt: the token goes in the header and the answer is recorded by the server", async () => {
  const admin = fakeAdmin("store-a", "tokenTOKEN1234567890xyz");
  const { calls, fetchImpl } = fakeFetch([{ body: { enlace: "https://www.nubefact.com/cpe/1", enlace_del_pdf: "https://www.nubefact.com/cpe/1.pdf", aceptada_por_sunat: true, sunat_description: "Aceptada" } }]);
  const sent = await server.sendReceipt(admin, "store-a", receipt(), fetchImpl);
  assert.equal(sent.status, "accepted");
  assert.equal(calls[0].headers.Authorization, 'Token token="tokenTOKEN1234567890xyz"');
  assert.equal(calls[0].body.operacion, "generar_comprobante");
  assert.deepEqual(admin.recorded.map((entry) => [entry.fn, entry.p_result.status, entry.p_result.pdf_url]), [["record_store_receipt_result", "accepted", "https://www.nubefact.com/cpe/1.pdf"]]);
});

test("a lost answer is looked up before it is reported, so a retry never issues twice", async () => {
  const admin = fakeAdmin("store-a", "tokenTOKEN1234567890xyz");
  const { calls, fetchImpl } = fakeFetch([new Error("socket hang up"), { body: { enlace: "https://www.nubefact.com/cpe/1", aceptada_por_sunat: false } }]);
  await server.sendReceipt(admin, "store-a", receipt(), fetchImpl);
  assert.deepEqual(calls.map((call) => call.body.operacion), ["generar_comprobante", "consultar_comprobante"]);
  assert.equal(admin.recorded[0].p_result.status, "accepted");

  const again = fakeAdmin("store-a", "tokenTOKEN1234567890xyz");
  const exists = fakeFetch([{ body: { errors: "Este documento ya existe", codigo: 23 } }, { body: { enlace: "https://www.nubefact.com/cpe/1" } }]);
  await server.sendReceipt(again, "store-a", receipt(), exists.fetchImpl);
  assert.equal(again.recorded[0].p_result.status, "accepted", "an existing receipt is read back");

  const down = fakeAdmin("store-a", "tokenTOKEN1234567890xyz");
  const unreachable = fakeFetch([{ status: 503, body: null }, { body: { errors: "No existe", codigo: 24 } }]);
  await server.sendReceipt(down, "store-a", receipt(), unreachable.fetchImpl);
  assert.equal(down.recorded[0].p_result.status, "error");
  assert.match(down.recorded[0].p_result.error_message, /Vuelve a intentarlo/);
});

test("the connection test accepts 'not found' and refuses a bad token", async () => {
  assert.deepEqual(await server.testConnection("https://api.nubefact.com/api/v1/abcdef12-3456", "t", fakeFetch([{ body: { errors: "No existe", codigo: 24 } }]).fetchImpl), { ok: true });
  const bad = await server.testConnection("https://api.nubefact.com/api/v1/abcdef12-3456", "t", fakeFetch([{ body: { errors: "Token", codigo: 10 } }]).fetchImpl);
  assert.equal(bad.ok, false);
});

test("without the server key, sending records a clear error and calls nobody", async () => {
  const admin = fakeAdmin("store-a", "tokenTOKEN1234567890xyz");
  delete process.env.LARIA_EINVOICE_KEY;
  const { calls, fetchImpl } = fakeFetch([]);
  await server.sendReceipt(admin, "store-a", receipt(), fetchImpl);
  assert.equal(calls.length, 0);
  assert.match(admin.recorded[0].p_result.error_message, /aún no está disponible/);
});
