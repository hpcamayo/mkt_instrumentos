// Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md), reach-02 "Catálogo para redes". Unit checks
// for the feed XML and its routes; the database rules are in tests/store-reach-feeds.sql.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

process.env.NEXT_PUBLIC_SITE_URL = "https://laria.audio";
const {
  escapeXml, feedCondition, feedPrice, feedPhotoUrl, feedProductType, feedItemXml, feedHead, feedStream, FEED_TAIL,
  FEED_PAGE_SIZE, parseFeedItems, validFeedSlug,
} = require("@/lib/store-feed");
const { parseFeedSettings, googleShoppingActive } = require("@/lib/store-feed-settings");

const ITEM = {
  id: "e7410000-0000-4000-8000-000000000101",
  slug: "fender-stratocaster-player",
  title: "Fender Stratocaster Player <2022> & estuche",
  description: "Con estuche\u0007 original.\n\nPoco uso.",
  brand: "Fender",
  model: "Player",
  condition: "Usado - buen estado",
  price_pen: "3250",
  out_of_stock: false,
  category: "guitars",
  instrument_type: "electric_guitar",
  seller_key: "tienda-guitarras-lima",
  photos: ["https://cdn.example/1.jpg", "/fotos/2.jpg", "javascript:alert(1)"],
};

test("reach-02: values are escaped and mapped the way Meta and Google read them", () => {
  assert.equal(escapeXml(`a<b>&"c'\u0000`), "a&lt;b&gt;&amp;&quot;c&apos;");
  assert.equal(feedCondition("Nuevo"), "new");
  assert.equal(feedCondition("Usado - con detalles"), "used");
  assert.equal(feedCondition("Reacondicionado"), "refurbished");
  assert.equal(feedCondition(null), "used");
  assert.equal(feedPrice("3250"), "3250.00 PEN");
  assert.equal(feedPrice(1299.5), "1299.50 PEN");
  assert.equal(feedPhotoUrl("http://insecure.example/x.jpg"), null);
  assert.equal(feedPhotoUrl("/fotos/2.jpg"), "https://laria.audio/fotos/2.jpg");
  assert.equal(feedProductType(ITEM), "Guitarras > Guitarras eléctricas");
});

test("reach-02: an item links back to Laria and carries price, stock and photos", () => {
  const meta = feedItemXml(ITEM, "meta");
  assert.match(meta, /<g:link>https:\/\/laria\.audio\/instrumentos\/fender-stratocaster-player<\/g:link>/);
  assert.match(meta, /<g:title>Fender Stratocaster Player &lt;2022&gt; &amp; estuche<\/g:title>/);
  assert.match(meta, /<g:description>Con estuche original\. Poco uso\.<\/g:description>/);
  assert.match(meta, /<g:image_link>https:\/\/cdn\.example\/1\.jpg<\/g:image_link><g:additional_image_link>https:\/\/laria\.audio\/fotos\/2\.jpg<\/g:additional_image_link><g:availability>/);
  assert.doesNotMatch(meta, /javascript/);
  assert.match(meta, /<g:availability>in stock<\/g:availability>/);
  assert.match(meta, /<g:price>3250\.00 PEN<\/g:price><g:condition>used<\/g:condition><g:brand>Fender<\/g:brand>/);
  assert.doesNotMatch(meta, /external_seller_id/);

  const google = feedItemXml({ ...ITEM, out_of_stock: true }, "google");
  assert.match(google, /<g:availability>out_of_stock<\/g:availability>/);
  assert.match(google, /<g:external_seller_id>tienda-guitarras-lima<\/g:external_seller_id>/);
  assert.match(google, /<g:identifier_exists>no<\/g:identifier_exists>/);

  assert.equal(feedItemXml({ ...ITEM, photos: [] }, "meta"), "", "no photo, no item");
  assert.equal(feedItemXml({ ...ITEM, price_pen: 0 }, "meta"), "", "no price, no item");
  assert.equal(feedItemXml({ ...ITEM, brand: null }, "meta").includes("<g:brand>"), false);
  assert.equal(feedItemXml({ ...ITEM, title: "x".repeat(400) }, "meta").match(/<g:title>([^<]*)<\/g:title>/)[1].length, 150);
});

test("reach-02: the feed streams page by page and fails closed", async () => {
  const pages = [];
  const page = (n, start) => Array.from({ length: n }, (_, index) => ({ ...ITEM, id: `id-${String(start + index).padStart(5, "0")}` }));
  const stream = await feedStream(feedHead({ title: "Tienda & Co", link: "https://laria.audio/tiendas/x", description: "d" }), "meta", async (after) => {
    pages.push(after);
    return after === null ? page(FEED_PAGE_SIZE, 0) : page(2, FEED_PAGE_SIZE);
  });
  const xml = await new Response(stream).text();
  assert.deepEqual(pages, [null, `id-${String(FEED_PAGE_SIZE - 1).padStart(5, "0")}`]);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>Tienda &amp; Co</title>'));
  assert.ok(xml.endsWith(FEED_TAIL));
  assert.equal((xml.match(/<item>/g) ?? []).length, FEED_PAGE_SIZE + 2);

  assert.equal(await feedStream("<rss>", "meta", async () => null), null, "a failed first page is a 503");
  const broken = await feedStream("<rss>", "meta", async (after) => (after === null ? page(FEED_PAGE_SIZE, 0) : null));
  await assert.rejects(new Response(broken).text(), "a later failure aborts the stream, so the platform keeps its last copy");
});

test("reach-02: rows and settings parse strictly", () => {
  assert.equal(parseFeedItems([ITEM, { id: 1 }, null]).length, 1);
  assert.deepEqual(parseFeedItems("x"), []);
  assert.equal(validFeedSlug("guitarras-lima"), true);
  assert.equal(validFeedSlug("../admin"), false);
  assert.equal(validFeedSlug("Mayus"), false);
  assert.deepEqual(parseFeedSettings({ enabled: true, enabled_at: "2026-10-26T00:00:00Z", store_active: true, items: 3, out_of_stock: 1, without_photo: -1 }), {
    enabled: true, enabledAt: "2026-10-26T00:00:00Z", storeActive: true, items: 3, outOfStock: 1, withoutPhoto: 0, withoutPrice: 0, withoutBrand: 0,
  });
  assert.equal(parseFeedSettings({}), null);
  delete process.env.LARIA_GOOGLE_SHOPPING_ACTIVE;
  assert.equal(googleShoppingActive(), false);
});

test("reach-02: feeds are public, cached, crawlable and never served by previews", () => {
  for (const file of ["app/api/feeds/tiendas/[slug]/route.ts", "app/api/feeds/laria/route.ts"]) {
    const route = read(file);
    assert.match(route, /isIndexableDeployment\(\)/, file);
    assert.match(route, /getPublicSupabaseClient\(\)/, file);
    assert.doesNotMatch(route, /AdminClient|service_role/, file);
    assert.match(route, /"Cache-Control": FEED_CACHE_CONTROL/, file);
  }
  assert.match(read("app/robots.ts"), /allow: \["\/", "\/api\/feeds\/"\]/);
  const toggle = read("app/api/store/feeds/route.ts");
  assert.match(toggle, /if \(!sameOriginEventRequest\(request\)\) return failure\("Solicitud inválida\.", 403\);/);
  assert.match(read("supabase/migrations/20261205130000_feat_store_reach_feeds.sql"), /enabled\s+boolean not null default false/);
});
