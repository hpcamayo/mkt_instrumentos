// Read-only smoke against a built app with at least two catalog pages. For example:
// node tests/catalog-routing-http.cjs http://127.0.0.1:3000
const assert = require("node:assert/strict");

async function main() {
  const base = process.argv[2];
  if (!base) throw new Error("Provide the built application's base URL");
  let checks = 0;
  const fetchPage = async (path, agent = "Googlebot/2.1", method = "GET") => {
    const response = await fetch(new URL(path, base), { method, redirect: "manual", headers: { "user-agent": agent } });
    return { response, body: await response.text() };
  };
  for (const agent of ["Amazonbot/0.1", "Reflectionbot/1.0", "MJ12bot/1.4.8"]) {
    for (const path of ["/listados", "/api/catalog/page?page=2", "/api/catalog/facets", "/api/catalog/suggest?q=sh"]) {
      const { response, body } = await fetchPage(path, agent);
      assert.equal(response.status, 403, `${agent} ${path}`);
      assert.equal(body, "Acceso no permitido.");
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      checks += 1;
    }
    for (const path of ["/instrumentos/guitarras", "/robots.txt", "/sitemap.xml"]) {
      assert.equal((await fetchPage(path, agent)).response.status, 200, `${agent} can discover ${path}`);
      checks += 1;
    }
  }
  const bad = await fetchPage("/listados?category=microphones&condition=Nuevo%C2%B5phone_type%3Ddynamic&location=Lima&location=Cusco&page=2");
  assert.equal(bad.response.status, 308);
  assert.ok(Buffer.byteLength(bad.body) < 1024, "the redirect does not render the layout");
  const target = new URL(bad.response.headers.get("location"));
  assert.deepEqual(target.searchParams.getAll("location"), ["Lima", "Cusco"]);
  assert.equal(target.searchParams.has("condition"), false);
  assert.equal(target.searchParams.get("page"), "2");
  checks += 1;
  for (const agent of ["Googlebot/2.1", "bingbot/2.0", "facebookexternalhit/1.1", "WhatsApp/2.0", "OAI-SearchBot/1.0", "Mozilla/5.0"]) {
    assert.equal((await fetchPage("/listados", agent)).response.status, 200, agent);
    checks += 1;
  }
  for (const [path, canonical, filtered] of [
    ["/listados", "https://laria.audio/listados", false],
    ["/listados?page=2", "https://laria.audio/listados?page=2", false],
    ["/instrumentos/guitarras", "https://laria.audio/instrumentos/guitarras", false],
    ["/listados?category=microphones&condition=Nuevo", null, true],
  ]) {
    const { response, body } = await fetchPage(path);
    assert.equal(response.status, 200, path);
    const head = body.split("</head>")[0];
    if (canonical) assert.ok(head.includes(`rel="canonical" href="${canonical}"`), `${path} canonical in head`);
    if (filtered) assert.match(head, /<meta name="robots" content="noindex, follow"/);
    checks += 1;
  }
  const { body } = await fetchPage("/listados?category=microphones&condition=Nuevo&condition=Usado+-+buen+estado&location=Lima&location=Cusco&sort=price_asc&utm_source=email&%C2%B5phone_type=dynamic");
  assert.doesNotMatch(body, /<input[^>]+name="(?:µphone_type|utm_source|_rsc)"/);
  const anchors = [...body.matchAll(/<a\b([^>]+)>/g)].map(([, attributes]) => attributes);
  let refinements = 0;
  for (const attributes of anchors) {
    const href = /href="([^"]+)"/.exec(attributes)?.[1]?.replace(/&amp;/g, "&");
    if (!href || !href.startsWith("/listados?")) continue;
    assert.doesNotMatch(href, /µphone_type|%C2%B5phone_type|utm_source|_rsc/);
    if ([...new URL(href, base).searchParams.keys()].some((key) => key !== "page")) {
      assert.match(attributes, /rel="nofollow"/, href);
      refinements += 1;
    }
  }
  assert.ok(refinements > 3, "refinement and menu links were checked");
  checks += 1;
  const robots = (await fetchPage("/robots.txt")).body;
  for (const agent of ["Amazonbot", "Reflectionbot", "MJ12bot"]) assert.match(robots, new RegExp(`User-Agent: ${agent}`, "i"));
  assert.match(robots, /Disallow: \/listados/i);
  console.log(`PASS: ${checks} production HTTP/SEO cases; ${refinements} refinement links checked`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
