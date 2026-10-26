// Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md), reach-01 "Importar desde Mercado Libre".
// Unit checks for the configuration (off without credentials), token encryption and the OAuth state, the mapping into
// an ordinary import file (read back by the import's own parser), the API calls with a stand-in fetch (no real
// Mercado Libre call), and the routes' guards. The database rules are in tests/store-reach-mercadolibre.sql.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const load = Module._load;
Module._load = function stubServerOnly(request, ...rest) {
  if (request === "server-only") return {};
  return load.call(this, request, ...rest);
};

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const { mercadoLibreConfig, tokenKey } = require("@/lib/mercadolibre/config");
const { decryptToken, encryptToken, pkceChallenge, readState, signState } = require("@/lib/mercadolibre/crypto");
const { mlCategoryLabel, mlImportCsv, mlImportPhotos, mlImportSummary, mlItemRows, mlPricePen, parseMlSummaryItem } = require("@/lib/mercadolibre/mapping");
const { exchangeCode, fetchItems, fetchPhoto, MercadoLibreError } = require("@/lib/mercadolibre/api");
const { readSpreadsheet } = require("@/lib/store-import/sheet");
const { proposeMapping } = require("@/lib/store-import/mapping");
const { parseImportRow } = require("@/lib/store-import/rows");

const KEY_HEX = "0f".repeat(32);
const ENV = { MERCADOLIBRE_CLIENT_ID: "1234567890", MERCADOLIBRE_CLIENT_SECRET: "secreto", MERCADOLIBRE_TOKEN_KEY: KEY_HEX };

test("reach-01: off without every credential, and the key must be 32 bytes", () => {
  assert.equal(mercadoLibreConfig({}), null);
  assert.equal(mercadoLibreConfig({ ...ENV, MERCADOLIBRE_CLIENT_SECRET: "" }), null);
  assert.equal(mercadoLibreConfig({ ...ENV, MERCADOLIBRE_TOKEN_KEY: "corta" }), null);
  assert.equal(mercadoLibreConfig({ ...ENV, MERCADOLIBRE_CLIENT_ID: "abc" }), null);
  const config = mercadoLibreConfig({ ...ENV, MERCADOLIBRE_REDIRECT_URI: "https://laria.audio/api/store/mercado-libre/callback" });
  assert.equal(config.key.length, 32);
  assert.equal(config.redirectUri, "https://laria.audio/api/store/mercado-libre/callback");
  assert.equal(tokenKey(Buffer.alloc(32, 7).toString("base64")).length, 32);
  assert.equal(tokenKey(Buffer.alloc(16, 7).toString("base64")), null);
});

