const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { NextRequest } = require("next/server");

const target = path.resolve(__dirname, "../app/api/catalog/page/route.ts");
const rangeError = { code: "PGRST103", message: "Requested range not satisfiable", details: "An offset of 24 was requested, but there are only 5 rows.", hint: null };

// Use the real anonymous read client, query builder and PostgREST error parsing. Only the wire and the optional
// reservation badge are replaced, so a recovery that adds a retry/count query is visible here.
async function request(query, respond, { configured = true } = {}) {
  const calls = [];
  const reservations = [];
  const originalLoad = Module._load;
  const originalFetch = global.fetch;
  const saved = Object.fromEntries(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"].map((key) => [key, process.env[key]]));
  if (configured) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:43135";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "local-anon-key";
  } else {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
  global.fetch = async (input, init) => {
    calls.push({ url: new URL(String(input)), init });
    return respond(calls.at(-1));
  };
  Module._load = function (name, ...args) {
    if (name === "server-only") return {};
    if (name === "@/lib/listing-reservations-server") return { reservedCardIds: async (rows) => {
      reservations.push(rows);
      return new Set(rows.filter((row) => row.id === "reserved").map((row) => row.id));
    } };
    return originalLoad.call(this, name, ...args);
  };
  delete require.cache[target];
  try {
    const { GET } = require(target);
    const response = await GET(new NextRequest(`https://laria.audio/api/catalog/page?${query}`));
    return { response, body: await response.json(), calls, reservations };
  } finally {
    delete require.cache[target];
    Module._load = originalLoad;
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const overflow = () => Response.json(rangeError, { status: 416, headers: { "content-range": "*/5" } });

test("an exhausted later catalog/search/Descubrir page is empty success after exactly one bounded read", async () => {
  const today = require("@/lib/descubrir").limaDay(Date.now());
  for (const query of ["page=2", "brand=Shure&sort=price_asc&page=2", "q=shure&page=100000", "fotos=todas&page=2", `desde=${today}&page=2`, `fotos=todas&desde=${today}&page=2`]) {
    const { response, body, calls, reservations } = await request(query, overflow);
    assert.equal(response.status, 200, query);
    assert.deepEqual(body, { listings: [], total: null, reserved: [] });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(calls.length, 1, "no retry, count query, restart from page one or reservation lookup");
    assert.equal(calls[0].init.signal.aborted, false, "the existing read deadline is preserved");
    assert.equal(calls[0].url.searchParams.get("offset"), query.includes("100000") ? "2399976" : "24");
    assert.equal(calls[0].url.searchParams.get("limit"), "24");
    if (query.includes("q=shure")) {
      assert.equal(calls[0].url.pathname, "/rest/v1/rpc/catalog_search");
      assert.deepEqual(JSON.parse(calls[0].init.body), { p_q: "shure" });
    }
    if (query.includes("fotos=todas")) assert.equal(calls[0].url.searchParams.get("listing_photos.limit"), "10");
    if (query.includes("desde=")) assert.equal(calls[0].url.searchParams.get("published_at"), `gte.${today}T00:00:00-05:00`);
    assert.deepEqual(reservations, []);
    assert.equal(response.headers.has("location"), false, "JSON consumers are never redirected to HTML");
    assert.equal(response.headers.has("set-cookie"), false);
  }
});

test("the range exception does not hide a first-page, malformed-page, database or network failure", async () => {
  for (const query of ["", "page=1", "page=0", "page=-2", "page=1.5", "page=oops", "page=100001", "page=1&page=2"]) {
    const { response, body, calls } = await request(query, overflow);
    assert.equal(response.status, 502, query);
    assert.deepEqual(body, { listings: [], reserved: [] });
    assert.equal(calls.length, 1);
  }
  for (const [status, code] of [[500, "57014"], [503, "PGRST000"], [504, "PGRST003"], [400, "PGRST100"], [403, "42501"], [416, "OTHER_RANGE_ERROR"]]) {
    const { response, calls, reservations } = await request("page=2", () => Response.json({ code, message: "Unavailable" }, { status }));
    assert.equal(response.status, 502, code);
    assert.equal(calls.length, 1, "real failures remain failures without public-read retries");
    assert.deepEqual(reservations, []);
  }
  const failed = await request("page=2", () => { throw new TypeError("fetch failed"); });
  assert.equal(failed.response.status, 502);
  assert.equal(failed.calls.length, 1);
});

test("valid pages retain filters, ordering, totals, reservation badges and their existing cache policy", async () => {
  const rows = [{ id: "reserved", seller_type: "individual" }, { id: "store", seller_type: "store" }];
  const { response, body, calls, reservations } = await request("brand=Shure&location=Lima&sort=price_asc&page=2", () => Response.json(rows, { headers: { "content-range": "24-25/26" } }));
  assert.equal(response.status, 200);
  assert.deepEqual(body, { listings: rows, total: 26, reserved: ["reserved"] });
  assert.equal(response.headers.get("cache-control"), "public, max-age=30");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.searchParams.get("brand"), "ilike.%Shure%");
  assert.equal(calls[0].url.searchParams.get("city"), "eq.Lima");
  assert.match(calls[0].url.searchParams.get("order"), /^price_pen\.asc\.nullslast,id\.asc$/);
  assert.deepEqual(reservations, [rows]);

  const empty = await request("page=1", () => Response.json([], { headers: { "content-range": "*/0" } }));
  assert.deepEqual(empty.body, { listings: [], total: 0, reserved: [] }, "a real empty catalog still has a known total of zero");
});

test("invalid discovery dates and missing configuration still refuse before any upstream read", async () => {
  const invalid = await request("desde=ayer&page=2", () => assert.fail("invalid date read"));
  assert.equal(invalid.response.status, 400);
  assert.deepEqual(invalid.calls, []);
  const missing = await request("page=2", () => assert.fail("unconfigured read"), { configured: false });
  assert.equal(missing.response.status, 503);
  assert.deepEqual(missing.calls, []);
});
