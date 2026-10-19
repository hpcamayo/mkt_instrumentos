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
