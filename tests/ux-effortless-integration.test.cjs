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

test("save-12 with the home: what a signed-in person follows shows above Para ti", () => {
  const route = source("app/api/follows/route.ts");
  assert.match(route, /body\?\.action === "arrivals"[\s\S]*?client\.rpc\("get_followed_arrivals", \{ p_limit: 8, p_days: 14 \}\)/);
  const home = source("app/page.tsx");
  assert.match(home, /<HomeFollowedArrivals \/>\s*\{pool\?\.length \? <HomeForYou /);
  const section = source("components/home/home-followed.tsx");
  assert.match(section, /if \(!settled \|\| !authenticated\)/, "nothing is asked for visitors");
  assert.match(source("components/following/followed-arrivals.tsx"), /aria-labelledby="lo-que-sigues"/);
});

test("auth-03 in the other batches' forms: every price reads 'S/ 1,250', names are not corrected, WhatsApp gets +51", () => {
  const priceFields = {
    "components/sell-listing-form.tsx": /<PriceInput name="price_pen" value=\{values\.price\} onValueChange=\{\(text\) => set\("price", text\)\} \/>/,
    "components/listing-edit-form.tsx": /<PriceInput name="price_pen" required defaultValue=\{listing\.price_pen\} \/>/,
    "components/listing-management-table.tsx": /<PriceInput\s+autoFocus\s+value=\{value\}\s+onValueChange=/,
    "components/pendientes-list.tsx": /<PriceInput name="price" defaultValue=\{action\.price\} required \/>/,
    "components/store-import/complete-row-sheet.tsx": /<PriceInput name="price" required \/>/,
    "components/inventory/sku-forms.tsx": /<PriceInput name="unit_price_pen" defaultValue=\{initial\?\.unit_price_pen\} \/>/,
    "components/inventory/item-detail.tsx": /<PriceInput name="unit_price_pen" defaultValue=\{item\.unit_price_pen\} \/>/,
  };
  for (const [file, pattern] of Object.entries(priceFields)) {
    const text = source(file);
    assert.match(text, pattern, file);
    assert.doesNotMatch(text, /name="(price|price_pen|unit_price_pen)" [^>]*pattern=/, `${file}: the grouped "1,250" must not fail a digits-only pattern`);
  }
  // The SKU forms read the grouped text with the same parser as the server.
  for (const file of ["components/inventory/sku-forms.tsx", "components/inventory/item-detail.tsx"]) assert.match(source(file), /priceText \? parseWholeSolPrice\(priceText\) : null/, file);
  for (const file of ["components/sell-listing-form.tsx", "components/store-import/complete-row-sheet.tsx"]) {
    assert.match(source(file), /name="brand" [^>]*autoCorrect="off" spellCheck=\{false\}/, file);
    assert.match(source(file), /name="model" [^>]*autoCorrect="off" spellCheck=\{false\}/, file);
  }
  assert.match(source("components/listing-edit-form.tsx"), /name="brand" [^>]*plain \/>[\s\S]*name="model" [^>]*plain \/>/);
  assert.match(source("components/store-registration-form.tsx"), /<PhoneInput name="whatsapp_phone" required defaultValue=\{defaults\.whatsapp_phone\} \/>/);
  const storeSignup = source("components/store-owner-signup-form.tsx");
  assert.match(storeSignup, /<PhoneInput name="phone" required \/>/);
  assert.match(storeSignup, /<PasswordInput name="password" required minLength=\{PASSWORD_MIN_LENGTH\}/, "auth-01: the eye on every password field");
});

test("PriceInput kept in a form's own state shows the grouping, and the grouped text reads as the same price", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { PriceInput } = require("@/components/ui/price-input");
  const controlled = renderToStaticMarkup(React.createElement(PriceInput, { name: "price_pen", value: "1250", onValueChange: () => {} }));
  assert.match(controlled, /value="1,250"/);
  assert.match(controlled, /inputMode="numeric"/);
  const own = renderToStaticMarkup(React.createElement(PriceInput, { name: "price", defaultValue: 4500 }));
  assert.match(own, /value="4,500"/);
  const { parseWholeSolPrice } = require("@/lib/price");
  assert.equal(parseWholeSolPrice("1,250"), 1250);
});

