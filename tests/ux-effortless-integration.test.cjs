// Effortless Laria, integration (docs/ux-effortless/integration.md): where two batches' work meets on one screen.
// The database side is tests/ux-effortless-integration.sql.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("stock-23 with talk-03 and talk-04: the quantity picker opens WhatsApp at once and keeps the safety sheet", () => {
  const contactModule = source("components/listing/contact-module.tsx");
  assert.match(contactModule, /purchase && maxQuantity > 1 \? \(\s*<PurchaseRequestLink [^>]*safety=\{safety\}/);
  assert.match(contactModule, /<WhatsAppContactLink [^>]*safety=\{safety\}/);
  const picker = source("components/payment/purchase-request-link.tsx");
  assert.match(picker, /<WhatsAppContactLink href=\{withPurchaseQuantity\(href, quantity\)\}[^>]*quantity=\{quantity\} safety=\{safety\}/);
  const link = source("components/whatsapp-contact-link.tsx");
  // The link is the server-built href; the record never decides where the press goes.
  assert.doesNotMatch(link, /window\.open|payload\.url|AbortController/);
  const page = source("app/instrumentos/[slug]/page.tsx");
  assert.match(page, /maxQuantity=\{purchase\?\.maxQuantity\}\s*safety=\{needsSafetySheet\(/);
});

test("stock-05 with list-12: ready replies read the owner's own store row and type the hours once", () => {
  const page = source("app/mi-cuenta/tienda/solicitudes/page.tsx");
  assert.doesNotMatch(page, /\.from\("stores"\)/, "the street address is not readable through the stores table");
  assert.match(page, /address: store\.address \?\? null/);
  assert.match(page, /pickup_hours: hours \?\? store\.opening_hours \?\? null/);
  assert.match(page, /<PickupHoursForm hours=\{hours\} openingHours=\{store\.opening_hours \?\? null\} \/>/);
});

test("stock-09 with stock-20: the SKU page shows what a publication starts with, and one category field", () => {
  const page = source("app/mi-cuenta/tienda/inventario/[itemId]/page.tsx");
  assert.match(page, /item\.listing_id \? Promise\.resolve\(undefined\) : getSkuListingDetails<SkuListingDetails>\(supabase, item\.id\)/);
  assert.match(page, /<SkuListingDetailsPanel key=\{`datos-\$\{item\.version\}-\$\{item\.category \?\? ""\}`\} itemId=\{item\.id\} category=\{item\.category\} details=\{listingDetails\} canWrite=\{canWrite\} \/>/);
  const panel = source("components/inventory/sku-listing-details.tsx");
  assert.doesNotMatch(panel, /label="Categoría"/, "the SKU's category is edited in Categoría del SKU");
  assert.match(source("components/inventory/item-detail.tsx"), /label="Categoría del SKU"/);
});

test("stock-10 with the bulk bar: Publicar seleccionados sends the rows the owner ticked, never a whole filter", () => {
  const table = source("components/inventory/inventory-table.tsx");
  assert.match(table, /\{!matching \? <PublishSelectedButton itemIds=\{selectedItems\.filter/);
});

test("FIND 11 with big-04: one Vistos recientemente, kept in lib/device-saves.ts and drawn from today's cards", () => {
  const files = ["app", "components", "lib"].flatMap((dir) => fs.readdirSync(path.join(root, dir), { recursive: true }).map((file) => path.join(dir, String(file))));
  const keyed = files.filter((file) => /\.(ts|tsx)$/.test(file) && source(file).includes('"laria:vistos"'));
  assert.deepEqual(keyed, ["lib/device-saves.ts"], "one module owns the list");
  const row = source("components/catalog-recently-viewed.tsx");
  assert.match(row, /useViewedListings\(\)/);
  assert.match(row, /onClick=\{clearViewed\}/);
  assert.doesNotMatch(row, /@\/lib\/catalog-device/);
  assert.match(source("components/saving/device-favorites.tsx"), /const cards = useViewedListings\(\);/);
  assert.doesNotMatch(source("components/listing-card.tsx"), /RECENT_KEY|addRecent/);
  assert.match(source("components/marketplace-account-provider.tsx"), /if \(match\) recordViewed\(match\[1\]\);/);
});

test("save-04 with the home's new listings: one previous visit, counted from every page change", () => {
  const saves = source("lib/device-saves.ts");
  assert.match(saves, /export function previousVisitFrom\(/);
  for (const page of ["app/mi-cuenta/alertas/page.tsx", "app/mi-cuenta/favoritos/page.tsx"]) {
    assert.match(source(page), /previousVisitFrom\(jar\.get\(LAST_VISIT_COOKIE\)\?\.value, jar\.get\(PREVIOUS_VISIT_COOKIE\)\?\.value\)/, page);
  }
  const home = source("components/home/home-for-you.tsx");
  assert.match(home, /previousVisit: readPreviousVisit\(\)\?\.getTime\(\) \?\? null/);
  assert.doesNotMatch(home, /LAST_VISIT_KEY|visita-anterior|startVisit/);
  assert.doesNotMatch(source("lib/catalog-device.ts"), /ultima-visita/);
  // The marker moves on every page change, in the same effect that records a viewed listing.
  assert.match(source("components/marketplace-account-provider.tsx"), /useEffect\(\(\) => \{\n    touchVisit\(\);\n    const match = /);
});
