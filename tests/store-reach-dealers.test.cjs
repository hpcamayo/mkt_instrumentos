// Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md), reach-04 "Distribuidor oficial". Unit checks
// for matching, the document check, the public copy and the routes; the database rules are in
// tests/store-reach-dealers.sql.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const load = Module._load;
Module._load = function stubServerOnly(request, ...rest) {
  if (request === "server-only") return {};
  return load.call(this, request, ...rest);
};

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const {
  dealerBrandKey, parseActiveDealers, parseDealerAuthorizations, dealerForListing, dealersForBrand, storeDealerBrands,
  detectDealerDocumentType, formatDealerDate,
} = require("@/lib/dealers");
const { notificationHref, notificationLabel } = require("@/lib/notifications");

const DEALERS = parseActiveDealers([
  { brand: "Yamaha", valid_until: null, store_id: "s1", store_slug: "musica-lima", store_name: "Música Lima", store_city: "Lima", store_verified: true, keys: ["yamaha"] },
  { brand: "Fender", valid_until: "2027-03-31", store_id: "s1", store_slug: "musica-lima", store_name: "Música Lima", store_city: "Lima", store_verified: true, keys: ["fender", "fender musical instruments"] },
  { brand: "Yamaha", valid_until: null, store_id: "s2", store_slug: "arequipa-sonido", store_name: "Arequipa Sonido", store_city: null, store_verified: false, keys: [] },
  { brand: 1, store_id: "x" },
]);

test("reach-04: brands match by their folded spelling and only on new instruments of the dealer's store", () => {
  assert.equal(DEALERS.length, 3);
  assert.deepEqual(DEALERS[2].keys, ["yamaha"], "a dealer without keys falls back to its brand");
  assert.equal(dealerBrandKey("  Yamahá   Música "), "yamaha musica");
  const base = { store_id: "s1", brand: "YAMAHA", condition: "Nuevo", seller_type: "store" };
  assert.equal(dealerForListing(DEALERS, base)?.brand, "Yamaha");
  assert.equal(dealerForListing(DEALERS, { ...base, brand: "Fender Musical Instruments" })?.brand, "Fender");
  assert.equal(dealerForListing(DEALERS, { ...base, condition: "Usado - buen estado" }), null, "used: no mark");
  assert.equal(dealerForListing(DEALERS, { ...base, store_id: "s3" }), null, "another store: no mark");
  assert.equal(dealerForListing(DEALERS, { ...base, seller_type: "individual" }), null, "a Particular: no mark");
  assert.equal(dealerForListing(DEALERS, { ...base, brand: "Roland" }), null);
  assert.equal(dealerForListing(DEALERS, { ...base, brand: null }), null);
  assert.deepEqual(dealersForBrand(DEALERS, "yamaha").map((dealer) => dealer.storeName), ["Arequipa Sonido", "Música Lima"]);
  assert.deepEqual(dealersForBrand(DEALERS, ""), []);
  assert.deepEqual(storeDealerBrands(DEALERS, "s1"), ["Fender", "Yamaha"]);
  assert.equal(formatDealerDate("2027-03-31"), "31 de marzo de 2027");
});

test("reach-04: the document is judged by its bytes, never its name", () => {
  const bytes = (...values) => new Uint8Array(values);
  const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
  assert.equal(detectDealerDocumentType(pdf), "application/pdf");
  assert.equal(detectDealerDocumentType(new TextEncoder().encode("%PDF-1.7\n<< truncated")), null, "a PDF without its end");
  assert.equal(detectDealerDocumentType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0)), "image/jpeg");
  assert.equal(detectDealerDocumentType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), "image/png");
  assert.equal(detectDealerDocumentType(new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")])), "image/webp");
  assert.equal(detectDealerDocumentType(new TextEncoder().encode("<html><script>alert(1)</script>")), null);
  assert.equal(detectDealerDocumentType(new Uint8Array()), null);
});

