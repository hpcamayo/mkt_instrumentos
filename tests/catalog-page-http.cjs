// A local built app + scripts/perf/catalog-latency.cjs fixture; never writes production data.
// node tests/catalog-page-http.cjs http://127.0.0.1:43137 http://127.0.0.1:43135
const assert = require("node:assert/strict");
const local = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/;

async function main() {
  const [base, fixture] = process.argv.slice(2);
  assert.match(base ?? "", local);
  assert.match(fixture ?? "", local);
  let checks = 0;
  const configure = (values = {}) => fetch(`${fixture}/__configure`, { method: "POST", body: JSON.stringify({ core: 0, facets: 0, types: 0, ...values }) });
  const stats = async () => (await fetch(`${fixture}/__stats`)).json();
  const get = (path, ua = "Mozilla/5.0") => fetch(base + path, { redirect: "manual", headers: { "user-agent": ua } });
  try {
    // Exactly the production failure: 5 rows cannot fill page two. Both catalog and Descubrir share this API.
    for (const path of ["/api/catalog/page?page=2", "/api/catalog/page?brand=Shure&page=2", "/api/catalog/page?q=shure&page=2", "/api/catalog/page?fotos=todas&page=2", "/api/catalog/page?page=100000"]) {
      await configure({ count: 5 });
      const response = await get(path);
      assert.equal(response.status, 200, path);
      assert.deepEqual(await response.json(), { listings: [], total: null, reserved: [] });
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const reads = await stats();
      assert.equal(reads.length, 1, "no retries, count recovery, reservation RPC or first-page restart");
      assert.equal(reads[0].status, 416);
      checks++;
    }

    // A final full page is also exhausted, and a later page of a now-empty catalog is recoverable.
    for (const count of [0, 24]) {
      await configure({ count });
      const response = await get("/api/catalog/page?page=2");
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).listings, []);
      assert.equal((await stats()).length, 1);
      checks++;
    }

    // Preserve valid pages and badges. A new listing can appear immediately after an uncached empty response.
    for (const [count, page, length] of [[25, 2, 1], [49, 2, 24], [49, 3, 1], [0, 1, 0]]) {
      await configure({ count });
      const response = await get(`/api/catalog/page?page=${page}`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.listings.length, length);
      assert.equal(body.total, count);
      assert.deepEqual(body.reserved, []);
      assert.equal(response.headers.get("cache-control"), "public, max-age=30");
      const reads = await stats();
      assert.equal(reads.filter((read) => read.path === "/rest/v1/public_listings").length, 1);
      checks++;
    }

    await configure({ count: 5, inventoryStatus: 503 });
    const failed = await get("/api/catalog/page?page=2");
    assert.equal(failed.status, 502, "unavailable inventory must never masquerade as an empty page");
    assert.equal((await stats()).length, 1, "public reads still do not retry 503");
    checks++;

    // The middleware guard must win even over an exhausted page: zero layout/API/DB work for restricted traffic.
    for (const [ua, path] of [["Amzn-SearchBot/0.1", "/api/catalog/page?brand=Shure&page=2"], ["Amazonbot/0.1", "/api/catalog/page?page=2"], ["Reflectionbot/1.0", "/api/catalog/page?page=2"], ["MJ12bot/1.4", "/api/catalog/page?page=2"]]) {
      await configure({ count: 5 });
      const response = await get(path, ua);
      assert.equal(response.status, 403);
      assert.equal(await response.text(), "Acceso no permitido.");
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal((await stats()).length, 0);
      checks++;
    }

    // The API recovery must not change numbered HTML pagination or cleanup redirects.
    await configure({ count: 5 });
    for (const path of ["/listados?page=2", "/instrumentos/guitarras?page=2"]) {
      const response = await get(path, "Googlebot/2.1");
      assert.equal(response.status, 307, path);
      assert.equal(new URL(response.headers.get("location"), base).pathname, path.split("?")[0]);
      checks++;
    }
    await configure({ count: 5 });
    const malformed = await get("/listados?brand=Shure%C2%B5phone_type%3Ddynamic&page=2");
    assert.equal(malformed.status, 308);
    assert.equal((await stats()).length, 0);
    checks++;
    console.log(`PASS: ${checks} catalog-page HTTP cases, including real upstream 416 and zero-read crawler denials`);
  } finally {
    await configure(); // leave the 100-row fixture ready for the existing SEO suites
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
