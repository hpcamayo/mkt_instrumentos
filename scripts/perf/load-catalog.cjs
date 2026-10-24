// Local load test for the public catalog (docs/operations/catalog-performance.md). Never point it at production.
//
//   node scripts/perf/load-catalog.cjs --base http://127.0.0.1:3000 --concurrency 20 --duration 60 \
//     --pg postgresql://postgres@127.0.0.1:54332/postgres --label after
//
// A closed loop of --concurrency workers, each requesting a page or endpoint from the mix below and waiting for it
// (60 s client timeout). The data is scripts/perf/seed-catalog.cjs's (stores tienda-perf-N, listings perf-N). With
// --pg it samples pg_stat_activity every 250 ms: connections of PostgREST's role (authenticator, switched to anon) and
// how many run a statement, during the run and 5 s after it. Prints one JSON summary.
const { Client } = require("pg");

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith("--") ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []));
const base = args.base ?? "http://127.0.0.1:3000";
const concurrency = Number(args.concurrency ?? 20);
const duration = Number(args.duration ?? 60) * 1000;
const size = Number(args.listings ?? 5000);
const seed = Number(args.seed ?? 7);

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) {
  console.error("load-catalog only runs against a local server (127.0.0.1 or localhost).");
  process.exit(2);
}

let state = seed >>> 0;
const random = () => {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(random() * list.length)];

const categories = ["guitars", "basses", "keyboards", "percussion", "amplifiers", "pedals", "microphones", "audio"];
const cities = ["Lima", "Arequipa", "Cusco", "Trujillo", "Piura", "Chiclayo"];
const brandsList = ["Fender", "Gibson", "Ibanez", "Yamaha", "Boss", "Shure", "Roland", "Marshall"];
const queries = ["fender", "guitarra", "strato", "bajo ibanez", "amp marshall", "microfono shure", "yamah", "les paul", "pedal boss", "teclado", "zzzz"];
const typed = ["fe", "fen", "gui", "ib", "sh", "bo", "ya", "ma", "ro", "gib"];
const landings = ["guitarras", "bajos", "teclados", "percusion"];

// Crawler-like variety: each catalog request is a fresh combination, so per-filter caches are tested honestly.
function catalogQuery() {
  const params = new URLSearchParams();
  if (random() < 0.7) params.append("category", pick(categories));
  if (random() < 0.4) params.append("location", pick(cities));
  if (random() < 0.3) params.append("brand", pick(brandsList));
  if (random() < 0.2) params.append("min_price", String(100 * Math.ceil(random() * 20)));
  if (random() < 0.2) params.append("sort", pick(["price_asc", "price_desc"]));
  return params.toString();
}

const mix = [
  ["home", 20, () => "/"],
  ["catalog", 15, () => "/listados"],
  ["filtered", 15, () => `/listados?${catalogQuery()}`],
  ["search", 15, () => `/listados?${new URLSearchParams({ q: pick(queries) })}`],
  ["landing", 8, () => `/instrumentos/${pick(landings)}`],
  ["listing", 12, () => `/instrumentos/perf-${1 + Math.floor(random() * size)}`],
  ["store", 5, () => `/tiendas/tienda-perf-${1 + Math.floor(random() * Math.max(6, Math.min(80, Math.round(size / 60))))}`],
  ["facets_api", 5, () => `/api/catalog/facets?${new URLSearchParams({ category: pick(categories) })}`],
  ["suggest_api", 5, () => `/api/catalog/suggest?${new URLSearchParams({ q: pick(typed) })}`],
];
const totalWeight = mix.reduce((sum, [, weight]) => sum + weight, 0);
function nextRequest() {
  let roll = random() * totalWeight;
  for (const [name, weight, url] of mix) {
    roll -= weight;
    if (roll <= 0) return [name, url()];
  }
  return [mix[0][0], mix[0][2]()];
}

const samples = {};
const statuses = {};
const errors = {};
let degraded = 0;
const record = (name, ms, status) => {
  (samples[name] ??= []).push(ms);
  (samples.all ??= []).push(ms);
  statuses[status] = (statuses[status] ?? 0) + 1;
};

// Marks a 200 page that rendered a "could not load" notice instead of its data.
const DEGRADED = /No pudimos cargar|Algo salió mal/;

async function worker(until) {
  while (Date.now() < until) {
    const [name, path] = nextRequest();
    const started = performance.now();
    try {
      const response = await fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
      const body = await response.text();
      if (response.status === 200 && DEGRADED.test(body)) degraded += 1;
      record(name, performance.now() - started, response.status);
    } catch (error) {
      const kind = error?.name === "TimeoutError" ? "client_timeout_60s" : error?.cause?.code ?? error?.name ?? "error";
      errors[kind] = (errors[kind] ?? 0) + 1;
      record(name, performance.now() - started, "error");
    }
  }
}

const percentile = (values, p) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]);
};

async function sampleConnections(pg, stop) {
  const series = [];
  const read = async () => {
    const { rows } = await pg.query(`select count(*)::int as total, count(*) filter (where state = 'active')::int as active,
      count(*) filter (where state = 'active' and now() - query_start > interval '2 seconds')::int as long
      from pg_stat_activity where usename = 'authenticator' and backend_type = 'client backend'`);
    return rows[0];
  };
  while (!stop.done) {
    series.push(await read());
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const max = (key) => Math.max(0, ...series.map((row) => row[key]));
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const after = await read();
  return { maxConnections: max("total"), maxActive: max("active"), maxRunningOver2s: max("long"), activeAfter5s: after.active, connectionsAfter5s: after.total };
}

async function main() {
  // Warm-up: one request per kind, not counted.
  for (const [, , url] of mix) await fetch(base + url(), { redirect: "manual", signal: AbortSignal.timeout(60_000) }).then((r) => r.text()).catch(() => {});
  let pg = null;
  const stop = { done: false };
  let connections = null;
  if (args.pg) {
    pg = new Client({ connectionString: args.pg });
    await pg.connect();
    await pg.query("select pg_stat_reset()").catch(() => {});
    connections = sampleConnections(pg, stop);
  }
  let timeouts = null;
  if (pg) timeouts = (await pg.query("select coalesce(sum(xact_rollback), 0)::bigint as rollbacks from pg_stat_database where datname = 'postgres'")).rows[0].rollbacks;
  const started = Date.now();
  await Promise.all(Array.from({ length: concurrency }, () => worker(started + duration)));
  const elapsed = (Date.now() - started) / 1000;
  stop.done = true;
  const pool = connections ? await connections : null;
  let rollbacks = null;
  if (pg) {
    rollbacks = Number((await pg.query("select coalesce(sum(xact_rollback), 0)::bigint as rollbacks from pg_stat_database where datname = 'postgres'")).rows[0].rollbacks) - Number(timeouts);
    await pg.end();
  }
  const routes = Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, { n: values.length, p50: percentile(values, 50), p95: percentile(values, 95), p99: percentile(values, 99), max: Math.round(Math.max(...values)) }]));
  const total = samples.all?.length ?? 0;
  const failed = Object.entries(statuses).filter(([status]) => status === "error" || Number(status) >= 500).reduce((sum, [, n]) => sum + n, 0);
  console.log(JSON.stringify({
    label: args.label ?? null, base, concurrency, seconds: Math.round(elapsed),
    requests: total, perMinute: Math.round((total / elapsed) * 60), failed, failedShare: total ? +(failed / total).toFixed(4) : 0,
    degradedPages: degraded, statuses, errors, routes, database: pool && { ...pool, rolledBackTransactions: rollbacks },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
