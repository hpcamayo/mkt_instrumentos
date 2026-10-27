const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const { NextRequest } = require("next/server");
const { unstable_doesMiddlewareMatch } = require("next/experimental/testing/server");
const { blocksCatalogCrawler, LIMITED_CATALOG_CRAWLERS } = require("@/lib/catalog-crawlers");
const { parseCatalogRequest, catalogFilterParams, searchParamsRecord } = require("@/lib/catalog-request");
const { parseListingFilters } = require("@/lib/listings");

let clients = 0;
const original = Module._load;
Module._load = function (name, ...args) {
  if (name === "@supabase/ssr") return { createServerClient() { clients += 1; return { auth: { getClaims: async () => ({ data: null }) } }; } };
  return original.call(this, name, ...args);
};
let routing;
try { routing = require("../middleware.ts"); }
finally { Module._load = original; }
const request = (path, userAgent = "Mozilla/5.0", method = "GET") => new NextRequest(`https://laria.audio${path}`, { method, headers: { "user-agent": userAgent } });

test("catalog guard targets only the selected bulk crawlers and catalog data paths", () => {
  for (const agent of LIMITED_CATALOG_CRAWLERS) {
    for (const ua of [agent, `${agent.toLowerCase()}/1.0`, `Mozilla/5.0 (compatible; ${agent}/1.0; +https://example.test/bot)`]) {
      for (const path of ["/listados", "/listados/", "/api/catalog/page", "/api/catalog/facets", "/api/catalog/suggest"]) assert.equal(blocksCatalogCrawler(path, ua), true, `${path} ${ua}`);
      for (const path of ["/", "/instrumentos/guitarras", "/instrumentos/producto", "/tiendas/tienda", "/sitemap.xml", "/robots.txt", "/listados-nuevos"]) assert.equal(blocksCatalogCrawler(path, ua), false, path);
    }
  }
  for (const ua of ["", "Mozilla/5.0", "Googlebot/2.1", "bingbot/2.0", "facebookexternalhit/1.1", "WhatsApp/2.0", "OAI-SearchBot/1.0", "ChatGPT-User/1.0", "PerplexityBot/1.0", "NotAmazonbot/1.0", "AmazonbotPreview/1.0"]) assert.equal(blocksCatalogCrawler("/listados", ua), false, ua);
});

test("middleware matching preserves clean discovery paths and existing account protection", () => {
  for (const path of ["/listados", "/listados/", "/api/catalog/page", "/mi-cuenta/perfil", "/admin/listados", "/login", "/vender"]) assert.equal(unstable_doesMiddlewareMatch({ config: routing.config, nextConfig: {}, url: `https://laria.audio${path}` }), true, path);
  for (const path of ["/", "/instrumentos/guitarras", "/instrumentos/producto", "/tiendas/tienda", "/sitemap.xml", "/robots.txt", "/_next/static/chunk.js"]) assert.equal(unstable_doesMiddlewareMatch({ config: routing.config, nextConfig: {}, url: `https://laria.audio${path}` }), false, path);
});

