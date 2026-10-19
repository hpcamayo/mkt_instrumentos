// Effortless Laria, batch "listing" (docs/ux-effortless/listing.md): WhatsApp numbers wa.me can open, store listings
// that follow the store's current number (fix-03), and a sold listing's "similares" link that never lands on nothing
// (fix-09).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const contact = require("@/lib/seller-contact.ts");
const listings = require("@/lib/listings.ts");
const payments = require("@/lib/payment-methods.ts");

const baseListing = {
  id: "l1",
  title: "Boss DS-1",
  slug: "boss-ds-1",
  seller_type: "individual",
  owner_user_id: null,
  profiles: null,
  contact_name: "Ana",
  whatsapp_phone: "987654321",
  city: "Lima",
  region: "Lima",
  created_at: "2026-01-01T00:00:00Z",
  stores: null,
};

test("wa.me numbers carry the Peruvian country code", () => {
  assert.equal(contact.whatsAppNumber("987654321"), "51987654321");
  assert.equal(contact.whatsAppNumber("987 654 321"), "51987654321");
  assert.equal(contact.whatsAppNumber("+51 987 654 321"), "51987654321");
  assert.equal(contact.whatsAppNumber("51987654321"), "51987654321");
  assert.equal(contact.whatsAppNumber("0051987654321"), "51987654321");
  // A Lima landline or a foreign number is kept as typed: only 9-digit mobiles are completed.
  assert.equal(contact.whatsAppNumber("014441234"), "014441234");
  assert.equal(contact.whatsAppNumber("+34 612 345 678"), "34612345678");
  assert.equal(contact.whatsAppNumber(null), "");
});

test("every WhatsApp button opens a number wa.me understands", () => {
  assert.match(listings.buildWhatsAppUrl(baseListing), /^https:\/\/wa\.me\/51987654321\?text=/);
  assert.match(listings.buildStoreWhatsAppUrl({ name: "T", whatsapp_phone: "987654321" }), /^https:\/\/wa\.me\/51987654321\?text=/);
  assert.match(payments.buildPurchaseWhatsAppUrl("987654321", { title: "T", slug: "t" }, null), /^https:\/\/wa\.me\/51987654321\?text=/);
});

test("a store listing contacts the store's current number (fix-03)", () => {
  const storeListing = { ...baseListing, seller_type: "store", whatsapp_phone: "51911111111", stores: { whatsapp_phone: "51922222222" } };
  assert.equal(contact.resolveContactPhone(storeListing), "51922222222");
  assert.equal(contact.resolveContactPhone({ ...storeListing, stores: [{ whatsapp_phone: "51933333333" }] }), "51933333333");
  // Without the store row (not embedded, or not public) the listing's own copy is the fallback.
  assert.equal(contact.resolveContactPhone({ ...storeListing, stores: null }), "51911111111");
  assert.equal(contact.resolveContactPhone({ ...storeListing, stores: { whatsapp_phone: "" } }), "51911111111");
  assert.match(listings.buildWhatsAppUrl(storeListing), /^https:\/\/wa\.me\/51922222222\?/);
  // A Particular listing still follows the owner's profile.
  const owned = { ...baseListing, owner_user_id: "u1", profiles: { full_name: "Ana", phone: "51944444444", city: "Lima", region: "Lima", created_at: "2026-01-01T00:00:00Z" } };
  assert.equal(contact.resolveContactPhone(owned), "51944444444");
});

test("the contact route and the page read the store's number", () => {
  const fs = require("node:fs");
  const route = fs.readFileSync("app/api/contact/route.ts", "utf8");
  assert.match(route, /stores\(whatsapp_phone\)/);
  assert.match(route, /buildPurchaseWhatsAppUrl\(resolveContactPhone\(/);
  const page = fs.readFileSync("app/instrumentos/[slug]/page.tsx", "utf8");
  assert.match(page, /buildPurchaseWhatsAppUrl\(resolveContactPhone\(listing\)/);
});

test("a sold listing's similar section is never empty when linked (fix-09)", () => {
  const { RelatedListings } = require("@/components/listing/related-listings.tsx");
  const link = { href: "/instrumentos/pedales", label: "Ver todo" };
  assert.equal(renderToStaticMarkup(React.createElement(RelatedListings, { id: "similares", title: "Publicaciones similares", link, listings: [] })), "");
  const html = renderToStaticMarkup(React.createElement(RelatedListings, { id: "similares", title: "Publicaciones similares", link, listings: [], emptyText: "Ahora no hay otras publicaciones de este tipo." }));
  assert.match(html, /id="similares"/);
  assert.match(html, /href="\/instrumentos\/pedales"/);
  assert.match(html, /Explorar el catálogo/);
});
