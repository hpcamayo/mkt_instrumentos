// Runs Effortless Laria acceptance checks and writes one JSON line per case.
//   node scripts/acceptance/ease/run.cjs <checks.cjs ...> [--only=EASE-001,EASE-002] [--results=<file.jsonl>]
// A checks file exports [{ id, live?, server?, timeout?, run: async (t) => { ... } }]. server: "pilot" (payments pilot
// on, PILOT_BASE) or "ai" (next dev with the local AI fake, AI_BASE). With LIVE=1 only cases with live: true run.
// Status: Pass when every t.check held; Fail when one did not or the case threw; Not Run after t.skip(reason) (it needs
// something this run cannot give, such as a phone); Blocked after t.block(reason).
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const h = require("./harness.cjs");

const args = process.argv.slice(2);
const files = args.filter((arg) => !arg.startsWith("--"));
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const only = option("only")?.split(",").map((id) => id.trim()).filter(Boolean);
const RESULTS = option("results") || process.env.RESULTS || path.join(h.OUT, "..", `results-${h.LIVE ? "live" : "local"}.jsonl`);
fs.mkdirSync(h.OUT, { recursive: true });
fs.mkdirSync(path.dirname(RESULTS), { recursive: true });

class Skip extends Error {}

function baseFor(definition) {
  if (definition.server === "pilot") return h.PILOT_BASE;
  if (definition.server === "ai") return h.AI_BASE;
  return h.BASE;
}

function makeT(definition, browser) {
  const base = baseFor(definition);
  const origin = new URL(base).origin;
  const contexts = [];
  const record = { id: definition.id, status: null, checks: [], notes: [], shots: [], blocked: [], problems: [] };
  const t = {
    id: definition.id,
    base,
    live: h.LIVE,
    demo: h.DEMO,
    ...h,
    record,
    note: (text) => record.notes.push(String(text)),
    check(ok, message) {
      record.checks.push({ ok: Boolean(ok), message: String(message) });
      console.log(`  ${ok ? "ok  " : "FAIL"} ${message}`);
      return Boolean(ok);
    },
    skip(reason) {
      record.status = "Not Run";
      record.notes.push(String(reason));
      throw new Skip(reason);
    },
    block(reason) {
      record.status = "Blocked";
      record.notes.push(String(reason));
      throw new Skip(reason);
    },
    url: (route = "/") => `${base}${route}`,
    // A new browser tab in its own context. phone: 390 x 844 with touch; width/height otherwise (1366 x 900).
    async page({ phone = false, width, height, as = null, saveData = false, reducedMotion = "no-preference", offline = false,
      permissions = [], serviceWorkers, javaScript = true, userAgent, colorScheme } = {}) {
      if (h.LIVE && as) throw new Error("live checks never sign in");
      const context = await browser.newContext({
        ...(phone
          ? { viewport: { width: width || 390, height: height || 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
          : { viewport: { width: width || 1366, height: height || 900 } }),
        locale: "es-PE",
        timezoneId: "America/Lima",
        reducedMotion,
        permissions,
        javaScriptEnabled: javaScript,
        serviceWorkers: serviceWorkers || (h.LIVE ? "block" : "allow"),
        ...(userAgent ? { userAgent } : {}),
        ...(colorScheme ? { colorScheme } : {}),
        ...(saveData ? { extraHTTPHeaders: { "Save-Data": "on" } } : {}),
      });
      contexts.push(context);
      await context.route("**/*", async (route) => {
        const request = route.request();
        let url;
        try {
          url = new URL(request.url());
        } catch {
          return route.continue();
        }
        if (h.WHATSAPP.test(url.hostname)) {
          return route.fulfill({ status: 200, contentType: "text/html", body: "<title>WhatsApp (simulado)</title><p>WhatsApp</p>" });
        }
        if (h.LIVE) {
          if (!["GET", "HEAD"].includes(request.method())) {
            record.blocked.push(`${request.method()} ${url.pathname}`);
            return route.abort("blockedbyclient");
          }
          if (url.origin === origin && /^\/(listados|api\/catalog)(\/|$)/.test(url.pathname)) await h.paceCatalog();
        }
        return route.continue();
      });
      if (offline) await context.setOffline(true);
      const page = await context.newPage();
      page.on("pageerror", (error) => record.problems.push(`pageerror ${page.url()} ${error.message.slice(0, 300)}`));
      page.on("console", (message) => {
        if (message.type() === "error") record.problems.push(`console ${page.url()} ${message.text().slice(0, 300)}`);
      });
      if (saveData) {
        // navigator.connection.saveData, as a phone with the data saver on reports it.
        await page.addInitScript(() => {
          const connection = { saveData: true, effectiveType: "3g", downlink: 0.7, rtt: 400, addEventListener() {}, removeEventListener() {} };
          Object.defineProperty(navigator, "connection", { get: () => connection, configurable: true });
        });
      }
      if (as) await t.signIn(page, as);
      return page;
    },
    async goto(page, route = "/", options = {}) {
      await h.paceNavigation();
      return page.goto(route.startsWith("http") ? route : `${base}${route}`, { waitUntil: "load", timeout: 60_000, ...options });
    },
    // Password sign-in through /login; admins (and anyone with an authenticator) also pass the code step.
    async signIn(page, email, { next = "/mi-cuenta" } = {}) {
      if (h.LIVE) throw new Error("live checks never sign in");
      await page.goto(`${base}/login?next=${encodeURIComponent(next)}`, { waitUntil: "load" });
      await page.getByLabel("Correo", { exact: true }).fill(email);
      await page.getByLabel("Contraseña", { exact: true }).fill(h.PASSWORD);
      await page.getByRole("button", { name: "Ingresar", exact: true }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
      await page.waitForLoadState("load");
      // Administración asks for the authenticator code (launch audit A15): pass it once so admin pages open.
      const [user] = h.sql(`select raw_app_meta_data->>'role' as role from auth.users where email = ${h.literal(email)}`);
      if (user?.role === "admin" && !new URL(page.url()).pathname.startsWith("/mi-cuenta/seguridad")) {
        await page.goto(`${base}/admin`, { waitUntil: "load" });
      }
      if (new URL(page.url()).pathname.startsWith("/mi-cuenta/seguridad")) await t.passTwoStep(page, email);
    },
    // The authenticator step: set it up on first use (the secret is on screen), or answer it with the account's factor.
    async passTwoStep(page, email) {
      const code = page.getByLabel("Código de 6 dígitos");
      const setup = page.getByRole("button", { name: "Configurar la verificación" });
      await code.or(setup).first().waitFor({ timeout: 20_000 });
      if (await setup.isVisible()) {
        await setup.click();
        await code.waitFor({ timeout: 20_000 });
      }
      const shown = await page.locator("code").filter({ hasText: /^[A-Z2-7=\s]{16,}$/ }).first().textContent({ timeout: 2_000 }).catch(() => null);
      let secret = shown?.trim();
      if (!secret) {
        const [row] = h.sql(`select f.secret from auth.mfa_factors f join auth.users u on u.id = f.user_id
          where u.email = ${h.literal(email)} order by f.created_at desc limit 1`);
        secret = row?.secret;
      }
      if (!secret) throw new Error("no authenticator secret found for the two-step code");
      await code.fill(h.totp(secret));
      await page.locator("form").filter({ has: code }).getByRole("button").first().click();
      await page.waitForURL((url) => !url.pathname.startsWith("/mi-cuenta/seguridad"), { timeout: 30_000 });
      await page.waitForLoadState("load");
    },
    async shot(page, label, options = {}) {
      const file = path.join(h.OUT, `${definition.id}-${label}.png`.replace(/[^A-Za-z0-9._-]+/g, "-"));
      await page.screenshot({ path: file, ...options });
      record.shots.push(file);
      return file;
    },
    // axe-core, WCAG 2.0 to 2.2 A and AA, on the page as it is. Returns the violations.
    async axe(page, label) {
      if (!(await page.evaluate(() => Boolean(window.axe)))) await page.addScriptTag({ path: h.axePath() });
      const violations = await page.evaluate(async (tags) => {
        const result = await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
        return result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 4).map((n) => n.target.join(" ")) }));
      }, h.WCAG);
      t.note(`axe ${label}: ${violations.length ? violations.map((v) => `${v.id}(${v.nodes}) ${v.targets.join(" | ")}`).join("; ") : "0 violations"}`);
      return violations;
    },
    // Text of the wa.me link a control would open, without opening it.
    whatsappText(href) {
      const url = new URL(href);
      return url.searchParams.get("text") || "";
    },
  };
  return { t, contexts, record };
}

