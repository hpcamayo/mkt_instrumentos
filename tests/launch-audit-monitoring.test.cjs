// Launch audit A13: server and browser errors are counted for Admin > Errores, /api/health tells the uptime check
// whether the site and the database answer, and a GitHub Actions workflow checks the site every 10 minutes. The
// database side is tests/launch-audit-monitoring.sql.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migrationFile = "supabase/migrations/20261114170000_launch_audit_monitoring.sql";
// A later migration adds routes or messages by replacing a list function whole (an applied migration is never edited),
// so the lists are read from the newest migration that defines them.
function newestDefinition(signature) {
  const dir = path.join(root, "supabase/migrations");
  const names = fs.readdirSync(dir).filter((name) => name.endsWith(".sql")).sort().reverse();
  const name = names.find((file) => read(`supabase/migrations/${file}`).includes(`create or replace function ${signature}\n`));
  assert.ok(name, `a migration defines ${signature}`);
  return read(`supabase/migrations/${name}`);
}

function loadModule(filename, mocks = {}) {
  const Module = require("node:module");
  const ts = require("typescript");
  const source = path.join(root, filename);
  const compiled = ts.transpileModule(read(filename), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = new Module(source, module);
  mod.filename = source;
  mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = (name) => (Object.hasOwn(mocks, name) ? mocks[name] : original(name));
  mod._compile(compiled, source);
  return mod.exports;
}

const nextServer = {
  NextResponse: class extends Response {
    static json(body, init = {}) {
      return new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
    }
  },
};

async function withGlobals(values, run) {
  const saved = new Map(Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  try {
    return await run();
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

async function withEnv(values, run) {
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  instagramIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 354.0.0.29.90 (iPhone15,3; iOS 18_1; es_PE)",
  facebookAndroid: "Mozilla/5.0 (Linux; Android 13; moto g84) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/487.0.0.43.109;]",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
};

test("A13: the browser family and platform come from the User-Agent, never the User-Agent itself", () => {
  const { browserFamily } = loadModule("lib/monitoring/record-error.ts");
  assert.equal(browserFamily(UA.iphoneSafari), "Safari iOS");
  assert.equal(browserFamily(UA.androidChrome), "Chrome Android");
  assert.equal(browserFamily(UA.instagramIphone), "Instagram iOS");
  assert.equal(browserFamily(UA.facebookAndroid), "Facebook Android");
  assert.equal(browserFamily(UA.samsung), "Samsung Internet Android");
  assert.equal(browserFamily(UA.firefox), "Firefox");
  assert.equal(browserFamily(UA.edge), "Edge");
  assert.equal(browserFamily(UA.macSafari), "Safari");
  assert.equal(browserFamily("curl/8.5.0"), "Otro");
  assert.equal(browserFamily(null), "Otro");
  // The database accepts letters and spaces only (public.record_app_error).
  for (const agent of Object.values(UA)) assert.match(browserFamily(agent), /^[A-Za-z][A-Za-z ]{0,39}$/);
});

test("A13: an error is posted to PostgREST with the service role, trimmed, and a failure never throws", async () => {
  const { recordAppError } = loadModule("lib/monitoring/record-error.ts");
  const report = { source: "server", kind: "render", route: "/listados/[id]", name: "TypeError", message: "x".repeat(5000), digest: "1234567890" };
  const calls = [];
  await withEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://db.example.test/", SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-tests" }, async () => {
    await withGlobals({ fetch: async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify("f"), { status: 200 }); } }, async () => {
      assert.equal(await recordAppError(report), true);
    });
    const [{ url, init }] = calls;
    assert.equal(url, "https://db.example.test/rest/v1/rpc/record_app_error");
    assert.equal(init.method, "POST");
    assert.equal(init.headers.apikey, "service-role-key-for-tests");
    assert.equal(init.headers.authorization, "Bearer service-role-key-for-tests");
    assert.ok(init.signal instanceof AbortSignal, "it gives up after a timeout");
    const body = JSON.parse(init.body);
    assert.deepEqual(Object.keys(body).sort(), ["p_client", "p_digest", "p_kind", "p_message", "p_name", "p_route", "p_source"]);
    assert.equal(body.p_message.length, 2000);
    assert.deepEqual([body.p_source, body.p_kind, body.p_route, body.p_name, body.p_client, body.p_digest], ["server", "render", "/listados/[id]", "TypeError", "", "1234567890"]);
    // Next.js's wrapped fetch is never used: inside a page refresh it would turn the page dynamic.
    const wrapped = Object.assign(async () => { throw new Error("Next.js's fetch must not be used"); }, { _nextOriginalFetch: async () => new Response("\"f\"", { status: 200 }) });
    await withGlobals({ fetch: wrapped }, async () => {
      assert.equal(await recordAppError(report), true);
    });
    await withGlobals({ fetch: async () => { throw new Error("offline"); } }, async () => {
      assert.equal(await recordAppError(report), false);
    });
    await withGlobals({ fetch: async () => new Response("{}", { status: 404 }) }, async () => {
      assert.equal(await recordAppError(report), false, "before the migration, PostgREST answers 404");
    });
  });
  await withEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined }, async () => {
    await withGlobals({ fetch: async () => { throw new Error("must not be called"); } }, async () => {
      assert.equal(await recordAppError(report), false, "local builds and tests send nothing");
    });
  });
});

