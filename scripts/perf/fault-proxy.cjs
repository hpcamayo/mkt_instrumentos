// Local fault injection between the app and its Supabase API stand-in (scripts/prototype/local-gateway.cjs), for the
// load tests in docs/operations/catalog-performance.md. Local only.
//
//   PROXY_PORT=54352 UPSTREAM=http://127.0.0.1:54353 node scripts/perf/fault-proxy.cjs
//   curl "http://127.0.0.1:54352/__fault?mode=hang"        # pass | hang | slow:<ms> | 503 | reset
//   curl "http://127.0.0.1:54352/__fault"                  # counters: requests, open now, max open, aborted by the app
//
// "Open now" counts requests the app has sent and not yet abandoned or received. If the app cancels its reads, a hung
// upstream leaves it at zero once the app's deadlines pass; if not, it grows with every page view.
const http = require("node:http");

const PORT = Number(process.env.PROXY_PORT || 54352);
const UPSTREAM = new URL(process.env.UPSTREAM || "http://127.0.0.1:54353");
let mode = "pass";
let modeSetAt = Date.now();
const stats = { requests: 0, open: 0, maxOpen: 0, abortedByClient: 0, byPath: {} };

http.createServer((request, response) => {
  const url = new URL(request.url, "http://proxy");
  if (url.pathname === "/__fault") {
    if (url.searchParams.has("mode")) {
      mode = url.searchParams.get("mode");
      modeSetAt = Date.now();
      Object.assign(stats, { requests: 0, maxOpen: stats.open, abortedByClient: 0, byPath: {} });
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ mode, ...stats }));
    return;
  }
  stats.requests += 1;
  const key = url.pathname.replace(/^\/rest\/v1\//, "");
  stats.byPath[key] = (stats.byPath[key] ?? 0) + 1;
  stats.open += 1;
  stats.maxOpen = Math.max(stats.maxOpen, stats.open);
  let finished = false;
  const startedAt = Date.now();
  const done = () => {
    if (process.env.TRACE && !finished) console.log(`${String(startedAt - modeSetAt).padStart(6)} ms +${String(Date.now() - startedAt).padStart(5)} ms ${response.writableFinished ? "answered" : "abandoned"} ${key.slice(0, 60)}`);
    if (!finished) {
      finished = true;
      stats.open -= 1;
    }
  };
  response.on("close", () => {
    if (!response.writableFinished) stats.abortedByClient += 1;
    done();
  });

  const forward = () => {
    if (finished) return;
    const upstream = http.request({ host: UPSTREAM.hostname, port: UPSTREAM.port, method: request.method, path: request.url, headers: request.headers }, (reply) => {
      response.writeHead(reply.statusCode, reply.headers);
      reply.pipe(response);
    });
    upstream.on("error", () => response.destroy());
    response.on("close", () => upstream.destroy());
    request.pipe(upstream);
  };

  if (mode === "hang") return; // never answers; only the client can end it
  if (mode === "reset") return request.socket.destroy();
  if (mode === "503") {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ code: "PGRST003", message: "Timed out acquiring connection from connection pool." }));
    return;
  }
  if (mode.startsWith("slow:")) {
    const timer = setTimeout(forward, Number(mode.slice(5)));
    response.on("close", () => clearTimeout(timer));
    return;
  }
  forward();
}).listen(PORT, "127.0.0.1", () => console.log(`Fault proxy on http://127.0.0.1:${PORT} -> ${UPSTREAM.origin}`));