test("public catalog guards never create session clients, and blocked responses cannot be shared with visitors", async () => {
  const previous = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  try {
    clients = 0;
    for (const agent of LIMITED_CATALOG_CRAWLERS) {
      for (const method of ["GET", "HEAD"]) {
        const response = await routing.middleware(request("/listados?category=guitars&page=2", `${agent}/1.0`, method));
        assert.equal(response.status, 403);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        assert.equal(response.headers.get("vary"), "User-Agent");
        assert.equal((await response.text()).length, method === "HEAD" ? 0 : 20);
      }
    }
    for (const agent of ["Mozilla/5.0", "Googlebot/2.1", "bingbot/2.0", "facebookexternalhit/1.1", "WhatsApp/2.0", "OAI-SearchBot/1.0"]) {
      const response = await routing.middleware(request("/listados?category=guitars&page=2", agent));
      assert.equal(response.headers.get("x-middleware-next"), "1");
      assert.equal(response.headers.get("x-robots-tag"), null);
    }
    const tracked = request("/listados?utm_source=newsletter&%C2%B5phone_type=dynamic");
    assert.equal((await routing.middleware(tracked)).headers.get("x-middleware-next"), "1");
    assert.equal(tracked.nextUrl.searchParams.get("utm_source"), "newsletter", "incoming attribution is not stripped");
    for (const params of ["condition=Nuevo%C2%B5phone_type%3Ddynamic", `brand=${"x".repeat(100)}`]) {
      const response = await routing.middleware(request(`/listados?category=microphones&${params}&condition=Usado+-+buen+estado&location=Lima&location=Cusco&page=2`, "Googlebot/2.1"));
      assert.equal(response.status, 308);
      const target = new URL(response.headers.get("location"));
      assert.equal(target.searchParams.get("category"), "microphones");
      assert.deepEqual(target.searchParams.getAll("location"), ["Lima", "Cusco"]);
      assert.equal(target.searchParams.get("page"), "2");
      assert.equal(parseCatalogRequest(searchParamsRecord(target.searchParams)).redirectHref, null, "no redirect loop");
    }
    assert.equal(clients, 0, "public checks and redirects bypass session/database initialization");
    assert.equal((await routing.middleware(request("/vender?from=catalog"))).status, 307);
    assert.equal(clients, 1, "existing protected routes still check the session");
  } finally {
    for (const [key, value] of [["NEXT_PUBLIC_SUPABASE_URL", previous.url], ["NEXT_PUBLIC_SUPABASE_ANON_KEY", previous.key]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("search and navigation serialization discard unknown keys while retaining supported repeated filters", () => {
  const { keptSearchFields } = require("@/components/global-search");
  const input = new URLSearchParams("category=microphones&condition=Nuevo&condition=Usado+-+buen+estado&location=Lima&location=Cusco&brand=Shure&microphone_type=dynamic&use_case=voice&use_case=instrument&sort=price_asc&q=les+paul+%3D+barata&page=3&utm_source=email&%C2%B5phone_type=dynamic&_rsc=abc");
  const filters = parseListingFilters(searchParamsRecord(input));
  const navigation = new URLSearchParams();
  for (const [name, values] of Object.entries(catalogFilterParams(filters))) for (const value of [].concat(values)) navigation.append(name, value);
  const kept = new URLSearchParams(keptSearchFields("/listados", input));
  for (const params of [navigation, kept]) {
    for (const key of ["utm_source", "µphone_type", "_rsc", "page"]) assert.equal(params.has(key), false, key);
    // sell-10 (feature ideas): the old condition is serialized as its part of the new scale.
    assert.deepEqual(params.getAll("condition"), ["Nuevo", "Exhibición o caja abierta", "Como nuevo", "Excelente", "Muy bueno"]);
    assert.deepEqual(params.getAll("location"), ["Lima", "Cusco"]);
    assert.deepEqual(params.getAll("use_case"), ["voice", "instrument"]);
    assert.equal(params.get("sort"), "price_asc");
  }
  assert.equal(navigation.get("q"), "les paul = barata");
  assert.equal(kept.has("q"), false, "a new search replaces the old text");
});

test("crawl hints distinguish infinite refinements from clean discovery and pagination", () => {
  const { catalogRefinementRel } = require("@/lib/catalog-links");
  for (const href of ["/", "/listados", "/listados?page=2", "/instrumentos/guitarras", "/instrumentos/guitarras?page=2", "/instrumentos/producto", "/tiendas/tienda"]) assert.equal(catalogRefinementRel(href), undefined, href);
  for (const href of ["/listados?max_price=350", "/listados?category=guitars&brand=Fender", "/listados?category=guitars&instrument_type=electric_guitar&page=2"]) assert.equal(catalogRefinementRel(href), "nofollow", href);
});