test("reach-04: rows parse strictly", () => {
  const rows = parseDealerAuthorizations([
    { id: "a", brand: "Yamaha", status: "pending", active: false, document_name: "carta.pdf", document_type: "application/pdf", document_bytes: 10, valid_until: "2027-01-01", revision: 2, store_id: "s1", store_name: "Música Lima", store_slug: "musica-lima", store_status: "active", store_ruc: "20123456789", store_verified: true },
    { id: "b", brand: "Yamaha", status: "unknown", document_type: "application/pdf", revision: 1 },
    { id: "c", brand: "Yamaha", status: "pending", document_type: "text/html", revision: 1 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].store.ruc, "20123456789");
  assert.equal(rows[0].validUntil, "2027-01-01");
});

test("reach-04: the mark says what Laria checked and that the warranty is not Laria's", () => {
  const { DealerMark } = require("@/components/store-reach/dealer-marks");
  const html = renderToStaticMarkup(React.createElement(DealerMark, { dealer: DEALERS[1] }));
  assert.match(html, /Distribuidor oficial Fender/);
  assert.match(html, /Qué revisó Laria/);
  assert.match(html, /Laria revisó un documento de Fender o de su representante en Perú que autoriza a Música Lima como distribuidor, vigente hasta el 31 de marzo de 2027\./);
  assert.match(html, /Laria no revisa cada instrumento ni da garantía\. La garantía del fabricante la ofrece la tienda con Fender/);
  const copy = [read("components/store-reach/dealer-marks.tsx"), read("app/mi-cuenta/tienda/distribuidor/page.tsx")].join("\n");
  assert.doesNotMatch(copy, /Laria garantiza|garantizado por Laria|verificado por Laria|original garantizado|100% original/i);
});

test("reach-04: routes check origin, bytes and the Admin role, and the marks refresh after a decision", () => {
  for (const file of ["app/api/store/dealers/route.ts", "app/api/store/dealers/[id]/complete/route.ts", "app/api/admin/dealers/route.ts"]) {
    assert.match(read(file), /if \(!sameOriginEventRequest\(request\)\) return failure\("Solicitud inválida\.", 403\);/, file);
  }
  const complete = read("app/api/store/dealers/[id]/complete/route.ts");
  assert.match(complete, /const detected = bytes\.byteLength <= DEALER_DOCUMENT_MAX_BYTES \? detectDealerDocumentType\(bytes\) : null;/);
  assert.match(complete, /if \(detected !== row\.documentType\) \{\s*await service\.storage\.from\("store-dealer-documents"\)\.remove\(\[path\]\);/);
  assert.match(read("app/api/admin/dealers/route.ts"), /revalidateTag\(DEALERS_CACHE_TAG\);/);
  const document = read("app/api/admin/dealers/[id]/document/route.ts");
  assert.match(document, /rpc\("admin_get_dealer_document"/);
  assert.match(document, /createSignedUrl\(document\.path, 60,/);
  assert.match(read("lib/dealers-server.ts"), /if \(catalogEnrichmentDisabled\(\)\) return \[\];/);
  // Host pages add one line each and never wait for the marks.
  assert.match(read("app/instrumentos/[slug]/page.tsx"), /\{isSold \? null : <ListingReachMarks listing=\{listing\} \/>\}/);
  assert.match(read("app/tiendas/[slug]/page.tsx"), /\{preview \? null : <StoreDealerBrandsSlot storeId=\{store\.id\} \/>\}/);
  assert.match(read("components/catalog-view.tsx"), /<BrandDealersSlot brand=\{filters\.brand\} \/>/);
});

test("reach-04: notifications name the decision and open the store's page", () => {
  for (const type of ["store_dealer_approved", "store_dealer_rejected", "store_dealer_revoked"]) {
    assert.notEqual(notificationLabel(type), "Actualización de tu cuenta", type);
    assert.equal(notificationHref({ event_type: type, listing_id: null, store_id: "s1" }), "/mi-cuenta/tienda/distribuidor");
  }
});