(async () => {
  const definitions = files.flatMap((file) => require(path.resolve(file)));
  const selected = definitions.filter((definition) => (!only || only.includes(definition.id)) && (!h.LIVE || definition.live));
  if (!selected.length) throw new Error("no cases selected");
  const { chromium } = h.loadPlaywright();
  // CHROMIUM_ARGS: extra switches, such as a fake camera and microphone for the cases that record or scan
  // (--use-fake-device-for-media-stream --use-fake-ui-for-media-stream).
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
    ...(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {}),
    args: (process.env.CHROMIUM_ARGS || "").split(/\s+/).filter(Boolean),
  });
  const summary = { Pass: 0, Fail: 0, "Not Run": 0, Blocked: 0 };
  for (const definition of selected) {
    const started = Date.now();
    console.log(`${definition.id}${h.LIVE ? " (live)" : ""}`);
    const { t, contexts, record } = makeT(definition, browser);
    let error = null;
    try {
      await Promise.race([
        definition.run(t),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), definition.timeout || 240_000)),
      ]);
    } catch (caught) {
      if (!(caught instanceof Skip)) error = caught;
    }
    if (error) {
      record.error = `${error.message}`.slice(0, 1000);
      console.log(`  ERROR ${record.error}`);
      for (const context of contexts) {
        for (const page of context.pages()) {
          await t.shot(page, `error-${context.pages().indexOf(page)}`).catch(() => {});
        }
      }
    }
    for (const context of contexts) await context.close().catch(() => {});
    if (!record.status) {
      record.status = error || record.checks.some((c) => !c.ok) || !record.checks.length ? "Fail" : "Pass";
      if (!error && !record.checks.length) record.notes.push("no checks ran");
    }
    Object.assign(record, { base: t.base, live: h.LIVE, at: new Date(started).toISOString(), ms: Date.now() - started });
    fs.appendFileSync(RESULTS, `${JSON.stringify(record)}\n`);
    summary[record.status] += 1;
    console.log(`  => ${record.status} (${Math.round(record.ms / 1000)} s)`);
  }
  await browser.close();
  console.log(JSON.stringify(summary));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
