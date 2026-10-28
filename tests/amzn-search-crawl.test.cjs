const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const { NextRequest } = require("next/server");
const { blocksFilteredCatalogCrawler, FILTERED_CATALOG_CRAWLER } = require("@/lib/catalog-crawlers");
const { catalogFilterKeys, catalogIndexing } = require("@/lib/catalog-indexing");
const { searchParamsRecord } = require("@/lib/catalog-request");
const { buildCatalogMetadata } = require("@/lib/seo");

const agent = "Mozilla/5.0 (compatible; Amzn-SearchBot/0.1; +https://example.test/bot)";
const blocked = (path, ua = agent) => {
  const url = new URL(path, "https://laria.audio");
  return blocksFilteredCatalogCrawler(url.pathname, ua, url.searchParams);
};
const clean = [
  "/listados", "/listados/", "/listados?page=2", "/listados?category=guitars&page=2",
  "/listados?category=microphones", "/listados?utm_source=brand%3DFender&_rsc=abc&unknown=value",
  "/listados?brand=&q=+&min_price=&page=2", "/listados?brand=&brand=+&category=guitars",
];
const filtered = [
  "/listados?brand=Fender", "/listados?category=guitars&brand=Fender&page=2",
  "/listados/?sort=price_asc", "/listados?sort=newest", "/listados?q=les+paul",
  "/listados?location=Lima&location=Cusco", "/listados?min_price=100&max_price=5000",
  "/listados?category=microphones&microphone_type=dynamic&use_case=voice&use_case=instrument",
  "/listados?page=2&brand=&brand=Shure", "/listados?%62rand=Fender", "/listados?condition=Nuevo",
];

test("the Amzn-SearchBot decision matches actual catalog SEO, including repeated and empty values", () => {
  for (const path of [...clean, ...filtered]) {
    const url = new URL(path, "https://laria.audio");
    const record = searchParamsRecord(url.searchParams);
    const metadata = buildCatalogMetadata(record, 2);
    const noindex = metadata.robots?.index === false;
    assert.equal(catalogIndexing(record).filtered, noindex, path);
    assert.equal(blocked(path), noindex, path);
    assert.equal(noindex, filtered.includes(path), path);
  }
  for (const key of catalogFilterKeys) {
    if (key === "category") continue;
    assert.equal(catalogIndexing({ [key]: ["", "value"] }).filtered, true, key);
    assert.equal(catalogIndexing({ [key]: ["", " "] }).filtered, false, key);
  }
});

test("only the exact search-crawler token is restricted, and only on catalog data paths", () => {
  for (const ua of [agent, FILTERED_CATALOG_CRAWLER, "amzn-searchbot/1.0"]) {
    for (const path of filtered) assert.equal(blocked(path, ua), true, path);
    for (const path of clean) assert.equal(blocked(path, ua), false, path);
    for (const path of ["/", "/instrumentos/guitarras?brand=Fender", "/instrumentos/producto", "/tiendas", "/tiendas/tienda?brand=Fender", "/sitemap.xml", "/robots.txt", "/listados-nuevos?brand=Fender", "/api/catalogue?brand=Fender"]) assert.equal(blocked(path, ua), false, path);
    for (const path of ["/api/catalog?brand=Fender", "/api/catalog/page?brand=Fender&page=2", "/api/catalog/facets?condition=Nuevo", "/api/catalog/suggest?q=sh"]) assert.equal(blocked(path, ua), true, path);
    for (const path of ["/api/catalog/page?page=2", "/api/catalog/facets?category=guitars"]) assert.equal(blocked(path, ua), false, path);
  }
  for (const ua of ["", "Mozilla/5.0", "Amzn-User/1.0", "Amazonbot/0.1", "Googlebot/2.1", "bingbot/2.0", "facebookexternalhit/1.1", "WhatsApp/2.0", "OAI-SearchBot/1.0", "ChatGPT-User/1.0", "NotAmzn-SearchBot/1.0", "Amzn-SearchBotPreview/1.0"]) {
    assert.equal(blocked("/listados?brand=Fender", ua), false, ua);
  }
});