test("reach-01: tokens are sealed to their store, and the OAuth state is signed and short-lived", () => {
  const key = tokenKey(KEY_HEX);
  const sealed = encryptToken(key, "store-a", "APP_USR-123");
  assert.match(sealed, /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.notEqual(encryptToken(key, "store-a", "APP_USR-123"), sealed, "a fresh IV each time");
  assert.equal(decryptToken(key, "store-a", sealed), "APP_USR-123");
  assert.equal(decryptToken(key, "store-b", sealed), null, "not on another store's row");
  assert.equal(decryptToken(tokenKey("1f".repeat(32)), "store-a", sealed), null, "not with another key");
  // Flip one bit of a decoded byte (changing a base64 character can touch only padding bits).
  const flip = (text) => {
    const bytes = Buffer.from(text, "base64url");
    bytes[0] ^= 1;
    return bytes.toString("base64url");
  };
  const parts = sealed.split(".");
  assert.equal(decryptToken(key, "store-a", [parts[0], parts[1], parts[2], flip(parts[3])].join(".")), null, "tampered body");
  assert.equal(decryptToken(key, "store-a", [parts[0], parts[1], flip(parts[2]), parts[3]].join(".")), null, "tampered tag");

  const state = { state: "abc", verifier: "v".repeat(64), uid: "u1", exp: Date.now() + 60_000 };
  const cookie = signState(key, state);
  assert.deepEqual(readState(key, cookie), state);
  assert.equal(readState(key, cookie, state.exp + 1), null, "expired");
  const [payload, signature] = cookie.split(".");
  assert.equal(readState(key, `${payload}.${flip(signature)}`), null, "bad signature");
  assert.equal(readState(key, `${flip(payload)}.${signature}`), null, "changed payload");
  assert.equal(readState(key, undefined), null);
  // RFC 7636 appendix B.
  assert.equal(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

const PICS = [
  { id: "P1", secure_url: "https://http2.mlstatic.com/D_NQ_NP_1-O.jpg" },
  { id: "P2", url: "http://http2.mlstatic.com/D_NQ_NP_2-O.webp" },
  { id: "P3", secure_url: "https://evil.example.com/x.jpg" },
];
const ITEM = {
  id: "MPE612345678", title: "  Teclado   Yamaha PSR-E373  ", price: 1299.9, currency_id: "PEN", available_quantity: 4, condition: "new",
  pictures: PICS, attributes: [{ id: "BRAND", value_name: "Yamaha" }, { id: "MODEL", value_name: "PSR-E373" }, { id: "SELLER_SKU", value_name: "PSR-E373" }],
  category_id: "MPE1234",
};

test("reach-01: a publication becomes an import row, leaving empty what Mercado Libre does not say", () => {
  const [row] = mlItemRows(ITEM, "Teclado de 61 teclas sensibles, con fuente y atril, nuevo en caja.", "Teclados y pianos");
  assert.equal(row.sku, "PSR-E373");
  assert.equal(row.name, "Teclado Yamaha PSR-E373");
  assert.equal(row.price, 1300, "whole soles");
  assert.equal(row.condition, "Nuevo");
  assert.deepEqual(row.photos, ["https://http2.mlstatic.com/D_NQ_NP_1-O.jpg", "https://http2.mlstatic.com/D_NQ_NP_2-O.webp"], "only Mercado Libre's hosts, over https");
  assert.deepEqual(row.notes, []);

  const [used] = mlItemRows({ ...ITEM, condition: "used", currency_id: "USD" }, "", "");
  assert.equal(used.condition, "", "Laria's scale is finer than 'usado': the store picks");
  assert.equal(used.price, null, "a dollar price is not converted");
  assert.deepEqual(used.notes, ["price_not_pen", "condition_used", "category_unknown"]);
  assert.equal(mlPricePen(10, "USD"), null);
  assert.equal(mlPricePen(0, "PEN"), null);

  const taken = new Set();
  const variations = mlItemRows({ ...ITEM, id: "MPE700000001", variations: [
    { id: 17001, price: 900, available_quantity: 2, picture_ids: ["P2"], attribute_combinations: [{ name: "Color", value_name: "Negro" }], seller_custom_field: "PSR-E373" },
    { id: 17002, price: 950, available_quantity: 0, picture_ids: [], attribute_combinations: [{ name: "Color", value_name: "Blanco" }] },
  ] }, "", "Teclados y pianos", taken);
  assert.deepEqual(variations.map((item) => [item.sku, item.variant, item.price, item.quantity, item.photos.length]), [
    ["PSR-E373", "Color: Negro", 900, 2, 1],
    ["MPE700000001-17002", "Color: Blanco", 950, 0, 2],
  ]);
  const [again] = mlItemRows(ITEM, "", "", taken);
  assert.equal(again.sku, "MPE612345678", "a repeated SKU falls back to the Mercado Libre code");
  assert.deepEqual(mlItemRows({ ...ITEM, id: "../etc" }, "", ""), []);
});

test("reach-01: the category is read from Mercado Libre's path, and only when it is clear", () => {
  assert.equal(mlCategoryLabel(["Instrumentos Musicales", "Guitarras y Bajos", "Bajos"]), "Bajos");
  assert.equal(mlCategoryLabel(["Instrumentos Musicales", "Guitarras y Bajos", "Guitarras Eléctricas"]), "Guitarras");
  assert.equal(mlCategoryLabel(["Instrumentos Musicales", "Pedales y Accesorios", "Pedales de Efecto"]), "Pedales");
  assert.equal(mlCategoryLabel(["Instrumentos Musicales", "Accesorios para Instrumentos", "Cuerdas"]), "", "strings for a guitar are not an instrument");
  assert.equal(mlCategoryLabel(["Instrumentos Musicales", "Instrumentos de Viento", "Quenas"]), "Andinos y tradicionales");
  assert.equal(mlCategoryLabel(["Instrumentos Musicales", "Baterías y Percusión", "Cajones"]), "Percusión");
  assert.equal(mlCategoryLabel(["Hogar", "Muebles"]), "");
  assert.equal(mlCategoryLabel([]), "");
});

test("reach-01: the file reads back through the import's own parser with every column mapped", () => {
  const rows = mlItemRows(ITEM, "Teclado de 61 teclas sensibles, con fuente y atril, nuevo en caja.", "Teclados y pianos");
  const csv = mlImportCsv(rows);
  const sheet = readSpreadsheet(new Uint8Array(Buffer.from(csv, "utf8")), "csv");
  const mapping = proposeMapping(sheet.headers);
  for (const field of ["sku", "product_name", "brand", "model", "category", "variant_label", "unit_price_pen", "quantity", "condition", "description", "external_reference"]) {
    assert.equal(typeof mapping[field], "number", `${field} is mapped`);
  }
  const { parsed, issues } = parseImportRow(sheet.rows[0].cells, mapping);
  assert.equal(parsed.sku, "PSR-E373");
  assert.equal(parsed.category, "keyboards");
  assert.equal(parsed.unit_price_pen, 1300);
  assert.equal(parsed.quantity, 4);
  assert.equal(parsed.condition, "Nuevo");
  assert.deepEqual(issues.filter((issue) => issue.severity === "error"), []);
  assert.deepEqual(mlImportPhotos(rows), [
    { sku: "PSR-E373", order: 1, url: "https://http2.mlstatic.com/D_NQ_NP_1-O.jpg" },
    { sku: "PSR-E373", order: 2, url: "https://http2.mlstatic.com/D_NQ_NP_2-O.webp" },
  ]);
  assert.deepEqual(mlImportSummary(rows), { rows: 1, photos: 2, withoutPrice: 0, withoutCondition: 0, withoutCategory: 0 });
});

function stubFetch(routes) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    for (const [pattern, reply] of routes) {
      if (pattern.test(String(url))) return typeof reply === "function" ? reply(String(url), init) : reply;
    }
    return new Response("{}", { status: 404 });
  };
  return { fetcher, calls };
}

test("reach-01: the code is exchanged with the PKCE verifier, and only the account's own publications are read", async () => {
  const config = mercadoLibreConfig(ENV);
  const { fetcher, calls } = stubFetch([[/oauth\/token$/, () => Response.json({ access_token: "APP_USR-1", refresh_token: "TG-1", expires_in: 21600, user_id: 99, scope: "offline_access read" })]]);
  const tokens = await exchangeCode(config, "TG-code", "verifier-123", fetcher);
  assert.equal(tokens.userId, 99);
  const form = new URLSearchParams(calls[0].init.body);
  assert.equal(form.get("grant_type"), "authorization_code");
  assert.equal(form.get("code_verifier"), "verifier-123");
  assert.equal(form.get("redirect_uri"), config.redirectUri);
  assert.equal(calls[0].init.redirect, "error");

  const bad = stubFetch([[/oauth\/token$/, () => new Response("{}", { status: 400 })]]);
  await assert.rejects(exchangeCode(config, "x", "y", bad.fetcher), (error) => error instanceof MercadoLibreError && error.code === "MERCADOLIBRE_TOKEN_INVALID");

  const items = stubFetch([[/\/items\?ids=/, () => Response.json([
    { code: 200, body: { ...ITEM, seller_id: 99 } },
    { code: 200, body: { ...ITEM, id: "MPE999999999", seller_id: 7 } },
    { code: 404, body: { message: "not found" } },
  ])]]);
  const own = await fetchItems("APP_USR-1", ["MPE612345678", "MPE999999999", "MPE111111111", "bad id"], 99, items.fetcher);
  assert.deepEqual(own.map((item) => item.id), ["MPE612345678"]);
  assert.match(items.calls[0].url, /ids=MPE612345678,MPE999999999,MPE111111111&/);
  assert.equal(items.calls[0].init.headers.Authorization, "Bearer APP_USR-1");
  assert.equal(parseMlSummaryItem({ ...ITEM, permalink: "https://articulo.mercadolibre.com.pe/MPE-612345678-teclado" }).permalink,
    "https://articulo.mercadolibre.com.pe/MPE-612345678-teclado");
  assert.equal(parseMlSummaryItem({ ...ITEM, permalink: "https://evil.example.com/" }).permalink, null);
});

test("reach-01: photos come only from Mercado Libre's hosts, never past 5 MB, never through a redirect", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const ok = stubFetch([[/mlstatic/, () => new Response(jpeg)]]);
  assert.deepEqual(await fetchPhoto("https://http2.mlstatic.com/D_1-O.jpg", 5 * 1024 * 1024, ok.fetcher), jpeg);
  assert.equal(ok.calls[0].init.redirect, "error");
  assert.equal(await fetchPhoto("https://169.254.169.254/latest/meta-data", 100, ok.fetcher), null);
  assert.equal(await fetchPhoto("http://http2.mlstatic.com/D_1-O.jpg", 100, ok.fetcher), null);
  assert.equal(ok.calls.length, 1, "no request for a refused URL");
  const big = stubFetch([[/mlstatic/, () => new Response(new Uint8Array(200))]]);
  assert.equal(await fetchPhoto("https://http2.mlstatic.com/D_2-O.jpg", 100, big.fetcher), null);
  const failing = stubFetch([[/mlstatic/, () => { throw new TypeError("redirect"); }]]);
  assert.equal(await fetchPhoto("https://http2.mlstatic.com/D_3-O.jpg", 100, failing.fetcher), null);
});

test("reach-01: the routes fail closed and check the owner, the origin and the state", () => {
  const helpers = read("lib/mercadolibre/routes.ts");
  assert.match(helpers, /if \(write && !sameOriginEventRequest\(request\)\) return \{ response: mlJson\(\{ ok: false, message: "Solicitud inválida\." \}, 403\) \};/);
  assert.match(helpers, /if \(!config\) return \{ response: mlJson\(\{ ok: false, code: "MERCADOLIBRE_OFF"/);
  const connect = read("app/api/store/mercado-libre/connect/route.ts");
  assert.match(connect, /url\.searchParams\.set\("code_challenge_method", "S256"\);/);
  assert.match(connect, /httpOnly: true, sameSite: "lax"/);
  const callback = read("app/api/store/mercado-libre/callback/route.ts");
  assert.match(callback, /if \(!saved \|\| saved\.uid !== auth\.userId \|\| !state \|\| !sameSecret\(saved\.state, state\)/);
  assert.match(callback, /exchangeCode\(auth\.config, code, saved\.verifier\)/);
  for (const file of ["app/api/store/mercado-libre/import/route.ts", "app/api/store/mercado-libre/photos/route.ts"]) {
    assert.match(read(file), /const auth = await mlOwner\(request, true\);/, file);
  }
  assert.match(read("app/api/store/mercado-libre/disconnect/route.ts"), /if \(!sameOriginEventRequest\(request\)\)/);
  // The import's photo step offers the copy; nothing is copied until the store presses the button.
  assert.match(read("components/store-import/import-photos.tsx"), /<MercadoLibrePhotos sessionId=\{sessionId\} onCopied=\{load\} \/>/);
  assert.doesNotMatch(read("components/store-reach/mercadolibre-picker.tsx"), /defaultChecked|checked=\{true\}/);
});
