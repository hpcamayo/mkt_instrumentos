#!/usr/bin/env node
// Use localhost consistently: local Next middleware redirects also use that host.
// Anonymous hydration regression on a LOCAL compiled production build. No forms are submitted.
// Usage: LARIA_PLAYWRIGHT_MODULE=<module path> LARIA_CHROME_EXECUTABLE=<optional path> \
//   node scripts/ux-auth-hydration-smoke.cjs http://localhost:3013 [trials per width=10]
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require(process.env.LARIA_PLAYWRIGHT_MODULE || "playwright");
const target = new URL(process.argv[2] || "http://localhost:3000");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname), "Local builds only.");
const trials = Number(process.argv[3] || 10);
assert.ok(Number.isInteger(trials) && trials > 0 && trials <= 50, "Use 1–50 trials per width.");
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "laria-auth-hydration-"));
const results = [];
const signedOut = { authenticated: false, storeOwner: false, hasStore: false, admin: false, name: null, unreadNotifications: 0, pendingBuyerConfirmations: 0 };
const routes = ["/login", "/registro/vendedor", "/registro/tienda"];
(async () => {
  // A streaming fallback can hide a server redirect/404 behind HTTP 200 even when the browser reaches its destination.
  const http = [];
  for (const [route, status, location] of [
    ["/instrumentos/baterias", 308, "/listados?category=percussion&instrument_type=drums"],
    ["/instrumentos/platillos", 308, "/listados?category=percussion&instrument_type=cymbals"],
    ["/instrumentos/interfaces-de-audio", 308, "/listados?category=audio&instrument_type=audio_interface"],
    ["/publicar", 307, "/vender"],
    ["/ruta-inexistente-del-gate-de-hidratacion", 404, null],
  ]) {
    const response = await fetch(new URL(route, target), { method: "GET", redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (Laria hydration regression)" } });
    const destination = response.headers.get("location");
    http.push({ route, status: response.status, location: destination });
    fs.writeFileSync(path.join(artifacts, "http.json"), JSON.stringify(http, null, 2));
    assert.equal(response.status, status, `${route}: HTTP status before hydration`);
    if (location) assert.equal(new URL(destination, target).href, new URL(location, target).href, `${route}: redirect target`);
  }
  console.log(JSON.stringify({ http }));
  const browser = await chromium.launch({ headless: true, ...(process.env.LARIA_CHROME_EXECUTABLE ? { executablePath: process.env.LARIA_CHROME_EXECUTABLE } : {}) });
  try {
    for (const width of [390, 1440]) {
      for (let trial = 0; trial < trials; trial++) {
        const mode = ["normal", "instant-account", "delayed-account", "delayed-js"][trial % 4];
        const row = { width, trial: trial + 1, mode, pages: [], errors: [], console: [], blocked: [], failures: [] };
        const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "es-PE", serviceWorkers: "block" });
        await context.route("**/*", async interception => {
          const request = interception.request();
          const url = new URL(request.url());
          if (!["GET", "HEAD"].includes(request.method()) || url.origin !== target.origin) {
            row.blocked.push({ method: request.method(), url: request.url() });
            return interception.abort("blockedbyclient");
          }
          if (url.pathname === "/api/account-navigation" && mode === "instant-account") {
            return interception.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(signedOut) });
          }
          if ((url.pathname === "/api/account-navigation" && mode === "delayed-account") || (/\.js$/.test(url.pathname) && mode === "delayed-js")) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          return interception.continue();
        });
        const page = await context.newPage();
        page.on("pageerror", error => row.errors.push({ url: page.url(), message: error.message, stack: error.stack }));
        page.on("console", message => {
          if (message.type() === "error") row.console.push({ url: page.url(), message: message.text(), location: message.location() });
        });
        page.on("requestfailed", request => row.failures.push({ url: request.url(), method: request.method(), prefetch: request.headers()["next-router-prefetch"] === "1", message: request.failure()?.errorText }));
        try {
          // Warm the shared shell and assets before reproducing full-document auth navigation.
          for (const route of ["/terminos", "/privacidad", ...routes]) {
            const response = await page.goto(new URL(route, target).href, { waitUntil: "networkidle", timeout: 60000 });
            assert.equal(response.status(), 200, route);
            await page.waitForTimeout(300);
            assert.equal(await page.locator("main").count(), 1, route);
            assert.equal(await page.locator("h1").count(), 1, route);
            if (routes.includes(route)) {
              await page.waitForFunction(() => {
                const submit = document.querySelector('main form button[type="submit"]');
                return submit && !submit.disabled;
              }, null, { timeout: 15000 });
              await page.locator('header a[href="/login"]').filter({ hasText: "Ingresar" }).waitFor({ state: "visible" });
              assert.equal(await page.locator('main input[type="email"]').count(), 1, route);
            }
            row.pages.push({ route, status: response.status() });
          }
          assert.deepEqual(row.errors, [], "Browser page errors.");
          const unexpectedConsole = row.console.filter(item => {
            const prefetch = item.message.match(/^Failed to fetch RSC payload for (\S+)\. Falling back/);
            const resource = item.location?.url;
            return !row.failures.some(failure => {
              const canceled = /ERR_ABORTED|ERR_FAILED/.test(failure.message);
              if (prefetch) return failure.prefetch && canceled && new URL(failure.url).pathname === new URL(prefetch[1]).pathname;
              return /^Failed to load resource:/.test(item.message) && resource === failure.url &&
                ((failure.prefetch && canceled) || /ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(failure.message));
            });
          });
          assert.deepEqual(unexpectedConsole, [], "Unexpected console errors.");
          // Full-document navigation cancels Next prefetches; retain them as evidence, never count them as page failures.
          const unexpectedFailures = row.failures.filter(item => !item.prefetch && !/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(item.message));
          assert.deepEqual(unexpectedFailures, [], "Unexpected failed GET.");
        } catch (error) {
          row.failure = error.message;
          await page.screenshot({ path: path.join(artifacts, `${width}-${trial + 1}.png`), fullPage: true }).catch(() => {});
        } finally {
          results.push(row);
          fs.writeFileSync(path.join(artifacts, "results.json"), JSON.stringify(results, null, 2));
          console.log(JSON.stringify({ width, trial: trial + 1, mode, pages: row.pages.length, errors: row.errors.length, failure: row.failure }));
          await context.close();
        }
      }
    }
  } finally { await browser.close(); }
  const failed = results.filter(row => row.failure);
  console.log(`${results.length - failed.length}/${results.length} contexts passed; evidence: ${artifacts}`);
  process.exitCode = failed.length ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
