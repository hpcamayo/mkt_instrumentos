// Run against a built local app with the local-only API fixture from scripts/perf/catalog-latency.cjs.
// node tests/amzn-search-crawl-http.cjs http://127.0.0.1:43137 http://127.0.0.1:43135
const assert = require("node:assert/strict");
const local = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/;
const agent = "Mozilla/5.0 (compatible; Amzn-SearchBot/0.1)";

async function main() {
  const [base, fixture] = process.argv.slice(2);
  assert.match(base ?? "", local);
  assert.match(fixture ?? "", local);
  let checks = 0;
  const request = async (path, ua = agent, method = "GET") => {
    const response = await fetch(base + path, { redirect: "manual", method, headers: { "user-agent": ua } });
    return { response, body: await response.text() };
  };
  await fetch(fixture + "/__configure", { method: "POST", body: JSON.stringify({ core: 0, facets: 0, types: 0 }) });
  for (const path of ["/listados?brand=Shure", "/listados?sort=price_asc", "/listados?q=zzz", "/listados?condition=Nuevo", "/listados?page=2&category=microphones&brand=Shure", "/api/catalog/page?brand=Shure&page=2", "/api/catalog/facets?category=microphones&microphone_type=dynamic", "/api/catalog/suggest?q=sh"]) {
    for (const method of ["GET", "HEAD"]) {
      const { response, body } = await request(path, agent, method);
      assert.equal(response.status, 403, `${method} ${path}`);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.ok(response.headers.get("vary").toLowerCase().split(/,\s*/).includes("user-agent"));
      assert.equal(body, method === "HEAD" ? "" : "Acceso no permitido.");
      const reads = await (await fetch(fixture + "/__stats")).json();
      assert.equal(reads.length, 0, "blocked requests never start layout, metadata, inventory, facets or sessions");
      checks++;
    }
  }
  const moved = await request("/listados?category=microphones&condition=Nuevo%C2%B5phone_type%3Ddynamic&page=2");
  assert.equal(moved.response.status, 308);
  assert.equal(new URL(moved.response.headers.get("location")).search, "?category=microphones&page=2");
  assert.equal((await (await fetch(fixture + "/__stats")).json()).length, 0);
  checks++;

  for (const [path, canonical] of [
    ["/listados", "/listados"], ["/listados?page=2", "/listados?page=2"],
    ["/listados?category=guitars&page=2", "/instrumentos/guitarras?page=2"],
    ["/listados?utm_source=brand%3DShure&_rsc=abc", "/listados"],
    ["/listados?brand=&q=+&page=2", "/listados?page=2"],
    ["/instrumentos/guitarras", "/instrumentos/guitarras"],
    ["/instrumentos/guitarras?page=2", "/instrumentos/guitarras?page=2"],
  ]) {
    const { response, body } = await request(path);
    assert.equal(response.status, 200, path);
    const head = body.split("</head>")[0];
    assert.ok(head.includes(`rel="canonical" href="https://laria.audio${canonical}"`), path);
    assert.ok(body.includes("Micrófono Shure SM58 de prueba"), "cards remain server-rendered");
    assert.doesNotMatch(head, /content="noindex/);
    checks++;
  }
  // The same URL that was refused to the crawler is fully usable by real users and other discovery agents.
  for (const ua of ["Mozilla/5.0", "Amzn-User/1.0", "Googlebot/2.1", "bingbot/2.0", "facebookexternalhit/1.1", "WhatsApp/2.0", "OAI-SearchBot/1.0", "Amzn-SearchBotPreview/1.0"]) {
    const { response, body } = await request("/listados?brand=Shure&sort=price_asc&page=2", ua);
    assert.equal(response.status, 200, ua);
    assert.match(body.split("</head>")[0], /name="robots" content="noindex, follow"/);
    assert.ok(body.includes("Micrófono Shure SM58 de prueba"));
    assert.equal(response.headers.get("x-robots-tag"), null);
    checks++;
  }
  for (const ua of ["Mozilla/5.0", "Amzn-User/1.0", "Googlebot/2.1"]) {
    const { response, body } = await request("/api/catalog/page?brand=Shure&sort=price_asc&page=2", ua);
    assert.equal(response.status, 200, ua);
    assert.equal(JSON.parse(body).listings.length, 24);
    checks++;
  }
  const { body: robots } = await request("/robots.txt");
  assert.match(robots, /User-Agent: Amzn-SearchBot/i);
  assert.match(robots, /Disallow: \/listados\?brand=/);
  assert.match(robots, /Disallow: \/listados\?\*&brand=/);
  assert.doesNotMatch(robots, /User-Agent: Amzn-User/i);
  checks++;
  console.log(`PASS: ${checks} Amzn-SearchBot HTTP/SEO cases, including zero upstream reads on every blocked request`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