test("auth-02 on the account home: the profile notice waits until the person has publications", async () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const Module = require("node:module");
  const ts = require("typescript");
  const filename = path.join(root, "app/mi-cuenta/page.tsx");
  const Link = ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children);
  const render = async (recent) => {
    const query = new Proxy({}, { get: (_, name) => () => (name === "limit" ? Promise.resolve({ data: recent }) : query) });
    const mocks = {
      "next/link": { default: Link },
      "lucide-react": { CheckCircle2: () => null, Circle: () => null, ExternalLink: () => null },
      "@/lib/account-context": { getAccountContext: async () => ({ user: { id: "nuevo", email: "nuevo@example.test" }, profile: { account_type: "seller", full_name: "Ana", phone: null, city: null, region: null }, store: null, supabase: { from: () => query, rpc: async () => ({ data: null, error: null }) } }) },
      "@/components/pendientes-list": { PendientesList: () => null },
      "@/components/vacation-mode": { VacationMode: () => null },
    };
    const mod = new Module(filename, module);
    mod.filename = filename;
    mod.paths = module.paths;
    const original = mod.require.bind(mod);
    mod.require = (name) => (Object.hasOwn(mocks, name) ? mocks[name] : original(name));
    mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
    return renderToStaticMarkup(await mod.exports.default({ searchParams: Promise.resolve({}) }));
  };
  const buyer = await render([]);
  assert.doesNotMatch(buyer, /Completa tu perfil Particular/, "a new account that only buys is not asked for WhatsApp");
  assert.match(buyer, /href="\/mi-cuenta\/publicar"/, "Publicar asks the first time");
  const seller = await render([{ id: "l1", title: "Guitarra", status: "approved", slug: "guitarra", price_pen: 900, created_at: "2026-10-01T12:00:00Z" }]);
  assert.match(seller, /Completa tu perfil Particular/);
  assert.match(seller, /href="\/mi-cuenta\/perfil"/);
});

test("list-09 on other batches' pages: pages with their own openGraph name the Laria card; store cards show Antes", () => {
  assert.match(source("lib/site.ts"), /export const DEFAULT_OG_IMAGES = \[\{ url: "\/opengraph-image", width: 1200, height: 630/);
  assert.match(source("lib/seo.ts"), /openGraph: \{ \.\.\.OPEN_GRAPH_BASE, title: `\$\{titled\(title\)\} \| \$\{SITE_NAME\}`, description: pageDescription, url, images: DEFAULT_OG_IMAGES \}/);
  for (const file of ["app/terminos/page.tsx", "app/privacidad/page.tsx", "app/articulos-prohibidos/page.tsx", "app/consejos-de-seguridad/page.tsx", "app/libro-de-reclamaciones/page.tsx"]) {
    assert.match(source(file), /openGraph: \{[^}]*images: DEFAULT_OG_IMAGES \}/, file);
  }
  assert.match(source("app/favoritos/compartida/[token]/page.tsx"), /images: image \? \[image\] : DEFAULT_OG_IMAGES/);
  assert.match(source("lib/seo.ts"), /images: store\.logo_url \? \[\{ url: absoluteUrl\(store\.logo_url\), alt: store\.name \}\] : DEFAULT_OG_IMAGES/);
  assert.match(source("lib/store-storefront.ts"), /url: plain \? STORES_PATH : url, images: DEFAULT_OG_IMAGES \}/);
  // Static category siblings name their own file-based card explicitly; the home inherits its card.
  assert.match(source("lib/seo.ts").match(/export function buildCategoryMetadata[\s\S]*?\n}\n/)[0], /path}\/opengraph-image/);
  assert.doesNotMatch(source("lib/seo.ts").match(/export function buildHomeMetadata[\s\S]*?\n}\n/)[0], /images/);
  assert.match(source("app/layout.tsx"), /card: "summary_large_image"/);
  assert.match(source("app/tiendas/[slug]/page.tsx"), /price_pen,\s*previous_price_pen,\s*price_dropped_at,/);
});
