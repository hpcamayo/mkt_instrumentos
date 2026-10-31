// Feature ideas, store-floor batch, buy-09 "Cuotas" (docs/feature-ideas/store-floor.md): the installment line and
// offer text, reading the offer, the "Acepta cuotas" filter and where the pilot switch gates it. Database behavior is
// in tests/store-installments.sql.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const load = (file) => require(path.resolve(file));
const read = (file) => fs.readFileSync(file, "utf8");
const payments = load("lib/payment-methods.ts");

test("installment amounts: the price split evenly, to the cent, grouped like the prices", () => {
  assert.equal(payments.formatInstallmentAmount(250), "S/ 250");
  assert.equal(payments.formatInstallmentAmount(4299 / 12), "S/ 358.25");
  assert.equal(payments.formatInstallmentAmount(4300 / 12), "S/ 358.33");
  assert.equal(payments.formatInstallmentAmount(1000 / 3), "S/ 333.33");
  assert.equal(payments.formatInstallmentAmount(36000 / 6), "S/ 6,000");
  assert.equal(payments.formatInstallmentAmount(12345.5), "S/ 12,345.50");
  assert.equal(payments.installmentLine(3000, 12), "o 12 cuotas sin intereses de S/ 250");
  assert.equal(payments.installmentLine(4299, 12), "o 12 cuotas sin intereses de S/ 358.25");
  for (const [price, count] of [[null, 12], [0, 12], [3000, null], [3000, 1], [undefined, undefined]]) {
    assert.equal(payments.installmentLine(price, count), null);
  }
});

test("the offer reads as one sentence, with the cards and the minimum price when there are any", () => {
  assert.equal(payments.installmentOfferText({ maxInstallments: 12, cards: [], minPricePen: null }),
    "Hasta 12 cuotas sin intereses con tarjeta de crédito.");
  assert.equal(payments.installmentOfferText({ maxInstallments: 6, cards: ["BCP"], minPricePen: 1500 }),
    "Hasta 6 cuotas sin intereses con tarjetas de crédito BCP, en compras desde S/ 1,500.");
  assert.equal(payments.installmentOfferText({ maxInstallments: 12, cards: ["BCP", "Interbank", "Tarjeta Oh"], minPricePen: null }),
    "Hasta 12 cuotas sin intereses con tarjetas de crédito BCP, Interbank o Tarjeta Oh.");
});

test("reading an offer keeps only known cards in list order and refuses anything else", () => {
  assert.deepEqual(payments.readInstallmentOffer({ max_installments: 12, cards: ["Interbank", "Banco X", "BCP"], min_price_pen: 500 }),
    { maxInstallments: 12, cards: ["BCP", "Interbank"], minPricePen: 500 });
  assert.deepEqual(payments.readInstallmentOffer({ max_installments: 3, cards: null, min_price_pen: null }),
    { maxInstallments: 3, cards: [], minPricePen: null });
  for (const value of [null, [], "12", { max_installments: 1 }, { max_installments: 40 }, { max_installments: 2.5 }]) {
    assert.equal(payments.readInstallmentOffer(value), null);
  }
});

test("the card list and the choices match the database", () => {
  const migration = read("supabase/migrations/20261206120400_feat_store_installments.sql");
  const listed = /installment_card_options\(\)[\s\S]*?select array\[([\s\S]*?)\];/.exec(migration)[1];
  assert.deepEqual([...listed.matchAll(/'([^']+)'/g)].map((match) => match[1]), [...payments.INSTALLMENT_CARDS]);
  assert.ok(payments.INSTALLMENT_CHOICES.every((count) => count >= 2 && count <= 36));
  assert.match(migration, /max_installments between 2 and 36/);
  assert.deepEqual([...payments.CARD_PAYMENT_METHODS], ["pos_tarjeta_al_recoger", "link_de_pago"]);
  assert.match(migration, /m\.method in \('pos_tarjeta_al_recoger', 'link_de_pago'\)/);
});

test('"Acepta cuotas" is a listing flag offered only when results carry it, or it is chosen', () => {
  const { parseListingFilters } = require("@/lib/listings");
  const { catalogFacets } = require("@/lib/catalog-filters");
  const flags = require("@/lib/listing-flags");
  assert.ok(flags.isListingFlag("acepta_cuotas"));
  assert.deepEqual(flags.parseListingOptions(["acepta-cuotas"]), ["acepta_cuotas"]);
  const data = (options) => ({ total: 10, category: {}, instrument_type: {}, condition: {}, seller_type: {}, locations: [], brands: [], price: null, advanced: {}, options });
  const values = (filters, counts) => catalogFacets(filters, {}, {}, counts).find((facet) => facet.key === "opciones").options.map((option) => option.value);
  assert.ok(!values(parseListingFilters({}), null).includes("acepta_cuotas"), "offered without counts");
  assert.ok(!values(parseListingFilters({}), data({ acepta_cuotas: 0, con_garantia: 0 })).includes("acepta_cuotas"), "offered with no results");
  assert.ok(values(parseListingFilters({}), data({ con_garantia: 0 })).includes("con_garantia"), "other flags stay");
  assert.ok(values(parseListingFilters({}), data({ acepta_cuotas: 3 })).includes("acepta_cuotas"), "not offered with results");
  assert.ok(values(parseListingFilters({ opciones: "acepta-cuotas" }), data({ acepta_cuotas: 0 })).includes("acepta_cuotas"), "a chosen flag cannot be unticked");
});

test("cards, the listing page and the store page follow the pilot switch", () => {
  const catalog = read("lib/catalog.ts");
  assert.match(catalog, /assistedCommerceEnabled\(\) \? "installments_max,\\n" : ""/);
  assert.match(read("app/tiendas/[slug]/page.tsx"), /assistedCommerceEnabled\(\) \? STORE_LISTING_SELECT\.replace\("restock_expected_on,", "restock_expected_on,\\n  installments_max,"\)/);
  assert.match(read("app/tiendas/[slug]/page.tsx"), /STORE_LISTING_SELECT = `[\s\S]*restock_expected_on,\n/);
  const listing = read("app/instrumentos/[slug]/page.tsx");
  assert.match(listing, /async function loadInstallments[\s\S]*if \(!assistedCommerceEnabled\(\)/);
  assert.match(listing, /installments=\{purchase \? installments : null\}/);
  const card = read("components/listing-card.tsx");
  assert.match(card, /isOutOfStock\(listing\) \? null : installmentLine\(listing\.price_pen, listing\.installments_max\)/);
  for (const route of ["app/api/store/installments/route.ts"]) {
    assert.match(read(route), /if \(!assistedCommerceEnabled\(\)\) return failure\("Esta función aún no está disponible\.", 404\)/);
  }
  // The owner confirms "sin intereses" every time: the box starts unticked and the route forwards the answer as sent.
  const form = read("components/payment/store-installments-form.tsx");
  assert.doesNotMatch(form, /name="interestFree"[^>]*defaultChecked/);
  assert.match(read("app/api/store/installments/route.ts"), /p_interest_free: body\.interestFree/);
});