test("middleware cleans malformed URLs first and blocks filtered crawler GET/HEAD before sessions", async () => {
  let clients = 0;
  const original = Module._load;
  Module._load = function (name, ...args) {
    if (name === "@supabase/ssr") return { createServerClient() { clients++; throw new Error("public guard initialized a session"); } };
    return original.call(this, name, ...args);
  };
  let routing;
  try { routing = require("../middleware.ts"); } finally { Module._load = original; }
  const env = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  const request = (path, ua = agent, method = "GET") => new NextRequest(new URL(path, "https://laria.audio"), { method, headers: { "user-agent": ua } });
  try {
    for (const method of ["GET", "HEAD"]) {
      for (const path of [...filtered, "/api/catalog/page?brand=Fender&page=2", "/api/catalog/facets?brand=Fender", "/api/catalog/suggest?q=sh"]) {
        const response = await routing.middleware(request(path, agent, method));
        assert.equal(response.status, 403, path);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        assert.equal(response.headers.get("vary"), "User-Agent");
        assert.equal((await response.text()).length, method === "HEAD" ? 0 : 20);
      }
    }
    for (const path of clean) assert.equal((await routing.middleware(request(path))).headers.get("x-middleware-next"), "1", path);
    for (const ua of ["Mozilla/5.0", "Amzn-User/1.0", "Googlebot/2.1", "bingbot/2.0", "facebookexternalhit/1.1", "OAI-SearchBot/1.0"]) {
      const response = await routing.middleware(request("/listados?brand=Fender&sort=price_asc&page=2", ua));
      assert.equal(response.headers.get("x-middleware-next"), "1", ua);
      assert.equal(response.headers.get("x-robots-tag"), null);
      assert.equal(response.cookies.getAll().length, 0);
    }
    const repair = await routing.middleware(request("/listados?category=microphones&condition=Nuevo%C2%B5phone_type%3Ddynamic&page=2"));
    assert.equal(repair.status, 308);
    const destination = new URL(repair.headers.get("location"));
    assert.equal(destination.pathname + destination.search, "/listados?category=microphones&page=2");
    assert.equal((await routing.middleware(request(destination.pathname + destination.search))).headers.get("x-middleware-next"), "1");
    assert.equal(clients, 0);
  } finally {
    for (const [key, value] of [["NEXT_PUBLIC_SUPABASE_URL", env.url], ["NEXT_PUBLIC_SUPABASE_ANON_KEY", env.key]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("the dedicated robots group preserves private routes, canonical discovery and query boundaries", () => {
  const robots = require("@/app/robots").default;
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  try {
    const result = robots();
    const general = result.rules.find((rule) => rule.userAgent === "*");
    const rule = result.rules.find((rule) => rule.userAgent === FILTERED_CATALOG_CRAWLER);
    assert.ok(rule);
    for (const path of general.disallow) assert.ok(rule.disallow.includes(path), path);
    const matches = (pattern, path) => new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")).test(path);
    const disallowed = (path) => rule.disallow.some((pattern) => matches(pattern, path));
    for (const path of ["/listados", "/listados/", "/listados?page=2", "/listados?category=guitars&page=2", "/listados?utm_source=brand%3DFender&_rsc=abc", "/instrumentos/guitarras", "/instrumentos/producto", "/tiendas/tienda", "/sitemap.xml", "/robots.txt"]) assert.equal(disallowed(path), false, path);
    for (const path of ["/listados?brand=Fender", "/listados/?brand=Fender", "/listados?page=2&condition=Nuevo", "/listados/?category=guitars&min_price=100", "/api/catalog/page?page=2", "/mi-cuenta/perfil"]) assert.equal(disallowed(path), true, path);
    assert.equal(general.disallow.some((pattern) => matches(pattern, "/listados?brand=Fender")), false);
    assert.equal(result.rules.some((rule) => rule.userAgent === "Amzn-User"), false);
    process.env.VERCEL_ENV = "preview";
    assert.deepEqual(robots().rules, { userAgent: "*", disallow: "/" });
  } finally { if (previous === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous; }
});
