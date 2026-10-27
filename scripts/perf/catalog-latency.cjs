// Controlled, local-only SSR comparison; no database credentials or production load.
// 1. node scripts/perf/catalog-latency.cjs fixture
// 2. Build/start each revision with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:43135,
//    NEXT_PUBLIC_SUPABASE_ANON_KEY=local-anon-key and NEXT_PUBLIC_SITE_URL=https://laria.audio.
// 3. node scripts/perf/catalog-latency.cjs measure http://127.0.0.1:43136
// Compare identical cold-filter keys on separate freshly started `next start` processes. JSON includes read traces.
const assert = require("node:assert/strict");
const http = require("node:http");
const fixture = "http://127.0.0.1:43135";
const local = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/;
const inventoryPaths = new Set(["/rest/v1/listings", "/rest/v1/public_listings"]);

if (process.argv[2] === "fixture") {
  let requests = [];
  let delays = { core: 350, facets: 450, types: 300 };
  const row = {
    id: "6b1f4f8e-1111-4c43-9d49-1d3f64f9c2aa", title: "Micrófono Shure SM58 de prueba", slug: "microfono-prueba",
    category: "microphones", brand: "Shure", model: "SM58", condition: "Nuevo", price_pen: 400,
    instrument_type: "microphones", attributes: { microphone_type: "dynamic", use_case: "voice" },
    published_at: "2026-10-01T00:00:00Z", view_count: 0, city: "Lima", region: "Lima", seller_type: "individual",
    created_at: "2026-10-01T00:00:00Z", status: "approved", stock_state: "available", stores: null,
    photo_count: 2, listing_photos: [],
  };
  const facets = {
    total: 100, category: { microphones: 100, guitars: 100 }, instrument_type: { microphones: 100, electric_guitar: 100 },
    condition: { Nuevo: 100 }, seller_type: { individual: 100 }, locations: [{ city: "Lima", region: "Lima", count: 100 }],
    brands: [{ brand: "Shure", count: 100 }], price: null, advanced: { microphone_type: { dynamic: 100 } },
  };
  http.createServer(async (req, res) => {
    const url = new URL(req.url, fixture);
    res.setHeader("content-type", "application/json");
    if (url.pathname === "/__stats") return res.end(JSON.stringify(requests));
    if (url.pathname === "/__configure" && req.method === "POST") {
      let input = "";
      for await (const chunk of req) input += chunk;
      delays = JSON.parse(input);
      requests = [];
      return res.end("{}");
    }
    const trace = { method: req.method, path: url.pathname, start: Date.now(), finish: null, closed: null };
    requests.push(trace);
    res.on("close", () => { trace.closed = Date.now(); });
    let data = [];
    let count = 0;
    let delay = 0;
    if (inventoryPaths.has(url.pathname)) {
      count = 100;
      delay = delays.core;
      const offset = Number(url.searchParams.get("offset") || 0);
      const limit = Math.min(24, Number(url.searchParams.get("limit") || 24));
      data = Array.from({ length: Math.max(0, Math.min(limit, count - offset)) }, (_, i) => ({
        ...row, id: `6b1f4f8e-1111-4c43-9d49-${String(offset + i + 1).padStart(12, "0")}`, slug: `microfono-prueba-${offset + i + 1}`,
      }));
    } else if (url.pathname === "/rest/v1/rpc/catalog_facets") { data = facets; delay = delays.facets; }
    else if (url.pathname === "/rest/v1/rpc/catalog_type_counts") {
      data = [{ category: "microphones", instrument_type: "microphones", listings: 100 }, { category: "guitars", instrument_type: "electric_guitar", listings: 100 }];
      delay = delays.types;
    } else if (url.pathname === "/rest/v1/rpc/catalog_brand_counts") data = [{ category: "microphones", brand: "Shure", listings: 100 }];
    const timer = setTimeout(() => {
      trace.finish = Date.now();
      res.setHeader("content-range", count ? `0-${Math.min(23, count - 1)}/${count}` : "*/0");
      res.end(req.method === "HEAD" ? "" : JSON.stringify(data));
    }, delay);
    res.on("close", () => clearTimeout(timer));
  }).listen(43135, "127.0.0.1", () => console.log(`Local catalog fixture: ${fixture}`));
} else if (process.argv[2] === "measure") {
  const base = process.argv[3];
  assert.match(base ?? "", local, "Only a local next start server is allowed");
  (async () => {
    const results = [];
    const normal = { core: 350, facets: 450, types: 300 };
    async function measure(name, path, delays = normal, agent = "Googlebot/2.1", status = 200) {
      await fetch(`${fixture}/__configure`, { method: "POST", body: JSON.stringify(delays) });
      const start = performance.now();
      const response = await fetch(base + path, { redirect: "manual", headers: { "user-agent": agent }, signal: AbortSignal.timeout(12_000) });
      const html = await response.text();
      const ms = Math.round(performance.now() - start);
      assert.equal(response.status, status, name);
      if (status === 200) {
        assert.doesNotMatch(html, /No pudimos cargar|Algo salió mal/, name);
        assert.match(html, /Micrófono Shure SM58 de prueba/, "listings remain in server-rendered HTML");
      }
      const reads = await (await fetch(`${fixture}/__stats`)).json();
      results.push({ name, ms, status, bytes: Buffer.byteLength(html), reads });
      return reads;
    }
    await measure("warmup", "/listados?brand=Latency+warmup");
    for (let i = 0; i < 5; i++) {
      const reads = await measure(`cold-${i}`, `/listados?brand=Latency+cold+${i}`);
      assert.equal(reads.filter((read) => inventoryPaths.has(read.path)).length, 1, "metadata/page share core inventory");
      assert.equal(reads.filter((read) => read.path === "/rest/v1/rpc/catalog_facets").length, 1, "one facet read per cold key");
    }
    const warm = await measure("warm", "/listados?brand=Latency+cold+4");
    assert.equal(warm.filter((read) => inventoryPaths.has(read.path)).length, 1, "warm aggregate never caches live inventory");
    assert.equal(warm.filter((read) => read.path === "/rest/v1/rpc/catalog_facets").length, 0);
    await measure("slow-core", "/listados?brand=Latency+slow+core", { ...normal, core: 1200 });
    await measure("facet-timeout", "/listados?brand=Latency+timeout", { ...normal, facets: 2400 });
    await measure("category", "/instrumentos/guitarras");
    for (const agent of ["Amazonbot/0.1", "Reflectionbot/1.0", "MJ12bot/1.4"]) {
      assert.equal((await measure(agent, "/listados", normal, agent, 403)).length, 0, "blocked bots never reach the API");
    }
    assert.equal((await measure("malformed", "/listados?brand=Shure%C2%B5phone_type%3Ddynamic", normal, "Googlebot/2.1", 308)).length, 0);
    console.log(JSON.stringify({ base, delays: normal, results }, null, 2));
  })().catch((error) => { console.error(error); process.exitCode = 1; });
} else {
  console.error("Usage: catalog-latency.cjs fixture | measure http://127.0.0.1:PORT");
  process.exitCode = 2;
}