test("A13: a server error is counted under its route pattern, after the response when the request can wait, never in a build", async () => {
  const recorded = [];
  let release;
  const load = () => loadModule("lib/monitoring/server-errors.ts", {
    "@/lib/monitoring/record-error": { recordAppError: (report) => { recorded.push(report); return new Promise((resolve) => { release = resolve; }); } },
  });
  const context = { routerKind: "App Router", routePath: "/listados/[id]", routeType: "render", renderSource: "react-server-components", revalidateReason: undefined };
  const error = Object.assign(new TypeError("Cannot read properties of null (reading 'price')"), { digest: "2876543210" });

  const waited = [];
  const key = Symbol.for("@next/request-context");
  await withGlobals({}, async () => {
    globalThis[key] = { get: () => ({ waitUntil: (promise) => waited.push(promise) }) };
    try {
      await load().recordServerError(error, context);
    } finally {
      delete globalThis[key];
    }
  });
  assert.equal(waited.length, 1, "the count is saved after the response");
  assert.deepEqual(recorded[0], { source: "server", kind: "render", route: "/listados/[id]", name: "TypeError", message: "Cannot read properties of null (reading 'price')", digest: "2876543210" });
  release(true);

  // Without a request context it waits for the save itself.
  let finished = false;
  const saving = load().recordServerError("a thrown string", { ...context, routeType: "route", routePath: "/api/contact" }).then(() => { finished = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(finished, false);
  release(true);
  await saving;
  assert.deepEqual(recorded[1], { source: "server", kind: "route", route: "/api/contact", name: "Error", message: "a thrown string", digest: null });

  await withEnv({ NEXT_PHASE: "phase-production-build" }, async () => {
    await load().recordServerError(error, context);
  });
  assert.equal(recorded.length, 2, "a build's prerender records nothing");

  const instrumentation = read("instrumentation.ts");
  assert.match(instrumentation, /export const onRequestError: Instrumentation\.onRequestError = async \(error, _request, context\) =>/);
  assert.match(instrumentation, /await import\("\.\/lib\/monitoring\/server-errors"\)/, "loaded on the first error only");
  assert.doesNotMatch(read("lib/monitoring/server-errors.ts") + read("lib/monitoring/record-error.ts"), /import "server-only"|getSupabaseAdminClient/,
    "plain fetch and no server-only import: the middleware's runtime loads it too");
  assert.doesNotMatch(read("lib/monitoring/server-errors.ts"), /\.path\b|\.headers\b/, "never the address or the request's headers");
});

test("A13: the browser reporter sends at most five reports a page, each once, and leaves out noise and server errors", async () => {
  const location = { href: "https://laria.audio/listados?q=juan", origin: "https://laria.audio", pathname: "/listados" };
  const sent = [];
  await withGlobals({ window: { location }, fetch: async (url, init) => { sent.push({ url, init }); return new Response(null, { status: 204 }); } }, async () => {
    const { reportClientError } = loadModule("lib/monitoring/client-errors.ts");
    reportClientError("error", new TypeError("x is undefined"), "https://laria.audio/_next/static/chunks/app/page.js");
    reportClientError("error", new TypeError("x is undefined"), "https://laria.audio/_next/static/chunks/app/page.js");
    assert.equal(sent.length, 1, "each error once");
    assert.equal(sent[0].url, "/api/client-errors");
    assert.equal(sent[0].init.keepalive, true);
    assert.deepEqual(JSON.parse(sent[0].init.body), { kind: "error", name: "TypeError", message: "x is undefined", route: "/listados" });

    reportClientError("error", new Error("injected"), "chrome-extension://abcdef/content.js");
    reportClientError("error", "Script error.", "");
    reportClientError("error", new Error("ResizeObserver loop completed with undelivered notifications."));
    reportClientError("unhandledrejection", new TypeError("Failed to fetch"));
    reportClientError("unhandledrejection", new TypeError("Load failed"));
    reportClientError("unhandledrejection", Object.assign(new Error("The user aborted a request."), { name: "AbortError" }));
    reportClientError("boundary", Object.assign(new Error("An error occurred in the Server Components render."), { digest: "2876543210" }));
    assert.equal(sent.length, 1, "noise and errors the server counted send nothing");

    reportClientError("unhandledrejection", { message: "JWT expired", code: "PGRST301" });
    assert.equal(JSON.parse(sent[1].init.body).message, "JWT expired (PGRST301)");
    reportClientError("boundary", new RangeError("Invalid time value"));
    assert.equal(JSON.parse(sent[2].init.body).kind, "boundary");
    for (let n = 0; n < 6; n += 1) reportClientError("error", new Error(`error ${n}`));
    assert.equal(sent.length, 5, "five reports a page at most");
  });

  await withGlobals({ window: { location }, fetch: () => Promise.reject(new Error("offline")) }, async () => {
    const { reportClientError } = loadModule("lib/monitoring/client-errors.ts");
    assert.doesNotThrow(() => reportClientError("error", new Error("x")));
    await new Promise((resolve) => setImmediate(resolve));
  });
  await withGlobals({ window: undefined, fetch: () => { throw new Error("unreachable"); } }, async () => {
    const { reportClientError } = loadModule("lib/monitoring/client-errors.ts");
    assert.doesNotThrow(() => reportClientError("error", new Error("x")), "reporting never throws");
  });
});

test("A13: /api/client-errors takes only small, well-formed reports from Laria's pages, at most 30 a visitor every 10 minutes", async () => {
  const realRecord = loadModule("lib/monitoring/record-error.ts");
  const recorded = [];
  let verdict = "allowed";
  const rules = [];
  const route = loadModule("app/api/client-errors/route.ts", {
    "next/server": nextServer,
    "@/lib/rate-limit": { RATE_LIMITS: { clientErrors: { bucket: "app.client_errors", limit: 30, windowSeconds: 600 } }, checkRequest: async (rule) => { rules.push(rule); return verdict; } },
    "@/lib/monitoring/record-error": { ...realRecord, recordAppError: async (report) => { recorded.push(report); return true; } },
  });
  const post = (body, headers = {}) => route.POST(new Request("https://laria.audio/api/client-errors", {
    method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "user-agent": UA.iphoneSafari, ...headers },
  }));
  const report = { kind: "error", name: "TypeError", message: "x is undefined", route: "/listados/guitarra?q=juan#arriba" };

  assert.equal((await post(report)).status, 204);
  assert.deepEqual(recorded[0], { source: "browser", kind: "error", name: "TypeError", message: "x is undefined", route: "/listados/guitarra", client: "Safari iOS" });
  assert.deepEqual(rules[0], { bucket: "app.client_errors", limit: 30, windowSeconds: 600 });
  for (const bad of ["no es json", "[]", { ...report, kind: "warning" }, { ...report, route: "https://evil.example/" }, { ...report, message: 42 }]) {
    assert.equal((await post(bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await post({ ...report, message: "x".repeat(5000) })).status, 413);
  assert.equal((await post(report, { "content-length": "5000" })).status, 413);
  verdict = "limited";
  assert.equal((await post(report)).status, 429);
  verdict = "unavailable";
  assert.equal((await post(report)).status, 204, "a counter that can't count lets the report through");
  assert.equal(recorded.length, 2);

  const { isRefusedCrossSiteApiWrite } = require("@/lib/same-origin");
  const crossSite = new Request("https://laria.audio/api/client-errors", { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } });
  assert.equal(isRefusedCrossSiteApiWrite(crossSite, "/api/client-errors"), true, "another site can't send reports (A22)");
  assert.match(read("lib/rate-limit.ts"), /clientErrors: \{ bucket: "app\.client_errors", limit: 30, windowSeconds: 600 \}/);
});

test("A13: /api/health answers ok or degraded with a reason only, and asks the database at most every 15 seconds", async () => {
  const load = (answer) => {
    const calls = [];
    const admin = answer === null ? null : {
      rpc: (name) => {
        calls.push(name);
        return { abortSignal: (signal) => { assert.ok(signal instanceof AbortSignal); return typeof answer === "function" ? answer() : Promise.resolve(answer); } };
      },
    };
    const route = loadModule("app/api/health/route.ts", { "next/server": nextServer, "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => admin } });
    return { route, calls };
  };
  const answer = async (route) => {
    const response = await route.GET();
    return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
  };

  const healthy = load({ data: { server_errors: 19 }, error: null });
  assert.deepEqual(await answer(healthy.route), { status: 200, body: { status: "ok" }, cache: "no-store" });
  await answer(healthy.route);
  assert.deepEqual(healthy.calls, ["get_app_health"], "one database check for both calls");
  assert.deepEqual(await answer(load({ data: { server_errors: 20 }, error: null }).route), { status: 503, body: { status: "degraded", reason: "errors" }, cache: "no-store" });
  for (const failing of [{ data: null, error: { message: "timeout" } }, { data: "x", error: null }, null, () => Promise.reject(new Error("AbortError"))]) {
    assert.deepEqual(await answer(load(failing).route), { status: 503, body: { status: "degraded", reason: "database" }, cache: "no-store" });
  }
  assert.match(read("app/api/health/route.ts"), /export const dynamic = "force-dynamic";/);
});

test("A13: the uptime workflow checks the four addresses every 10 minutes with read-only access and a public-safe log", () => {
  const workflow = read(".github/workflows/uptime.yml");
  assert.match(workflow, /schedule:\n\s+- cron: "\*\/10 \* \* \* \*"\n\s+workflow_dispatch:/);
  assert.match(workflow, /permissions:\n\s+contents: read\n/);
  assert.match(workflow, /SITE: https:\/\/laria\.audio\n/);
  for (const line of ['check "/" "</html>"', 'check "/listados" "</html>"', 'check "/api/catalog/suggest?q=guitarra" "["', `check "/api/health" '"status":"ok"'`]) {
    assert.ok(workflow.includes(line), line);
  }
  assert.match(workflow, /--max-time 15/);
  assert.match(workflow, /! grep -qF "Algo salió mal" body\.txt/, "an error page with status 200 fails too");
  assert.match(workflow, /if \[ "\$attempt" = 1 \]; then sleep 20; fi/, "a second try before failing");
  assert.match(workflow, /exit "\$failed"/);
  assert.doesNotMatch(workflow, /secrets\.|cat body|\$\{\{ github\.token/, "no secret and no page content in the public log");
  assert.match(workflow, /if \[ "\$path" = "\/api\/health" \] && \[ -f body\.txt \]; then reason=" \$\(head -c 120 body\.txt\)"; fi/, "only the health reason is printed");
  // The User-Agent is none the catalog guard blocks (lib/catalog-crawlers.ts).
  const { blocksCatalogCrawler } = require("@/lib/catalog-crawlers");
  assert.equal(blocksCatalogCrawler("/listados", "LariaUptime/1.0 (+https://github.com/hpcamayo/mkt_instrumentos)"), false);
});

test("A13: the root layout mounts the reporter, the error pages report, and Admin lists the errors", async () => {
  assert.match(read("app/layout.tsx"), /<ServiceWorkerRegistration \/>\n\s+\{\/\* A13: [^*]+\*\/\}\n\s+<ErrorReporter \/>\n\s+<\/body>/);
  for (const file of ["app/error.tsx", "app/admin/error.tsx"]) {
    assert.match(read(file), /console\.error\(error\);\n\s+reportClientError\("boundary", error\);/, file);
  }
  assert.match(read("components/error-reporter.tsx"), /window\.addEventListener\("error", onError\);\n\s+window\.addEventListener\("unhandledrejection", onRejection\);/);
  assert.match(read("components/admin-navigation.tsx"), /\{ href: "\/admin\/errores", label: "Errores" \}/);

  const { parseAppErrors, appErrorKindLabel } = loadModule("lib/monitoring/admin-errors.ts");
  const row = { fingerprint: "f1", source: "server", kind: "render", route: "/listados/[id]", name: "TypeError", message: "Cannot read properties of null (reading 'price') for <email>", client: "", digest: "2876543210", occurrences: 5, first_at: "2026-10-25T14:00:00+00:00", last_at: "2026-10-27T15:04:00+00:00" };
  assert.deepEqual(parseAppErrors([row, { ...row, source: "ios" }, { ...row, occurrences: "5" }, null, "x"]), [row]);
  assert.deepEqual(parseAppErrors(null), []);
  assert.equal(appErrorKindLabel("render"), "Página");
  assert.equal(appErrorKindLabel("unhandledrejection"), "Promesa sin respuesta");
  assert.equal(appErrorKindLabel("nuevo"), "nuevo");

  const calls = [];
  const render = async (query, answer) => {
    const supabase = { rpc: async (name, args) => { calls.push({ name, args }); return answer; } };
    const page = loadModule("app/admin/errores/page.tsx", {
      "@/lib/admin-server": { requireAdmin: async (next) => { assert.equal(next, "/admin/errores"); return { supabase }; } },
      "@/components/ui/chip": { ChipLink: ({ href, selected, children }) => React.createElement("a", { href, "aria-current": selected ? "page" : undefined }, children) },
    });
    return renderToStaticMarkup(await page.default({ searchParams: Promise.resolve(query) }));
  };
  const html = await render({}, { data: [row, { ...row, fingerprint: "f2", source: "browser", kind: "error", route: "/tiendas/la-casa", client: "Safari iOS", digest: null, occurrences: 1 }], error: null });
  assert.deepEqual(calls[0], { name: "get_admin_app_errors", args: { p_days: 7 } });
  assert.match(html, /2 tipos de error, 6 veces en total\./);
  assert.match(html, /Servidor/);
  assert.match(html, /Página/);
  assert.match(html, /5 veces/);
  assert.match(html, /Código en los registros de Vercel: <\/dt><dd[^>]*>2876543210/);
  assert.match(html, /Safari iOS/);
  assert.match(html, /<a href="\/admin\/errores\?origen=servidor" aria-current="page">|<a href="\/admin\/errores" aria-current="page">Todos/);
  assert.match(html, /<time dateTime="2026-10-27T15:04:00\+00:00">27 oct\.? 2026, 10:04/, "Lima time");

  await render({ origen: "navegador", dias: "30" }, { data: [], error: null });
  assert.deepEqual(calls[1].args, { p_days: 30, p_source: "browser" });
  await render({ origen: "otro", dias: "90" }, { data: [], error: null });
  assert.deepEqual(calls[2].args, { p_days: 7 }, "an unknown filter falls back to all, 7 days");
  assert.match(await render({}, { data: [], error: null }), /No hay errores en este periodo/);
  assert.match(await render({}, { data: null, error: { message: "ADMIN_MFA_REQUIRED" } }), /No pudimos cargar los errores/);
});

test("A13: the migration keeps its place and lock step, and grants each function only where it is meant", () => {
  const migration = read(migrationFile);
  assert.ok(path.basename(migrationFile) < "20261201000000", "below the features/marketplace migrations");
  assert.ok(path.basename(migrationFile) > "20261114160000", "after the e-mail backlog fix (A25)");
  assert.match(migration, /^set lock_timeout = '10s';$/m);
  assert.match(migration, /^reset lock_timeout;$/m);
  assert.match(migration, /grant execute on function public\.record_app_error\(text, text, text, text, text, text, text\) to service_role;/);
  assert.match(migration, /revoke all on function public\.record_app_error\(text, text, text, text, text, text, text\) from public, anon, authenticated;/);
  assert.match(migration, /revoke all on function public\.get_app_health\(\) from public, anon, authenticated;/);
  assert.match(migration, /perform laria_private\.assert_admin\(\);/);
  assert.match(migration, /select cron\.schedule\('app-error-retention', '50 9 \* \* \*', \$\$select laria_private\.run_app_error_retention\(\)\$\$\);/);
});

test("A13: a message is kept only as one of the site's own or a known message, from the server as from a browser", () => {
  const migration = read(migrationFile);
  // Codex's third review: replacing what may identify someone in a server's message left gaps, so nothing is kept as
  // written any more; the suite checks the messages themselves (tests/launch-audit-monitoring.sql).
  assert.doesNotMatch(migration, /scrub_error_text|app_error_browser_message/);
  assert.match(migration, /\n  v_message text := laria_private\.app_error_message\(p_message\);\n/);
  assert.match(migration, /v_fingerprint := md5\(concat_ws\(chr\(31\), p_source, v_kind, case when p_source = 'server' then v_route else '' end,\n    v_name, v_message, v_client\)\);/);
  const messages = newestDefinition("laria_private.app_error_own_messages()");
  const start = messages.indexOf("select array[", messages.indexOf("create or replace function laria_private.app_error_own_messages()"));
  const body = messages.slice(start + "select array[".length, messages.indexOf("]::text[]", start));
  const own = [...body.matchAll(/'((?:[^']|'')*)'/g)].map((match) => match[1].replaceAll("''", "'"));
  assert.ok(own.length > 700, `the site's own messages (${own.length})`);
  assert.equal(new Set(own).size, own.length, "each once");
  for (const message of own) {
    assert.ok(message === message.trim() && !/\s\s|[\u0000-\u001f]/.test(message) && message.length <= 300, message);
  }
  for (const message of ["STOCK_INSUFFICIENT", "EMAIL_CLAIM_OUTDATED", "APP_ERROR_INVALID", "Supabase unavailable", "EMAIL_CLAIM_FAILED"]) {
    assert.ok(own.includes(message), message);
  }
  // React keeps a number only when it is one of its own codes, whole.
  const react = migration.match(/\(\d+, '\^Minified React error #\(([0-9|]+)\)\(\?!\[0-9\]\)',\n\s+'Minified React error #\\1'\),\n\s+\(\d+, '\^Minified React error #',\n\s+'Minified React error #…'\)/);
  assert.ok(react, "the React codes, then the rest as #…");
  const codes = react[1].split("|");
  assert.ok(codes.length > 100 && codes.every((code) => /^[1-9][0-9]{0,2}$/.test(code)) && codes.includes("418"), "React's codes");
});

test("A13: every page and route of the site is in the database's list of route patterns, and every browser family in its client list", () => {
  const migration = read(migrationFile);
  const patterns = newestDefinition("laria_private.app_error_route_patterns()");
  const start = patterns.indexOf("select array[", patterns.indexOf("create or replace function laria_private.app_error_route_patterns()"));
  const listed = [...patterns.slice(start, patterns.indexOf("]::text[]", start)).matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.ok(listed.length > 200 && listed.includes("/tiendas/[slug]"), "the database's list of route patterns");
  assert.equal(new Set(listed).size, listed.length, "each pattern once");
  for (const pattern of listed) assert.match(pattern, /^\/$|^(\/[A-Za-z0-9_.\-[\]]+)+$/, pattern);
  // Every page and route file under app/ and every metadata file, as its address reads: no (group), @slot or _private
  // folder, nor what is inside a private one.
  const routes = new Set();
  const metadata = { robots: "/robots.txt", sitemap: "/sitemap.xml", manifest: "/manifest.webmanifest" };
  const walk = (dir, address) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith("_")) continue;
        walk(path.join(dir, entry.name), /^(\(.*\)|@.+)$/.test(entry.name) ? address : `${address}/${entry.name}`);
        continue;
      }
      const base = entry.name.replace(/\.(tsx?|jsx?)$/, "");
      if (base === entry.name) {
        if (address === "" && /^(icon|apple-icon)\.(svg|png|ico|jpg)$/.test(entry.name)) routes.add(`/${entry.name}`);
      } else if (base === "page" || base === "route") routes.add(address || "/");
      else if (base === "opengraph-image" || base === "twitter-image") routes.add(`${address}/${base}`);
      else if (address === "" && metadata[base]) routes.add(metadata[base]);
    }
  };
  walk("app", "");
  assert.ok(routes.has("/") && routes.has("/listados") && routes.has("/tiendas/[slug]") && routes.has("/robots.txt") && routes.size > 100);
  assert.deepEqual([...routes].filter((route) => !listed.includes(route)).sort(), [], "add these to laria_private.app_error_route_patterns()");

  // The browser families lib/monitoring/record-error.ts gives, with and without a platform, all pass the database's list.
  const client = migration.match(/p_client ~ '(\^\([^']+\)\( iOS\| Android\)\?\$)' or p_client = 'Otro'/);
  assert.ok(client, "the database's list of browser families");
  const recorder = read("lib/monitoring/record-error.ts");
  const chain = recorder.slice(recorder.indexOf("const name = /Instagram/"), recorder.indexOf(': "";', recorder.indexOf("const name = /Instagram/")));
  const families = [...chain.matchAll(/\? "([^"]+)"/g)].map((match) => match[1]);
  assert.equal(families.length, 9);
  for (const family of families) {
    for (const label of [family, `${family} iOS`, `${family} Android`]) assert.match(label, new RegExp(client[1]), label);
  }
  const { browserFamily } = loadModule("lib/monitoring/record-error.ts");
  for (const agent of [...Object.values(UA), "curl/8.4.0", null]) {
    const label = browserFamily(agent);
    assert.ok(new RegExp(client[1]).test(label) || label === "Otro", `${label} is kept`);
  }
});
