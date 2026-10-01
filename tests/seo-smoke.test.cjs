// Regression coverage for tests/seo-rendered-metadata-smoke.cjs (no network: fake fetch).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const smoke = require("./seo-rendered-metadata-smoke.cjs");
const { runSeoSmoke, classifyPath, validateSitemapXml, readSitemap, robotsDirectives, readPageMetadata, parseRobots, parseRobotsTxt, robotsAllows, canonicalHttpUrl } = smoke;

const base = "https://candidate.example";
const site = "https://laria.audio";
const NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
const category = "/instrumentos/guitarras";
const listing = "/instrumentos/fender-strat-0b6f4a1e-6a3d-4c43-9d49-1d3f64f9c2aa";
const store = "/tiendas/tienda-qa";
const representative = ["/", "/listados", category, listing, store];

const urlEntry = (path) => `<url><loc>${site}${path}</loc><lastmod>2026-09-27</lastmod></url>`;
const sitemap = (paths = representative, extra = "") => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${NS}">${paths.map(urlEntry).join("")}${extra}</urlset>`;
// Next.js renders the root URL without a trailing slash.
const canonicalFor = (requestPath) => (requestPath === "/" ? site : `${site}${requestPath}`);
const page = (url, { canonical = url, ogUrl = url, ogTitle = "Título | Laria", robots = null, jsonLd = [] } = {}) => [
  '<!DOCTYPE html><html lang="es"><head><meta charSet="utf-8"/><title>Título | Laria</title>',
  robots === null ? "" : `<meta name="robots" content="${robots}"/>`,
  canonical === null ? "" : `<link rel="canonical" href="${canonical}"/>`,
  ogTitle === null ? "" : `<meta property="og:title" content="${ogTitle}"/>`,
  ogUrl === null ? "" : `<meta property="og:url" content="${ogUrl}"/>`,
  '<script>self.__next_f.push([1,"<link rel=\\"canonical\\" href=\\"https://laria.audio/x\\">"])</script>',
  "</head><body><main>Contenido</main>",
  ...jsonLd.map((data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`),
  "</body></html>",
].join("");

// Realistic JSON-LD and data-dependent surfaces, mirroring lib/seo.ts and components/category-landing.tsx.
const ld = (type, fields) => ({ "@context": "https://schema.org", "@type": type, ...fields });
const soldListing = "/instrumentos/bajo-vendido-5d1c7c1a-2f0e-4c1f-8a55-6a0f6cbb3a10";
const adminCookie = "sb-access-token=admin-session";
const coverageOptions = { soldListing, adminCookie };
const breadcrumb = (url) => ld("BreadcrumbList", { itemListElement: [
  { "@type": "ListItem", position: 1, name: "Inicio", item: `${site}/` },
  { "@type": "ListItem", position: 2, name: "Instrumentos", item: `${site}/listados` },
  { "@type": "ListItem", position: 3, name: "Categoría", item: url },
] });
const itemList = (urls) => ld("ItemList", { name: "Lista", numberOfItems: urls.length, itemListElement: urls.map((url, index) => ({ "@type": "ListItem", position: index + 1, url, name: "Item" })) });
const product = (url, availability = "https://schema.org/InStock", extra = {}) => ld("Product", { name: "Fender Strat", url, offers: { "@type": "Offer", url, price: 1500, priceCurrency: "PEN", availability, ...extra } });
const CATEGORY_VALUES = Object.fromEntries(smoke.CATEGORY_LANDINGS.map((landing) => [landing.category, landing.slug]));
const SLUGS = new Set(smoke.CATEGORY_LANDINGS.map((landing) => landing.slug));

// The page a correct deployment serves for requestPath. `populated` lists the category slugs with public inventory.
function defaultPage(requestPath, populated) {
  const url = new URL(requestPath, site);
  const self = canonicalFor(requestPath);
  if (url.pathname === "/") return page(self, { jsonLd: [ld("Organization", { name: "Laria", url: `${site}/`, logo: `${site}/icon.svg` })] });
  if (url.pathname === "/listados" && url.search) {
    const params = [...url.searchParams.keys()];
    if (params.length === 1 && params[0] === "category" && CATEGORY_VALUES[url.searchParams.get("category")]) {
      const landing = `${site}/instrumentos/${CATEGORY_VALUES[url.searchParams.get("category")]}`;
      return page(landing);
    }
    if (params.length === 1 && params[0] === "page") return page(self);
    return page(self, { canonical: null, robots: "noindex, follow" });
  }
  const slug = url.pathname.startsWith("/instrumentos/") ? url.pathname.slice(14) : null;
  if (slug && SLUGS.has(slug)) {
    return populated.includes(slug)
      ? page(self, { jsonLd: [breadcrumb(self), itemList([`${site}${listing}`])] })
      : page(self, { robots: "noindex, follow", jsonLd: [breadcrumb(self)] });
  }
  if (url.pathname === soldListing) return page(self, { robots: "noindex, follow", jsonLd: [product(self, "https://schema.org/SoldOut")] });
  if (slug) return page(self, { jsonLd: [product(self)] });
  if (url.pathname.startsWith("/tiendas/")) return page(self, { jsonLd: [ld("Store", { name: "Tienda QA", url: `${site}${url.pathname}`, address: { "@type": "PostalAddress", addressLocality: "Lima", addressCountry: "PE" } })] });
  return page(self);
}
const adminPage = (records = 1) => `<!DOCTYPE html><html><head><meta name="robots" content="noindex, nofollow"/></head><body>${
  Array.from({ length: records }, (_, index) => `<article><a href="/admin/auditoria/tienda/${index}?volver=%2Fadmin%2Ftiendas">Ver auditoría</a></article>`).join("")}</body></html>`;
const robotsTxt = [
  "User-Agent: *", "Allow: /", "Disallow: /mi-cuenta", "Disallow: /admin", "Disallow: /api/", "Disallow: /login", "Disallow: /logout",
  "Disallow: /vender", "Disallow: /registro/vendedor", "Disallow: /registro/tienda", "", `Sitemap: ${site}/sitemap.xml`, "",
].join("\n");
const noindexPage = (meta = '<meta name="robots" content="noindex, nofollow"/>') => `<!DOCTYPE html><html><head>${meta}</head><body></body></html>`;

function fakeFetch({ sitemapStatus = 200, sitemapBody, sitemapType = "application/xml", robots = robotsTxt, robotsStatus = 200, pages = {}, headers = {}, pageHeaders = {}, populated = ["guitarras"], statuses = {}, locations = {} } = {}) {
  const requested = [];
  const impl = async (url, init = {}) => {
    const ua = init.headers?.["User-Agent"] ?? "";
    const pick = (value) => (typeof value === "function" ? value(ua) : value);
    const { pathname, search } = new URL(url);
    const requestPath = `${pathname}${search}`;
    requested.push(requestPath);
    if (pathname === "/sitemap.xml") return new Response(sitemapStatus === 200 ? sitemapBody ?? sitemap() : "error", { status: sitemapStatus, headers: { "Content-Type": sitemapType } });
    if (pathname === "/robots.txt") return new Response(robots, { status: robotsStatus, headers: { "Content-Type": "text/plain" } });
    if (["/registro/vendedor", "/registro/tienda", "/login"].includes(pathname)) {
      const headerValue = Object.hasOwn(headers, pathname) ? headers[pathname] : "noindex, nofollow";
      return new Response(pick(pages[pathname]) ?? noindexPage(), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", ...(headerValue === null ? {} : { "X-Robots-Tag": headerValue }) } });
    }
    if (pathname.startsWith("/admin/")) {
      const signedIn = init.headers?.Cookie === adminCookie;
      if (!signedIn) return new Response("", { status: 307, headers: { Location: "/login?next=%2Fadmin" } });
      return new Response(pick(pages[requestPath]) ?? adminPage(), { status: statuses[requestPath] ?? 200, headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow", ...(pick(pageHeaders[requestPath]) ?? {}) } });
    }
    const status = statuses[requestPath] ?? 200;
    return new Response(pick(pages[requestPath]) ?? defaultPage(requestPath, populated), { status, headers: { "Content-Type": "text/html; charset=utf-8", ...(status >= 300 && status < 400 ? { Location: locations[requestPath] ?? "/listados" } : {}), ...(pick(pageHeaders[requestPath]) ?? {}) } });
  };
  return { impl, requested };
}

// A renderer stand-in: by default no browser is available, so tests never launch Chromium.
const unavailableRenderer = { render: async () => { throw new smoke.RenderUnavailable("test: no browser"); }, close: async () => {} };
// Single-crawler runs keep one failure per defect; the default run covers both crawlers.
const run = (options, crawlers = ["googlebot"], renderer = unavailableRenderer, extra = {}) => runSeoSmoke({ base, site, crawlers, renderer, ...coverageOptions, fetchImpl: fakeFetch(options).impl, log: () => {}, ...extra });

async function failsWith(options, pattern, count = 1) {
  await assert.rejects(run(options), (error) => {
    assert.ok(error instanceof smoke.SmokeFailure, error.message);
    assert.match(error.message, pattern);
    if (count !== null) assert.equal(error.failures.length, count, error.message);
    return true;
  });
}

// -- Passing runs ----------------------------------------------------------

test("valid representative sitemap passes; full sample URLs (including query) are requested and verified", async () => {
  const withQuery = sitemap(["/", category, listing, "/tiendas/tienda-qa?pagina=1"]);
  const fetch = fakeFetch({ sitemapBody: withQuery });
  const result = await runSeoSmoke({ base, site, renderer: unavailableRenderer, ...coverageOptions, fetchImpl: fetch.impl, log: () => {} });
  assert.equal(result.samples.category.href, `${site}${category}`);
  assert.equal(result.samples.listing.href, `${site}${listing}`);
  assert.equal(result.samples.store.href, `${site}/tiendas/tienda-qa?pagina=1`);
  for (const path of [category, listing, "/tiendas/tienda-qa?pagina=1", "/", "/listados", "/registro/vendedor", "/registro/tienda", "/login"]) assert.ok(fetch.requested.includes(path), path);
  // robots.txt + (9 indexable + 3 noindex) for googlebot and bingbot, then the required coverage (first crawler):
  // page 2 + 8 category aliases + filtered catalog + 1 populated and 7 empty categories + sold listing
  // + home/listing/store JSON-LD + 2 Admin record pages.
  assert.equal(result.passed.length, 25 + 24);
  for (const [surface, state] of Object.entries(result.coverage)) assert.equal(state.status, "verified", surface);
  for (const path of ["/listados?page=2", "/listados?category=audio+interfaces", "/listados?category=guitars&sort=price_asc", "/instrumentos/platillos", soldListing, "/admin/tiendas", "/admin/publicaciones"]) assert.ok(fetch.requested.includes(path), path);
});

test("valid XML variants are parsed into real elements: CDATA, spaced tags, numeric references, prefixes and extensions", async () => {
  const body = `${String.fromCharCode(0xfeff)}<?xml version='1.0' encoding='UTF-8' standalone='yes'?>
<!-- generated -->
<?xml-stylesheet href="s.xsl"?>
<sm:urlset xmlns:sm="${NS}" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <sm:url><sm:loc><![CDATA[${site}/instrumentos/fender-strat-0b6f4a1e-6a3d-4c43-9d49-1d3f64f9c2aa]]></sm:loc></sm:url>
  <sm:url ><sm:loc
    >${site}/instrumentos/guitarr&#97;s</sm:loc ><image:image><image:loc>https://cdn.example/x.jpg</image:loc></image:image></sm:url>
  <sm:url><sm:loc>${site}/tiendas/tienda-&#x71;a</sm:loc><sm:priority>0.6</sm:priority></sm:url>
</sm:urlset>
`;
  assert.equal(validateSitemapXml(body, site), null);
  const fetch = fakeFetch({ sitemapBody: body });
  const result = await runSeoSmoke({ base, site, renderer: unavailableRenderer, ...coverageOptions, fetchImpl: fetch.impl, log: () => {} });
  assert.equal(result.samples.category.pathname, "/instrumentos/guitarras");
  assert.equal(result.samples.store.pathname, "/tiendas/tienda-qa");
  assert.ok(fetch.requested.includes("/instrumentos/guitarras"));
  assert.ok(!fetch.requested.some((path) => path.includes("&#") || path.includes("&amp;")));
  assert.equal(validateSitemapXml(sitemap([]), site), null, "an empty urlset is well-formed; coverage handles it");
});

// -- Sitemap availability and coverage -------------------------------------

test("sitemap HTTP 500 fails and names every unverified required surface", async () => {
  await failsWith({ sitemapStatus: 500 }, /sitemap\.xml returned HTTP 500; required surfaces \(category, listing, store\) cannot be sampled/);
});

// With no category in the sitemap, the deployment's category landings are all empty (noindex).
for (const [surface, removed, options, count] of [
  ["category", category, { populated: [] }, 2],
  ["listing", listing, {}, 2],
  ["store", store, {}, 1],
]) {
  test(`missing ${surface} sample fails with an explicit incomplete-coverage error`, async () => {
    await failsWith({ sitemapBody: sitemap(representative.filter((path) => path !== removed)), ...options }, new RegExp(`INCOMPLETE COVERAGE: sitemap\\.xml has no ${surface} sample`), count);
  });
}

test("a category listing inventory that is not in the sitemap is reported", async () => {
  // The listing is missing from the sitemap, yet the populated category page's ItemList still lists it.
  await failsWith({ sitemapBody: sitemap(representative.filter((path) => path !== listing)) }, /populated category \/instrumentos\/guitarras: ItemList lists https:\/\/laria\.audio\/instrumentos\/fender-strat-[^,]+, which is not in sitemap\.xml/, 2);
});

test("an empty sitemap fails for all three required surfaces and for populated-category coverage", async () => {
  await failsWith({ sitemapBody: sitemap([]), populated: [] }, /has no category, listing, store sample[\s\S]*no populated category landing in sitemap\.xml/, 2);
});

for (const [name, extra] of [
  ["comment", `<!-- <url><loc>${site}${store}</loc></url> -->`],
  ["processing instruction", `<?note <url><loc>${site}${store}</loc></url> ?>`],
  ["CDATA inside an extension element", `<url><loc>${site}/terminos</loc><e:x xmlns:e="urn:e"><![CDATA[<url><loc>${site}${store}</loc></url>]]></e:x></url>`],
]) {
  test(`fake <url>/<loc> inside a ${name} never supplies a sample`, async () => {
    await failsWith({ sitemapBody: sitemap(representative.filter((path) => path !== store), extra) }, /INCOMPLETE COVERAGE: sitemap\.xml has no store sample/);
  });
}

// -- Sitemap well-formedness, structure and URLs ---------------------------

test("a truncated sitemap without </urlset> fails even though all samples are present", async () => {
  const truncated = sitemap().replace(/<\/urlset>$/, "");
  assert.ok(truncated.includes(`${site}${store}`));
  await failsWith({ sitemapBody: truncated }, /sitemap\.xml is malformed \(truncated document: <urlset> is never closed/);
});

test("malformed or non-conforming sitemap documents are rejected with a specific reason", () => {
  const valid = sitemap();
  const nul = String.fromCharCode(0);
  const cases = [
    [valid.slice(0, -20), /never closed|never finished|malformed closing tag/],
    [`${valid}<urlset xmlns="${NS}"></urlset>`, /more than one root element/],
    [`${valid}trailing`, /content after the root element/],
    [valid.replace("<urlset", "<!-- a -- b --><urlset"), /invalid comment/],
    [valid.replace("<urlset", "<!-- ends with dash ---><urlset"), /invalid comment/],
    [valid.replace('<?xml version="1.0" encoding="UTF-8"?>', '<?xml version="2.0"?>'), /invalid XML declaration/],
    [valid.replace('<?xml version="1.0" encoding="UTF-8"?>', '<?xml encoding="UTF-8"?>'), /invalid XML declaration/],
    [valid.replace('<?xml version="1.0" encoding="UTF-8"?>\n', '\n<?xml version="1.0"?>'), /XML declaration is only allowed at the start/],
    [valid.replace("guitarras", "guitarras&#0;"), /character reference &#0; is a forbidden character/],
    [valid.replace("guitarras", `guitarras${nul}`), /forbidden character U\+0000/],
    [valid.replace("guitarras", "guitarras&nbsp;"), /undefined entity &nbsp;/],
    [valid.replace("guitarras", "guitarras & co"), /invalid or unterminated entity reference/],
    [valid.replace("guitarras", "guitarras]]>"), /']]>' is not allowed/],
    [valid.replace(/<url><loc>/, "<url><loc>x</url><loc>"), /mismatched closing tag/],
    [valid.replace(`<urlset xmlns="${NS}">`, `<urlset data-source="${NS}">`), /root element is \{\}urlset/],
    [valid.replace(`<urlset xmlns="${NS}">`, `<urlset xmlns="http://example.com/${NS}">`), /root element is \{http:\/\/example\.com/],
    [valid.replace(`<urlset xmlns="${NS}">`, `<urlset xmlns="${NS}" xmlns="${NS}">`), /duplicate attribute "xmlns" on <urlset>/],
    [valid.replace("<url>", '<url a:x="1" b:x="2" xmlns:a="urn:same" xmlns:b="urn:same">'), /duplicate attribute \{urn:same\}x/],
    [valid.replace("<url>", '<url id="a" id="b">'), /duplicate attribute "id" on <url>/],
    [valid.replace("<url>", '<url note="a & b">'), /invalid or unterminated entity reference/],
    [valid.replace("<url>", "<p:url>").replace("</url>", "</p:url>"), /unbound namespace prefix "p"/],
    [valid.replace("<url>", '<url xmlns="urn:other">'), /unexpected element \{urn:other\}url inside <urlset>/],
    [valid.replace(`<loc>${site}/</loc>`, `<o:loc xmlns:o="urn:o">${site}/</o:loc>`), /exactly one \{http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9\}loc \(found 0\)/],
    [valid.replace("<url>", "stray text<url>"), /text content directly inside <urlset>/],
    [valid.replace("<url><loc>", "<url>stray<loc>"), /text content directly inside <url>/],
    [valid.replace("<lastmod>", "<title>x</title><lastmod>"), /unexpected element \{http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9\}title inside <url>/],
    [valid.replace(`<loc>${site}/</loc>`, `<loc>${site}/</loc><loc>${site}/x</loc>`), /exactly one .*loc \(found 2\)/],
    [valid.replace(`<loc>${site}/</loc>`, `<loc><b>${site}/</b></loc>`), /<loc> must contain only text/],
    [valid.replace("<urlset", '<!DOCTYPE urlset><urlset'), /DOCTYPE is not allowed/],
    [valid.replace("<urlset", "<![CDATA[x]]><urlset"), /expected the root element/],
    ["", /no root element/],
  ];
  for (const [xml, reason] of cases) assert.match(validateSitemapXml(xml, site) ?? "VALID", reason, xml.slice(0, 160));
});

test("every <loc> must be an absolute http(s) URL on the canonical origin, without a fragment", async () => {
  const valid = sitemap();
  const cases = [
    [valid.replace(`${site}${store}`, `mailto:${store}`), /must be an http\(s\) URL: mailto:\/tiendas\/tienda-qa/],
    [valid.replace(`${site}${store}`, `https://wrong.example${store}`), /origin https:\/\/wrong\.example is not the canonical site origin https:\/\/laria\.audio/],
    [valid.replace(`${site}${store}`, `http://laria.audio${store}`), /origin http:\/\/laria\.audio is not the canonical site origin/],
    [valid.replace(`${site}${store}`, "tiendas/relativa"), /not an absolute URL/],
    [valid.replace(`${site}${store}`, `${site}${store}#top`), /must not contain a fragment/],
  ];
  for (const [xml, reason] of cases) assert.match(validateSitemapXml(xml, site) ?? "VALID", reason);
  await failsWith({ sitemapBody: cases[0][0] }, /sitemap\.xml is malformed \(<loc> must be an http\(s\) URL: mailto:/);
  await failsWith({ sitemapBody: cases[1][0] }, /sitemap\.xml is malformed \(<loc> origin https:\/\/wrong\.example/);
  assert.equal(readSitemap(valid, site).length, 5);
});

test("samples are chosen by URL shape, not by fixed IDs", () => {
  assert.equal(classifyPath("/instrumentos/interfaces-de-audio"), "category");
  assert.equal(classifyPath(listing), "listing");
  assert.equal(classifyPath("/instrumentos/fender-strat-0b6f4a1e-6a3d-4c43-9d49-1d3f64f9c2aa-republicado-0b6f4a1e"), "listing");
  assert.equal(classifyPath("/tiendas/otra-tienda"), "store");
  assert.equal(classifyPath("/terminos"), null);
});

// -- Rendered page metadata -------------------------------------------------

test("metadata inside comments or <script> is not counted as a real element", async () => {
  const commented = `<html><head><!-- <link rel="canonical" href="${site}/listados"/><meta property="og:url" content="${site}/listados"/> --><meta property="og:title" content="T"/></head></html>`;
  await failsWith({ pages: { "/listados": commented } }, /\/listados: expected exactly one <link rel="canonical"> in the initial HTML <head>, found 0/);
  const scripted = `<html><head><script>document.write('<link rel="canonical" href="${site}/listados"><meta property="og:url" content="${site}/listados">')</script><meta property="og:title" content="T"/></head></html>`;
  await failsWith({ pages: { "/listados": scripted } }, /\/listados: expected exactly one <link rel="canonical"> in the initial HTML <head>, found 0/);
  const metadata = readPageMetadata(page(`${site}/terminos`));
  assert.deepEqual(metadata.canonical, [`${site}/terminos`], "the <script> payload in the fixture is ignored");
});

test("every page must point canonical and og:url at its own expected URL, not at the homepage", async () => {
  const pages = {};
  for (const path of ["/listados", "/terminos", "/privacidad", "/articulos-prohibidos", "/consejos-de-seguridad", category, listing, store]) pages[path] = page(site);
  await assert.rejects(run({ pages }), (error) => {
    // 16 canonical/og:url failures, plus the category, listing and store JSON-LD the stub pages lack.
    assert.equal(error.failures.length, 20, error.message);
    assert.match(error.message, /\/listados: canonical https:\/\/laria\.audio\/ is not the expected https:\/\/laria\.audio\/listados/);
    assert.match(error.message, /\/listados: og:url https:\/\/laria\.audio\/ is not the expected https:\/\/laria\.audio\/listados/);
    assert.match(error.message, /store https:\/\/laria\.audio\/tiendas\/tienda-qa: canonical https:\/\/laria\.audio\/ is not the expected/);
    return true;
  });
  await failsWith({ pages: { [category]: page(`${site}${category}`, { ogUrl: site, jsonLd: [breadcrumb(`${site}${category}`), itemList([`${site}${listing}`])] }) } }, /category https:\/\/laria\.audio\/instrumentos\/guitarras: og:url https:\/\/laria\.audio\/ is not the expected/);
});

test("missing, relative, duplicate or wrong canonical/og:url and missing og:title fail", async () => {
  const url = `${site}/terminos`;
  const cases = [
    [page(url, { ogUrl: null }), /\/terminos: expected exactly one <meta property="og:url"> in the initial HTML <head>, found 0/],
    [page(url, { ogUrl: "/terminos" }), /\/terminos: og:url is not an absolute http\(s\) URL in canonical form \(\/terminos\)/],
    [page(url, { canonical: null }), /\/terminos: expected exactly one <link rel="canonical"> in the initial HTML <head>, found 0/],
    [page(url, { canonical: "/terminos" }), /\/terminos: canonical is not an absolute http\(s\) URL in canonical form/],
    [page(url, { canonical: `${site}/privacidad` }), /\/terminos: canonical https:\/\/laria\.audio\/privacidad is not the expected https:\/\/laria\.audio\/terminos/],
    [page(url, { ogTitle: null }), /\/terminos: expected exactly one <meta property="og:title"> in the initial HTML <head>, found 0/],
    [page(url, { ogTitle: "" }), /\/terminos: og:title is empty/],
    [page(url).replace("</head>", `<link rel="canonical" href="${url}"/></head>`), /\/terminos: expected exactly one <link rel="canonical"> in the initial HTML <head>, found 2/],
  ];
  for (const [html, pattern] of cases) await failsWith({ pages: { "/terminos": html } }, pattern);
});

// -- Robots -----------------------------------------------------------------

test("X-Robots-Tag must carry real generic noindex and nofollow directives", async () => {
  await failsWith({ headers: { "/login": "xnoindexx" } }, /\/login: X-Robots-Tag "xnoindexx" has malformed directive\(s\): xnoindexx/);
  await failsWith({ headers: { "/login": null } }, /\/login: X-Robots-Tag header missing/);
  await failsWith({ headers: { "/login": "noindex" } }, /\/login: X-Robots-Tag "noindex" lacks the nofollow directive/);
  await failsWith({ headers: { "/login": "googlebot: noindex, nofollow" } }, /lacks the noindex and nofollow directive/);
  await failsWith({ headers: { "/registro/tienda": "noindex, nofollow, index" } }, /\/registro\/tienda: X-Robots-Tag .* conflicting directive\(s\): index/);
});

test("robots meta must be a real element with noindex and nofollow", async () => {
  await failsWith({ pages: { "/registro/vendedor": noindexPage('<!-- <meta name="robots" content="noindex, nofollow"/> -->') } }, /\/registro\/vendedor: <meta name="robots"> element missing from <head>/);
  await failsWith({ pages: { "/registro/vendedor": noindexPage("") } }, /\/registro\/vendedor: <meta name="robots"> element missing from <head>/);
  await failsWith({ pages: { "/registro/vendedor": noindexPage('<meta name="robots" content="xnoindexx"/>') } }, /<meta name="robots"> has malformed directive\(s\): xnoindexx/);
  await failsWith({ pages: { "/registro/vendedor": noindexPage('<meta name="robots" content="index, follow"/>') } }, /lacks the noindex and nofollow directive/);
  await failsWith({ pages: { "/registro/vendedor": noindexPage('<meta name="robots" content="noindex, nofollow"/><meta name="robots" content="index, follow"/>') } }, /conflicting directive\(s\): index, follow/);
});

test("robots directive parsing", () => {
  assert.deepEqual(robotsDirectives(["noindex, nofollow"]), ["noindex", "nofollow"]);
  assert.deepEqual(robotsDirectives(["NONE"]), ["none"]);
  assert.deepEqual(robotsDirectives(["max-snippet: 20, noindex"]), ["max-snippet", "noindex"]);
  assert.deepEqual(robotsDirectives(["googlebot: noindex, nofollow"]), []);
  assert.deepEqual(robotsDirectives(["xnoindexx"]), []);
  assert.deepEqual(parseRobots(["xnoindexx"], { allowAgents: true }).malformed, ["xnoindexx"]);
});

// -- Reported false passes (round 3) -----------------------------------------

test("malformed qualified names and namespace declarations fail the full smoke", async () => {
  const valid = sitemap();
  await failsWith({ sitemapBody: valid.replace(`<urlset xmlns="${NS}">`, `<urlset xmlns="${NS}" xmlns:a:b="urn:extension">`) }, /sitemap\.xml is malformed \(invalid qualified attribute name "xmlns:a:b"/);
  await failsWith({ sitemapBody: valid.replace(`<urlset xmlns="${NS}">`, `<urlset xmlns="${NS}" xmlns:p="urn:p" p:1name="x">`) }, /sitemap\.xml is malformed \(invalid qualified attribute name "p:1name"/);
  for (const [xml, reason] of [
    [valid.replace("<url>", "<a:b:c/><url>"), /invalid qualified element name "a:b:c"/],
    [valid.replace("<url>", '<x xmlns:xmlns="urn:x"/><url>'), /invalid|reserved namespace prefix/],
    [valid.replace("<url>", '<xmlns:x xmlns:x="urn:x"/><url>'), /reserved prefix "xmlns"/],
    [valid.replace("<url>", '<a :b="1"/><url>'), /invalid qualified attribute name ":b"/],
    [valid.replace("<urlset", "<?xml:x y?><urlset"), /invalid processing instruction target "xml:x"/],
    [valid.replace("<urlset", "<?a:b?><urlset"), /invalid processing instruction target "a:b"/],
    [valid.replace("<url>", "<é/><url>"), /non-ASCII or invalid XML name/],
    [valid.replace(`xmlns="${NS}"`, `xmlns="${NS}" xmlns:e="urn:with space"`), /contains whitespace/],
    [valid.replace('encoding="UTF-8"', 'encoding="ISO-8859-1"'), /invalid XML declaration/],
  ]) assert.match(validateSitemapXml(xml, site) ?? "VALID", reason, xml.slice(0, 140));
});

test("metadata inside <template> (including nested templates) is inert", async () => {
  const url = `${site}/terminos`;
  const inTemplate = `<html><head><template>${page(url).match(/<link[\s\S]*?og:url"[^>]*>/)[0]}</template></head><body></body></html>`;
  await failsWith({ pages: { "/terminos": inTemplate } }, /\/terminos: expected exactly one <link rel="canonical"> in the initial HTML <head>, found 0/);
  const nested = `<html><head><template><template></template><link rel="canonical" href="${url}"/><meta property="og:url" content="${url}"/><meta property="og:title" content="T"/></template></head></html>`;
  await failsWith({ pages: { "/terminos": nested } }, /found 0/);
  const robotsInTemplate = noindexPage('<template><meta name="robots" content="noindex, nofollow"/></template>');
  await failsWith({ pages: { "/login": robotsInTemplate } }, /\/login: <meta name="robots"> element missing from <head>/);
  const afterTemplate = `<html><head><template><template></template></template><link rel="canonical" href="${url}"/><meta property="og:url" content="${url}"/><meta property="og:title" content="T"/></head></html>`;
  assert.deepEqual(readPageMetadata(afterTemplate).canonical, [url], "elements after a closed template still count");
});

test("robots directives without a value must be whole tokens; value directives need valid values", async () => {
  await failsWith({ headers: { "/login": "none: garbage" } }, /\/login: X-Robots-Tag "none: garbage" has malformed directive\(s\): none: garbage/);
  await failsWith({ headers: { "/login": "noindex: garbage, nofollow: garbage" } }, /has malformed directive\(s\): noindex: garbage \| nofollow: garbage/);
  await failsWith({ headers: { "/login": "noindex nofollow" } }, /malformed directive\(s\): noindex nofollow/);
  await failsWith({ headers: { "/login": "noindex, nofollow, max-snippet: abc" } }, /malformed directive\(s\): max-snippet: abc/);
  await failsWith({ pages: { "/login": noindexPage('<meta name="robots" content="none: garbage"/>') } }, /<meta name="robots"> has malformed directive\(s\): none: garbage/);
  await failsWith({ pages: { "/login": noindexPage('<meta name="robots" content="googlebot: noindex, nofollow"/>') } }, /<meta name="robots"> has malformed directive/);
  assert.deepEqual(parseRobots(["noindex, nofollow, max-snippet: -1, max-image-preview: large, unavailable_after: 2030-01-01"], { allowAgents: false }), { generic: ["noindex", "nofollow", "max-snippet", "max-image-preview", "unavailable_after"], scoped: [], malformed: [] });
  assert.deepEqual(parseRobots(["googlebot: noindex, nofollow"], { allowAgents: true }), { generic: [], scoped: ["googlebot:noindex", "googlebot:nofollow"], malformed: [] });
});

// -- Audit findings -----------------------------------------------------------

test("only elements really in <head> count: head-closing markup, text and <body> placement", async () => {
  const url = `${site}/terminos`;
  const tags = `<link rel="canonical" href="${url}"/><meta property="og:url" content="${url}"/><meta property="og:title" content="T"/>`;
  for (const html of [
    `<html><head><div></div>${tags}</head></html>`,
    `<html><head>texto${tags}</head></html>`,
    `<html><head>&nbsp;${tags}</head></html>`,
    `<html><head></br>${tags}</head></html>`,
    `<html><head></head><noscript></noscript>${tags}</html>`,
    `<html><head></head><body>${tags}</body></html>`,
  ]) {
    await assert.rejects(run({ pages: { "/terminos": html } }, ["bingbot"]), /\[bingbot\] \/terminos: expected exactly one <link rel="canonical"> in the initial HTML <head>, found 0 \(1 found outside <head>/);
  }
  for (const html of [
    `<html><head></head>${tags}<body></body></html>`,
    `<html><head>&#32;${tags}</head></html>`,
    `${tags}<body></body>`,
    `<html><head><!-->${tags}</head></html>`,
    `<html><head><!--->${tags}</head></html>`,
    `<html><head><!-- a --!>${tags}</head></html>`,
    `<html><head><script><!--<script></script></script>${tags}</head></html>`,
  ]) assert.deepEqual(readPageMetadata(html).canonical, [url], html);
  assert.deepEqual(readPageMetadata(`<html><head><script><!--<script></script><link rel="canonical" href="${url}"></script></head></html>`).canonical, [], "double-escaped script data is still script");
});

const listadosUrl = `${site}/listados`;
const streamedListados = (ua) => (/Googlebot/.test(ua)
  ? `<html><head></head><body><main></main>${page(listadosUrl).match(/<link[\s\S]*?og:url"[^>]*>/)[0]}</body></html>`
  : page(listadosUrl));
const renderedHead = (overrides = {}) => ({ canonical: [listadosUrl], ogUrl: [listadosUrl], ogTitle: ["Instrumentos musicales en venta en Perú | Laria"], robots: ["index, follow"], ...overrides });
function fakeRenderer(result) {
  const calls = [];
  return { calls, close: async () => {}, render: async (url, userAgent) => { calls.push({ url, userAgent }); return typeof result === "function" ? result(url) : result; } };
}

test("HTML-limited crawlers require metadata in the initial <head>, even when Googlebot's rendered DOM is fine", async () => {
  const renderer = fakeRenderer(renderedHead());
  await assert.rejects(run({ pages: { "/listados": (ua) => (/bingbot/.test(ua) ? streamedListados("Googlebot") : page(listadosUrl)) } }, ["googlebot", "bingbot"], renderer), (error) => {
    assert.equal(error.failures.length, 1, error.message);
    assert.match(error.message, /\[bingbot\] \/listados: expected exactly one <link rel="canonical"> in the initial HTML <head>, found 0 \(1 found outside <head>, e\.g\. metadata streamed into <body>\)/);
    return true;
  });
  assert.equal(renderer.calls.length, 0, "Googlebot's page had metadata in <head>, so nothing was rendered");
});

test("Googlebot streamed metadata passes only when the rendered DOM <head> is verified", async () => {
  const renderer = fakeRenderer(renderedHead());
  await run({ pages: { "/listados": streamedListados } }, ["googlebot", "bingbot"], renderer);
  assert.deepEqual(renderer.calls, [{ url: `${base}/listados`, userAgent: smoke.CRAWLERS.googlebot }]);
  await failsWith({ pages: { "/listados": streamedListados } }, /\[googlebot\] \/listados: metadata is streamed outside the initial <head>; the rendered DOM must be verified but no browser is available \(test: no browser\)/);
  const failsRendered = (result, pattern) => assert.rejects(run({ pages: { "/listados": streamedListados } }, ["googlebot"], fakeRenderer(result)), pattern);
  await failsRendered(renderedHead({ canonical: [] }), /\[googlebot\] \/listados \(rendered DOM\): expected exactly one <link rel="canonical"> in the rendered <head>, found 0/);
  await failsRendered(renderedHead({ canonical: [listadosUrl, listadosUrl] }), /in the rendered <head>, found 2/);
  await failsRendered(renderedHead({ canonical: [site], ogUrl: [site] }), /\(rendered DOM\): canonical https:\/\/laria\.audio\/ is not the expected https:\/\/laria\.audio\/listados/);
  await failsRendered(renderedHead({ ogTitle: [""] }), /\(rendered DOM\): og:title is empty/);
  await failsRendered(renderedHead({ robots: ["noindex"] }), /\(rendered DOM\): robots meta blocks indexing of a public page \(noindex\)/);
  const broken = (ua) => streamedListados(ua).replace('property="og:url"', 'property="og:ur"');
  await assert.rejects(run({ pages: { "/listados": broken } }, ["googlebot"], fakeRenderer(renderedHead())), /\[googlebot\] \/listados: expected exactly one <link rel="canonical"> in the initial HTML <head>, found 0 \(1 found outside <head>/, "partly missing metadata is not rescued by rendering");
});

test("public pages must stay indexable: robots meta, crawler-specific meta, body meta and X-Robots-Tag", async () => {
  const url = `${site}/terminos`;
  const withMeta = (meta, where = "head") => where === "head" ? page(url).replace("</head>", `${meta}</head>`) : page(url).replace("</main>", `</main>${meta}`);
  await failsWith({ pages: { "/terminos": withMeta('<meta name="robots" content="noindex"/>') } }, /\/terminos: robots meta blocks indexing of a public page \(noindex\)/);
  await failsWith({ pages: { "/terminos": withMeta('<meta name="googlebot" content="none"/>') } }, /blocks indexing of a public page \(none\)/);
  await failsWith({ pages: { "/terminos": withMeta('<meta name="robots" content="noindex"/>', "body") } }, /blocks indexing/);
  await failsWith({ pageHeaders: { "/terminos": { "X-Robots-Tag": "noindex" } } }, /\/terminos: X-Robots-Tag "noindex" blocks indexing of a public page \(noindex\)/);
  await failsWith({ pageHeaders: { "/terminos": { "X-Robots-Tag": "googlebot: noindex" } } }, /blocks indexing of a public page \(googlebot:noindex\)/);
  await failsWith({ pageHeaders: { [category]: { "X-Robots-Tag": "all: x" } } }, /malformed directive/);
  await run({ pages: { "/terminos": withMeta('<meta name="robots" content="index, follow, max-image-preview:large"/>') } });
});

test("an HTTP Link canonical must agree with the page canonical", async () => {
  await failsWith({ pageHeaders: { "/terminos": { Link: `<${site}/privacidad>; rel="canonical"` } } }, /\/terminos: Link header canonical https:\/\/laria\.audio\/privacidad is not the expected https:\/\/laria\.audio\/terminos/);
  await run({ pageHeaders: { "/terminos": { Link: `<${site}/terminos>; rel=canonical, </x.css>; rel=preload` } } });
});

test("canonical, og:url and <loc> URLs must already be in canonical form", async () => {
  for (const raw of ["https:laria.audio/terminos", "https://LARIA.audio/terminos", "https://laria.audio:443/terminos", "https://laria.audio/x/../terminos", "https:\\\\laria.audio\\terminos", " https://laria.audio/terminos", "HTTPS://laria.audio/terminos"]) {
    assert.equal(canonicalHttpUrl(raw), null, raw);
    await failsWith({ pages: { "/terminos": page(`${site}/terminos`, { canonical: raw }) } }, /\/terminos: canonical is not an absolute http\(s\) URL in canonical form/);
  }
  assert.equal(canonicalHttpUrl("https://laria.audio"), "https://laria.audio/");
  for (const raw of ["https:laria.audio/tiendas/tienda-qa", "https://LARIA.audio/tiendas/tienda-qa", "https://laria.audio/x/../tiendas/tienda-qa"]) {
    assert.match(validateSitemapXml(sitemap().replace(`${site}${store}`, raw), site) ?? "VALID", /not written in canonical URL form/, raw);
  }
  const og = page(`${site}/terminos`).replace('property="og:url"', 'property="OG:URL"');
  await failsWith({ pages: { "/terminos": og } }, /expected exactly one <meta property="og:url"> in the initial HTML <head>, found 0/);
});

test("wrong content types or charsets fail", async () => {
  await failsWith({ sitemapType: "text/html" }, /sitemap\.xml Content-Type is "text\/html", expected application\/xml; required surfaces/);
  await failsWith({ pageHeaders: { "/terminos": { "Content-Type": "application/json" } } }, /\/terminos: Content-Type is "application\/json", expected text\/html/);
  await failsWith({ pageHeaders: { "/terminos": { "Content-Type": "text/html; charset=iso-8859-1" } } }, /\/terminos: Content-Type is "text\/html; charset=iso-8859-1"/);
});

test("robots.txt must allow public URLs, block noindex pages, declare the sitemap and contain only valid lines", async () => {
  const withRobots = (text) => ({ robots: text });
  await failsWith(withRobots(robotsTxt.replace("Allow: /", "Disallow: /")), /robots\.txt blocks public URL\(s\) for \*: \/, \/listados/, null);
  await failsWith(withRobots(robotsTxt.replace(`Sitemap: ${site}/sitemap.xml`, "")), /robots\.txt does not declare Sitemap: https:\/\/laria\.audio\/sitemap\.xml/);
  await failsWith(withRobots(robotsTxt.replace("Disallow: /login\n", "")), /robots\.txt allows noindex page\(s\) for \*: \/login/, null);
  await failsWith(withRobots(robotsTxt.replace("Allow: /", "Dissallow: /")), /robots\.txt has an unrecognized or invalid line: Dissallow: \//);
  await failsWith(withRobots(`${robotsTxt}\nUser-agent: Googlebot\nDisallow: /listados\n`), /robots\.txt blocks public URL\(s\) for googlebot: \/listados/, null);
  await failsWith(withRobots(`${robotsTxt}\nUser-agent: *\nDisallow: /*guitarras$\n`), /robots\.txt blocks public URL\(s\) for \*: \/instrumentos\/guitarras/, null);
  await failsWith(withRobots(`Disallow: /x\n${robotsTxt}`), /rule before any User-agent/);
  await failsWith({ robotsStatus: 500 }, /robots\.txt returned HTTP 500/);
  const parsed = parseRobotsTxt(`${String.fromCharCode(0xfeff)}User-agent: *\nDisallow: /a\nAllow: /a/b$\n`);
  assert.equal(robotsAllows(parsed, "*", "/a/b"), true);
  assert.equal(robotsAllows(parsed, "*", "/a/bc"), false);
  assert.equal(robotsAllows(parsed, "googlebot", "/a"), false, "falls back to the * group");
});

test("sitemap URL entries: duplicates, invalid optional fields and noindex pages fail", async () => {
  const valid = sitemap();
  for (const [xml, reason] of [
    [sitemap([...representative, store]), /duplicate <loc> https:\/\/laria\.audio\/tiendas\/tienda-qa/],
    [valid.replace("<lastmod>2026-09-27</lastmod>", "<lastmod>ayer</lastmod>"), /invalid <lastmod> value "ayer"/],
    [valid.replace("<lastmod>2026-09-27</lastmod>", "<lastmod>2026-13-45</lastmod>"), /invalid <lastmod>/],
    [valid.replace("<lastmod>2026-09-27</lastmod>", "<lastmod>2026-09-27</lastmod><lastmod>2026-09-28</lastmod>"), /<lastmod> appears more than once/],
    [valid.replace("<lastmod>2026-09-27</lastmod>", "<changefreq>sometimes</changefreq>"), /invalid <changefreq>/],
    [valid.replace("<lastmod>2026-09-27</lastmod>", "<priority>1.5</priority>"), /invalid <priority>/],
    [valid.replace("<lastmod>2026-09-27</lastmod>", "<lastmod><b>x</b></lastmod>"), /<lastmod> must contain only text/],
  ]) assert.match(validateSitemapXml(xml, site) ?? "VALID", reason);
  assert.equal(validateSitemapXml(valid.replace("<lastmod>2026-09-27</lastmod>", "<lastmod>2026-09-10T00:00:00.000Z</lastmod><changefreq>daily</changefreq><priority>0.8</priority>"), site), null);
  await failsWith({ sitemapBody: sitemap([...representative, "/login"]) }, /sitemap\.xml lists noindex page\(s\): https:\/\/laria\.audio\/login/, null);
});

test("crawler selection is validated", async () => {
  await assert.rejects(run({}, ["yahoo"]), /Crawlers must be a non-empty subset of googlebot, bingbot/);
  await assert.rejects(run({}, []), /Crawlers must be a non-empty subset/);
});

// -- Round 4 findings ----------------------------------------------------------

test("robots.txt rules match UTF-8 percent-encoded URLs and trailing wildcards add no specificity", async () => {
  const storeN = "/tiendas/tienda-%C3%B1";
  const withStore = sitemap(["/", category, listing, storeN]);
  const fetchWith = (robots) => ({ sitemapBody: withStore, robots });
  await failsWith(fetchWith(`${robotsTxt}\nUser-agent: *\nDisallow: /tiendas/tienda-ñ\n`), /robots\.txt blocks public URL\(s\) for \*: \/tiendas\/tienda-%C3%B1/, null);
  await failsWith(fetchWith(`${robotsTxt}\nUser-agent: *\nDisallow: /tiendas/tienda-%c3%b1\n`), /robots\.txt blocks public URL\(s\) for \*: \/tiendas\/tienda-%C3%B1/, null);
  await failsWith({ robots: `${robotsTxt}\nUser-agent: *\nDisallow: /listados\nAllow: /**********\n` }, /robots\.txt blocks public URL\(s\) for \*: \/listados/, null);
  const parsed = parseRobotsTxt("User-agent: *\nDisallow: /fish\nAllow: /fish*\nDisallow: /a%2Fb\nDisallow: /%7Euser\nAllow: /p$\nDisallow: /p\n");
  assert.equal(robotsAllows(parsed, "*", "/fish/x"), true, "equal specificity: allow wins");
  assert.equal(robotsAllows(parsed, "*", "/a/b"), true, "an encoded reserved '/' stays encoded");
  assert.equal(robotsAllows(parsed, "*", "/a%2Fb"), false);
  assert.equal(robotsAllows(parsed, "*", "/~user"), false, "an encoded unreserved '~' is compared decoded");
  assert.equal(robotsAllows(parsed, "*", "/p"), true, "'$' anchors count toward specificity");
  assert.equal(robotsAllows(parsed, "*", "/pq"), false);
  assert.equal(smoke.normalizeRobotsPath("/tienda-ñ?q=%7e"), "/tienda-%C3%B1?q=~");
});

test("Link header parameters are parsed with quoted strings, escapes and first-wins semantics", async () => {
  await failsWith({ pageHeaders: { "/terminos": { Link: `<${site}/wrong>; title="one,two"; rel="canonical"` } } }, /\/terminos: Link header canonical https:\/\/laria\.audio\/wrong is not the expected/);
  await failsWith({ pageHeaders: { "/terminos": { Link: `<${site}/wrong>; title="a;b\\"c,d"; rel=canonical` } } }, /Link header canonical https:\/\/laria\.audio\/wrong/);
  await failsWith({ pageHeaders: { "/terminos": { Link: `</x.css>; rel=preload, <${site}/wrong>; rel="alternate canonical"` } } }, /Link header canonical https:\/\/laria\.audio\/wrong/);
  await failsWith({ pageHeaders: { "/terminos": { Link: `${site}/wrong; rel=canonical` } } }, /\/terminos: Link header has unparseable entries/);
  await run({ pageHeaders: { "/terminos": { Link: `<${site}/wrong>; rel="preload"; rel="canonical", <${site}/terminos>; rel=canonical` } } });
  assert.deepEqual(smoke.linkHeaderCanonicals(`<a>; title="x\\"; rel=canonical"; rel=canonical`), ["a"]);
});

test("lastmod must be a real calendar date and time", () => {
  for (const value of ["2026-02-31", "2025-02-29", "2026-04-31", "2026-00-10", "2026-13-01", "2026-09-27T24:00Z", "2026-09-27T23:60Z", "2026-09-27T23:59:60Z", "2026-09-27T10:00+15:00", "2026-09-27T10:00", "2026-9-27", "1900-02-29"]) {
    assert.equal(smoke.isW3cDatetime(value), false, value);
    assert.match(validateSitemapXml(sitemap().replace("<lastmod>2026-09-27</lastmod>", `<lastmod>${value}</lastmod>`), site) ?? "VALID", /invalid <lastmod>/, value);
  }
  for (const value of ["2024-02-29", "2000-02-29", "2026", "2026-09", "2026-09-27", "2026-09-27T10:00Z", "2026-09-27T10:00:59.123-05:00", "2026-09-10T00:00:00.000Z", "2026-09-27T10:00+14:00"]) {
    assert.equal(smoke.isW3cDatetime(value), true, value);
  }
});

// -- Link header grammar (RFC 8288 / RFC 9110) --------------------------------

test("malformed Link header entries fail the page, even beside a correct canonical", async () => {
  const good = `<${site}/terminos>; rel="canonical"`;
  const cases = [
    ['</x.css>; rel="preload', "unterminated quoted value"],
    ["</x.css>; =preload", "empty parameter name"],
    ["</x.css>; rel=", "empty parameter value"],
    ["</x.css>; r@l=preload", "invalid parameter name"],
    ["</x .css>; rel=preload", "whitespace in the target URI"],
    ['</x.css>; rel="preload" junk', "junk after a quoted value"],
    ["</x.css> rel=preload", "missing ';' before a parameter"],
  ];
  for (const [entry, why] of cases) {
    assert.ok(smoke.parseLinkHeader(`${good}, ${entry}`).malformed.length, why);
    await failsWith({ pageHeaders: { "/terminos": { Link: `${good}, ${entry}` } } }, /\/terminos: Link header has unparseable entries/);
  }
  const valid = `${good}, </x.css>; rel=preload; as=style, </f.woff2>; rel="preload"; title*=UTF-8''a%20b; crossorigin=""`;
  assert.deepEqual(smoke.parseLinkHeader(valid).malformed, []);
  await run({ pageHeaders: { "/terminos": { Link: valid } } });
});

// -- HTML character references ----------------------------------------------

test("HTML character references decode per the WHATWG table, including &Tab; and &NewLine;", async () => {
  const { decodeHtml } = smoke;
  assert.equal(decodeHtml("&Tab;&NewLine;&nbsp;&amp;&lt;", true), "\t\n &<");
  assert.equal(decodeHtml("&notit; &amp &ampx", false), "¬it; & &x");
  assert.equal(decodeHtml("&ampx &amp=1 &notit;", true), "&ampx &amp=1 &notit;", "legacy references are not decoded before [=A-Za-z0-9] in attributes");
  assert.equal(decodeHtml("&#x80;&#0;&#xD800;&#x110000;&#0000065;", true), "€���A");
  assert.equal(decodeHtml("&unknown; &#; &#x;", true), "&unknown; &#; &#x;");
  const url = `${site}/terminos`;
  await failsWith({ pages: { "/terminos": page(url, { ogTitle: "&Tab;&NewLine; &Tab;" }) } }, /\/terminos: og:title is empty/);
  await run({ pages: { "/terminos": page(url, { ogTitle: "T&eacute;rminos &amp; condiciones" }) } });
});

// -- Required coverage ---------------------------------------------------------

test("catalog pagination: page 2 must canonicalize to itself or redirect to /listados", async () => {
  await failsWith({ pages: { "/listados?page=2": page(`${site}/listados`) } }, /\/listados\?page=2: canonical https:\/\/laria\.audio\/listados is not the expected https:\/\/laria\.audio\/listados\?page=2/, 2);
  await failsWith({ pages: { "/listados?page=2": page(`${site}/listados?page=2`, { ogUrl: `${site}/listados` }) } }, /\/listados\?page=2: og:url https:\/\/laria\.audio\/listados is not the expected/);
  await failsWith({ statuses: { "/listados?page=2": 404 } }, /\/listados\?page=2: expected 200 or a redirect to .*\/listados, got HTTP 404/);
  await run({ statuses: { "/listados?page=2": 308 }, pages: { "/listados?page=2": "" } });
  // The redirect target must be /listados itself on the candidate or the canonical site origin.
  const redirect = (location) => ({ statuses: { "/listados?page=2": 308 }, locations: { "/listados?page=2": location }, pages: { "/listados?page=2": "" } });
  for (const location of ["https://other.example/listados", "//other.example/listados", "http://laria.audio/listados", "/listados?category=guitars", "/listados#top", "/instrumentos/guitarras", "https://[bad"]) {
    await failsWith(redirect(location), /\/listados\?page=2: expected 200 or a redirect to https:\/\/candidate\.example\/listados or https:\/\/laria\.audio\/listados/);
  }
  await run(redirect(`${base}/listados`));
  await run(redirect(`${site}/listados`));
});

test("category-only catalog URLs must canonicalize (canonical and og:url) to their landing page", async () => {
  // The Sprint 9 og:url bug: canonical pointed at the landing while og:url kept /listados.
  await failsWith({ pages: { "/listados?category=drums": page(`${site}/instrumentos/baterias`, { ogUrl: `${site}/listados` }) } }, /\/listados\?category=drums: og:url https:\/\/laria\.audio\/listados is not the expected https:\/\/laria\.audio\/instrumentos\/baterias/);
  await failsWith({ pages: { "/listados?category=microphones": page(`${site}/listados?category=microphones`) } }, /\/listados\?category=microphones: canonical .* is not the expected https:\/\/laria\.audio\/instrumentos\/microfonos/, 2);
  await failsWith({ statuses: { "/listados?category=guitars": 500 } }, /\/listados\?category=guitars: HTTP 500/);
});

test("filtered catalog URLs must be noindex, follow without a canonical, naming themselves in og:url", async () => {
  const path = "/listados?category=guitars&sort=price_asc";
  const self = `${site}${path}`;
  await failsWith({ pages: { [path]: page(self, { robots: "noindex, follow" }) } }, /must not declare a canonical/);
  await failsWith({ pages: { [path]: page(self, { canonical: null, robots: "noindex, nofollow" }) } }, /expected a noindex, follow robots meta \(found: noindex, nofollow\)/);
  await failsWith({ pages: { [path]: page(self, { canonical: null }) } }, /expected a noindex, follow robots meta \(found: none\)/);
  await failsWith({ pages: { [path]: page(self, { canonical: null, robots: "noindex, follow", ogUrl: `${site}/listados` }) } }, /og:url https:\/\/laria\.audio\/listados is not the page's own URL https:\/\/laria\.audio\/listados\?category=guitars&sort=price_asc/);
});

test("populated categories are indexable with an ItemList; empty categories are noindex and publish none", async () => {
  const populated = `${site}/instrumentos/bajos`;
  const empty = `${site}/instrumentos/platillos`;
  const sitemapBody = sitemap([...representative, "/instrumentos/bajos"]);
  const both = { sitemapBody, populated: ["guitarras", "bajos"] };
  await run(both);
  await failsWith({ ...both, pages: { "/instrumentos/bajos": page(populated, { robots: "noindex, follow", jsonLd: [breadcrumb(populated), itemList([`${site}${listing}`])] }) } }, /populated category \/instrumentos\/bajos: robots meta blocks indexing of a public page \(noindex\)/);
  await failsWith({ ...both, pages: { "/instrumentos/bajos": page(populated, { jsonLd: [breadcrumb(populated)] }) } }, /populated category \/instrumentos\/bajos: expected exactly one ItemList JSON-LD item, found 0/);
  // In the sitemap, the page must not be empty: an empty category must not be submitted.
  await failsWith({ sitemapBody }, /populated category \/instrumentos\/bajos: expected exactly one ItemList JSON-LD item, found 0|robots meta blocks indexing/, null);
  await failsWith({ pages: { "/instrumentos/platillos": page(empty, { jsonLd: [breadcrumb(empty)] }) } }, /empty category \/instrumentos\/platillos: expected a noindex, follow robots meta \(found: none\)/);
  await failsWith({ pages: { "/instrumentos/platillos": page(empty, { robots: "noindex, follow", jsonLd: [breadcrumb(empty), itemList([`${site}${listing}`])] }) } }, /empty category \/instrumentos\/platillos: an empty category must not publish an ItemList/);
  await failsWith({ pages: { "/instrumentos/platillos": page(empty, { robots: "noindex, nofollow", jsonLd: [breadcrumb(empty)] }) } }, /empty category \/instrumentos\/platillos: expected a noindex, follow robots meta/);
});

test("legacy listing slugs without UUIDs are sampled as listings", async () => {
  const legacy = "/instrumentos/guitarra-electrica-squier-stratocaster-usada-lima";
  assert.equal(classifyPath(legacy), "listing");
  const result = await run({ sitemapBody: sitemap(["/", "/listados", category, legacy, listing, store]) });
  assert.equal(result.samples.listing.pathname, legacy);
});

test("sold listings: reachable, noindex, self canonical, SoldOut, and never in the sitemap", async () => {
  const self = `${site}${soldListing}`;
  await failsWith({ sitemapBody: sitemap([...representative, soldListing]) }, /sold listing .*: a sold listing must not be listed in sitemap\.xml/, null);
  await failsWith({ pages: { [soldListing]: page(self, { jsonLd: [product(self, "https://schema.org/SoldOut")] }) } }, /sold listing .*: expected a noindex, follow robots meta \(found: none\)/);
  await failsWith({ pages: { [soldListing]: page(self, { robots: "noindex, follow", jsonLd: [product(self)] }) } }, /a sold listing must publish offers\.availability SoldOut \(got "https:\/\/schema\.org\/InStock"\)/);
  await failsWith({ pages: { [soldListing]: page(self, { robots: "noindex, follow", canonical: `${site}/listados`, jsonLd: [product(self, "https://schema.org/SoldOut")] }) } }, /sold listing .*: canonical https:\/\/laria\.audio\/listados is not the expected/);
  await failsWith({ statuses: { [soldListing]: 404 } }, /sold listing .*: HTTP 404/);
  await assert.rejects(run({}, ["googlebot"], unavailableRenderer, { soldListing: "/listados" }), /--sold-listing must be a path like \/instrumentos\/<slug>/);
});

test("rendered structured data must be valid JSON-LD that names the page itself", async () => {
  const listingUrl = `${site}${listing}`;
  const storeUrl = `${site}${store}`;
  await failsWith({ pages: { "/": page(site) } }, /structured data home \/: expected exactly one Organization JSON-LD item, found 0/);
  await failsWith({ pages: { "/": page(site, { jsonLd: [ld("Organization", { url: `${site}/listados` })] }) } }, /Organization\.url is "https:\/\/laria\.audio\/listados", expected https:\/\/laria\.audio\//);
  await failsWith({ pages: { [listing]: page(listingUrl, { jsonLd: [product(`${site}/instrumentos/otro-0b6f4a1e-6a3d-4c43-9d49-1d3f64f9c2ab`)] }) } }, /Product\.url is .* expected https:\/\/laria\.audio\/instrumentos\/fender-strat/, null);
  await failsWith({ pages: { [listing]: page(listingUrl, { jsonLd: [product(listingUrl, undefined, { seller: { "@type": "Person", name: "Ana" } })] }) } }, /only stores may be named as the offer seller/);
  await failsWith({ pages: { [listing]: page(listingUrl, { jsonLd: [product(listingUrl, undefined, { priceCurrency: "USD" })] }) } }, /offers\.priceCurrency must be PEN/);
  await failsWith({ pages: { [listing]: page(listingUrl, { jsonLd: [{ ...product(listingUrl), "@context": "http://schema.org" }] }) } }, /JSON-LD @context must be "https:\/\/schema\.org"/);
  await failsWith({ pages: { [listing]: page(listingUrl).replace("</body>", '<script type="application/ld+json">{"@type": "Product",}</script></body>') } }, /invalid JSON-LD/, null);
  await failsWith({ pages: { [store]: page(storeUrl, { jsonLd: [ld("Store", { name: "", url: storeUrl })] }) } }, /Store\.name is empty/);
  await failsWith({ pages: { [category]: page(`${site}${category}`, { jsonLd: [breadcrumb(`${site}${category}`), itemList(["https://other.example/instrumentos/x"])] }) } }, /ItemList entry URL "https:\/\/other\.example\/instrumentos\/x" is not a canonical URL on the site origin/);
  // A <script> that is not application/ld+json, or JSON-LD inside a <template>, is not structured data.
  await failsWith({ pages: { "/": page(site).replace("</body>", `<template><script type="application/ld+json">${JSON.stringify(ld("Organization", { url: `${site}/` }))}</script></template></body>`) } }, /expected exactly one Organization JSON-LD item, found 0/);
  // A product without a price publishes no offers, which is valid.
  await run({ pages: { [listing]: page(listingUrl, { jsonLd: [ld("Product", { name: "Sin precio", url: listingUrl })] }) } });
});

test("authenticated Admin record pages must render real records", async () => {
  await failsWith({ statuses: { "/admin/tiendas": 500 } }, /\[admin\] \/admin\/tiendas: HTTP 500/);
  await failsWith({ pages: { "/admin/tiendas": adminPage(0) } }, /\[admin\] \/admin\/tiendas: no Admin record was rendered/);
  await failsWith({ pages: { "/admin/publicaciones": adminPage(1).replace("<body>", "<body><p role=\"alert\">No pudimos cargar esta sección administrativa. No asumiremos que está vacía.</p>") } }, /\/admin\/publicaciones: the Admin section reported a load error/);
  await failsWith({ pages: { "/admin/tiendas": '<html id="__next_error__"><head><meta name="robots" content="noindex, nofollow"/></head><body><a href="/admin/auditoria/x">x</a></body></html>' } }, /the page rendered a Next\.js error/);
  await assert.rejects(run({}, ["googlebot"], unavailableRenderer, { adminCookie: "sb-access-token=expired" }), /\[admin\] \/admin\/tiendas: HTTP 307 to \/login\?next=%2Fadmin \(session not accepted\?\)/);
});

test("data-dependent surfaces must be verified or explicitly waived; core surfaces cannot be waived", async () => {
  await assert.rejects(run({}, ["googlebot"], unavailableRenderer, { soldListing: null, adminCookie: null }), (error) => {
    assert.match(error.message, /INCOMPLETE COVERAGE: sold-listing was not verified \(pass --sold-listing=/);
    assert.match(error.message, /INCOMPLETE COVERAGE: admin-records was not verified \(set LARIA_SMOKE_ADMIN_COOKIE/);
    assert.equal(error.failures.length, 2, error.message);
    assert.equal(error.coverage["sold-listing"].status, "missing");
    return true;
  });
  const logged = [];
  const result = await runSeoSmoke({ base, site, crawlers: ["googlebot"], renderer: unavailableRenderer, fetchImpl: fakeFetch().impl, log: (line) => logged.push(line), waivers: { "sold-listing": "no sold listing in production yet", "admin-records": "owner runs the Admin check manually" } });
  assert.equal(result.coverage["sold-listing"].status, "waived");
  assert.ok(logged.includes("WAIVED sold-listing: no sold listing in production yet"));
  // With every category populated, empty-category needs a waiver.
  const all = smoke.CATEGORY_LANDINGS.map((landing) => landing.slug);
  const everyCategory = { sitemapBody: sitemap([...representative, ...all.filter((slug) => slug !== "guitarras").map((slug) => `/instrumentos/${slug}`)]), populated: all };
  await failsWith(everyCategory, /INCOMPLETE COVERAGE: empty-category was not verified \(no category is empty in this dataset, or waive it/);
  await run(everyCategory, ["googlebot"], unavailableRenderer, { waivers: { "empty-category": "every category has inventory" } });
  for (const waivers of [{ "structured-data": "later" }, { "category-aliases": "n/a" }, { "sold-listing": "  " }]) {
    await assert.rejects(run({}, ["googlebot"], unavailableRenderer, { waivers }), /can be waived, each with a reason/);
  }
});

test("noindex, follow pages fail when X-Robots-Tag or a crawler meta adds nofollow", async () => {
  const filtered = "/listados?category=guitars&sort=price_asc";
  const empty = "/instrumentos/platillos";
  for (const path of [filtered, empty, soldListing]) {
    for (const header of ["nofollow", "none", "googlebot: nofollow", "bingbot: none", "noindex, nofollow"]) {
      await failsWith({ pageHeaders: { [path]: { "X-Robots-Tag": header } } }, new RegExp(`X-Robots-Tag "${header}" adds [^,]*(nofollow|none)[^,]*, but the page must stay follow`));
    }
    await failsWith({ pageHeaders: { [path]: { "X-Robots-Tag": "nofollw" } } }, /X-Robots-Tag "nofollw" has malformed directive/);
    // A noindex header alone is consistent with noindex, follow.
    await run({ pageHeaders: { [path]: { "X-Robots-Tag": "noindex" } } });
  }
  const self = `${site}${empty}`;
  await failsWith({ pages: { [empty]: page(self, { robots: "noindex, follow", jsonLd: [breadcrumb(self)] }).replace("</head>", '<meta name="googlebot" content="nofollow"/></head>') } }, /empty category \/instrumentos\/platillos: a robots-style meta adds nofollow, but the page must stay follow/);
  await failsWith({ pages: { [empty]: page(self, { robots: "noindex, follow", jsonLd: [breadcrumb(self)] }).replace("</main>", '</main><meta name="robots" content="none"/>') } }, /a robots-style meta adds none, but the page must stay follow/);
});

test("Admin record pages need a real noindex, nofollow X-Robots-Tag and robots meta", async () => {
  await failsWith({ pages: { "/admin/tiendas": adminPage(1).replace('<meta name="robots" content="noindex, nofollow"/>', "") } }, /\/admin\/tiendas: <meta name="robots"> element missing/);
  await failsWith({ pages: { "/admin/tiendas": adminPage(1).replace('content="noindex, nofollow"', 'content="noindex"') } }, /\/admin\/tiendas: <meta name="robots"> lacks the nofollow directive/);
  // A header that merely mentions noindex (here scoped to another crawler) is not enough.
  await failsWith({ pageHeaders: { "/admin/tiendas": { "X-Robots-Tag": "googlebot-news: noindex, nofollow" } } }, /\/admin\/tiendas: X-Robots-Tag "googlebot-news: noindex, nofollow" lacks the noindex and nofollow directive/);
});
