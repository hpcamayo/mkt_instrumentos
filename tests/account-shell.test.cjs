const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
const path = require("node:path");

function load(source) {
  const filename = path.resolve(source);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  mod._compile(compiled, filename);
  return mod.exports;
}

const { getAccountNavigationItems, accountItemIsActive, getSellEntry } = load("lib/account-navigation.ts");

test("Particular account navigation exposes only implemented Particular destinations", () => {
  const items = getAccountNavigationItems("seller", false);
  assert.deepEqual(items.map((item) => item.label), ["Resumen", "Mis publicaciones", "Publicar", "Favoritos", "Alertas", "Notificaciones", "Compras y ventas", "Perfil y seguridad"]);
  assert.equal(items.some((item) => /tienda|inventario/i.test(item.label)), false);
  assert.equal(items.filter((item) => item.label === "Alertas").length, 1);
});

test("Store Owner navigation changes safely when an owner-bound store exists", () => {
  const withoutStore = getAccountNavigationItems("store_owner", false);
  assert.deepEqual(withoutStore.map((item) => item.label), ["Resumen", "Solicitud de tienda", "Favoritos", "Alertas", "Notificaciones", "Compras y ventas", "Perfil y seguridad"]);
  const withStore = getAccountNavigationItems("store_owner", true);
  assert.deepEqual(withStore.map((item) => item.label), ["Resumen", "Mi tienda", "Inventario", "Publicar", "Estadísticas", "Favoritos", "Alertas", "Notificaciones", "Compras y ventas", "Perfil y seguridad"]);
  assert.equal(withStore.some((item) => /publicaciones|instrumento/i.test(item.label)), false);
});

test("account navigation keeps a precise active section", () => {
  const items = getAccountNavigationItems("store_owner", true);
  assert.equal(accountItemIsActive("/mi-cuenta", items[0]), true);
  assert.equal(accountItemIsActive("/mi-cuenta/tienda", items[0]), false);
  assert.equal(accountItemIsActive("/mi-cuenta/tienda/inventario", items[2]), true);
  assert.equal(accountItemIsActive("/mi-cuenta/tienda/publicar", items[2]), false);
  const statistics = items.find((item) => item.icon === "analytics");
  assert.equal(accountItemIsActive("/mi-cuenta/tienda/estadisticas", statistics), true);
  assert.equal(accountItemIsActive("/mi-cuenta/tienda/inventario", statistics), false);
});

test("header never offers stale store registration and keeps each account's sell destination", () => {
  assert.deepEqual(getSellEntry({ authenticated: false, storeOwner: false, hasStore: false }), { href: "/vender", label: "Vender" });
  assert.deepEqual(getSellEntry({ authenticated: true, storeOwner: false, hasStore: false }), { href: "/mi-cuenta/publicar", label: "Vender" });
  assert.deepEqual(getSellEntry({ authenticated: true, storeOwner: true, hasStore: false }), { href: "/mi-cuenta/tienda", label: "Solicitud de tienda" });
  assert.deepEqual(getSellEntry({ authenticated: true, storeOwner: true, hasStore: true }), { href: "/mi-cuenta/tienda/publicar", label: "Publicar" });
  // UX-2: "Para tiendas" left the header for everyone (glossary D8); stores reach registration from the footer.
  const header = fs.readFileSync("components/site-header.tsx", "utf8");
  assert.doesNotMatch(header, /Para tiendas|registro\/tienda|registrar-tienda|Crear cuenta/);
  assert.match(header, /getSellEntry\(account\)/);
});

test("account shell is protected and retains accessible mobile navigation", () => {
  const layout = fs.readFileSync("app/mi-cuenta/layout.tsx", "utf8");
  const navigation = fs.readFileSync("components/account-navigation.tsx", "utf8");
  assert.match(layout, /getAccountContext\(\)/);
  // UX-2: the phone switcher is a disclosure button whose list stays in the markup while closed.
  assert.match(navigation, /aria-expanded=\{switcher\.open\}/);
  assert.match(navigation, /hidden=\{!switcher\.open\}/);
  assert.match(navigation, /Menú de cuenta móvil/);
  assert.match(navigation, /aria-current=\{active \? "page"/);
  assert.match(navigation, /<AccountLogout \/>/);
  assert.match(fs.readFileSync("components/logout-button.tsx", "utf8"), /<form action="\/logout" method="post">/);
});

test("submission success and validation feedback receive focus and scroll into view", () => {
  const notice = fs.readFileSync("components/page-notice.tsx", "utf8");
  assert.match(notice, /focus\(\{ preventScroll: true \}\)/);
  assert.match(notice, /scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
  assert.match(notice, /role=\{kind === "error" \? "alert" : "status"\}/);
  for (const file of ["components/store-registration-form.tsx", "components/sell-listing-form.tsx", "components/listing-edit-form.tsx", "components/profile-edit-form.tsx", "components/password-form.tsx", "components/listing-management-table.tsx"]) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /PageNotice/);
  }
  for (const file of ["components/admin-workbench.tsx", "components/admin-domain-view.tsx", "components/content-report.tsx"]) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /scrollIntoView\(\{ behavior: "smooth"/);
    assert.match(source, /\.focus\(\)/);
  }
  assert.match(fs.readFileSync("components/store-registration-form.tsx", "utf8"), /Volver al resumen/);
  assert.match(fs.readFileSync("components/sell-listing-form.tsx", "utf8"), /Ver mis publicaciones/);
});

test("both account roles expose the real in-app notification center and unread badge", () => {
  const layout = fs.readFileSync("app/mi-cuenta/layout.tsx", "utf8");
  const navigation = fs.readFileSync("components/account-navigation.tsx", "utf8");
  const page = fs.readFileSync("app/mi-cuenta/notificaciones/page.tsx", "utf8");
  assert.match(layout, /from\("notifications"\)/);
  assert.match(layout, /\.is\("read_at", null\)/);
  assert.match(navigation, /unreadNotifications/);
  assert.match(page, /order\("created_at", \{ ascending: false \}\)/);
});

test("signup email documentation preserves callback and distinguishes account metadata", () => {
  const docs = fs.readFileSync("docs/auth-email-templates.md", "utf8");
  assert.match(docs, /if eq \.Data\.account_type "store_owner"/);
  assert.match(docs, /else if eq \.Data\.account_type "seller"/);
  assert.match(docs, /\.RedirectTo.*token_hash=.*\.TokenHash.*type=email/);
  const storeSignup = fs.readFileSync("components/store-owner-signup-form.tsx", "utf8");
  const sellerSignup = fs.readFileSync("components/seller-signup-form.tsx", "utf8");
  assert.match(storeSignup, /account_type: STORE_OWNER_ACCOUNT_TYPE/);
  assert.match(sellerSignup, /account_type: INDIVIDUAL_SELLER_ACCOUNT_TYPE/);
});

test("legacy account entry routes redirect into the shared shell", () => {
  assert.match(fs.readFileSync("app/vender/page.tsx", "utf8"), /redirect\("\/mi-cuenta\/publicar"\)/);
  assert.match(fs.readFileSync("app/registrar-tienda/page.tsx", "utf8"), /redirect\("\/mi-cuenta\/tienda"\)/);
});
