#!/usr/bin/env node
// UX accessibility and shell audit (docs/ux-redesign/review-guide.md). Reproduces the numbers in
// docs/ux-redesign/ux-2-acceptance.md with the same browser as the screenshot harness (agent-browser, decision D10).
//
//   node scripts/ux-audit.cjs --base http://localhost:3100 --axe /path/to/axe-core/axe.min.js
//
// Per template (including 404s inside Admin), width and account: axe-core (WCAG 2.1 A/AA tags), a focus sweep (every visible focusable element
// must show a 2 px outline when focused after a keyboard event), the skip link (first Tab, lands on <main>), Tab order
// inside the header and the category strip (left to right, row by row), one <main> and one <h1>, and horizontal
// overflow. Then axe with each shell menu open, overflow at 640 / 720 px (200% zoom of 1280 / 1440), and layout shift.
//
// Options:
//   --base <url>          App origin (default http://localhost:3000)
//   --axe <path>          axe.min.js (axe-core 4.11.x); or LARIA_AXE_PATH. Not a project dependency (D10).
//   --label <name>        Output: .ux-snapshots/<label>/audit.json (default: a timestamp)
//   --widths <list>       Template widths (default 390,1440)
//   --error-route <path>  A route that throws, to audit the 500 page (see the review guide; never commit it)
//   --allow-remote        Allow a non-local base URL
// Accounts: .ux-accounts.local.json (scripts/ux-local-accounts.cjs). Browser: agent-browser on PATH or LARIA_AGENT_BROWSER_BIN.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const base = option("base", "http://localhost:3000").replace(/\/$/, "");
const label = option("label", new Date().toISOString().replace(/[:.]/g, "-"));
const widths = option("widths", "390,1440").split(",").map(Number);
const errorRoute = option("error-route", null);
const axePath = option("axe", process.env.LARIA_AXE_PATH);
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(base).hostname) && !args.includes("--allow-remote")) {
  throw new Error(`Refusing to audit ${base}: pass --allow-remote for a preview deployment.`);
}
if (!axePath || !fs.existsSync(axePath)) throw new Error("Pass --axe <path to axe.min.js> or set LARIA_AXE_PATH.");
const axeSource = fs.readFileSync(axePath, "utf8");
const browser = process.env.LARIA_AGENT_BROWSER_BIN ?? "agent-browser";
const accountsFile = process.env.LARIA_UX_ACCOUNTS ?? path.join(process.cwd(), ".ux-accounts.local.json");
const accounts = fs.existsSync(accountsFile) ? JSON.parse(fs.readFileSync(accountsFile, "utf8")) : {};

function run(session, ...command) {
  const result = spawnSync(browser, ["--session", session, "--json", ...command], { encoding: "utf8", timeout: 90000, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`agent-browser ${command[0]} failed: ${result.error?.message || result.stderr || result.stdout}`);
  const parsed = JSON.parse(result.stdout.trim().split("\n").pop());
  if (!parsed.success) throw new Error(parsed.error ?? `agent-browser ${command[0]} failed`);
  return parsed.data;
}
const evaluate = (session, js) => run(session, "eval", js).result;
const load = (session, url) => { run(session, "open", `${base}${url}`); run(session, "wait", "--load", "networkidle"); run(session, "wait", "600"); };
function signIn(session, account) {
  run(session, "open", `${base}/login`);
  const status = evaluate(session, `fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${JSON.stringify({ email: account.email, password: account.password })}) }).then((r) => r.status)`);
  if (status !== 200) throw new Error(`Sign-in failed for ${account.email} (HTTP ${status}).`);
}

const AXE = "axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }).then((r) => JSON.stringify(r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5) }))))";
const SWEEP = `(() => {
  const selector = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]') && !el.disabled; };
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.id || el.tagName).trim().slice(0, 30);
  const items = [...document.querySelectorAll(selector)].filter(visible);
  const missing = [];
  for (const el of items) {
    el.focus();
    const s = getComputedStyle(el);
    if (document.activeElement !== el || s.outlineStyle === 'none' || parseFloat(s.outlineWidth) < 2) missing.push(name(el));
  }
  document.activeElement?.blur?.();
  const shell = [...document.querySelectorAll('header, nav[aria-label="Categorías"]')].flatMap((region) => [...region.querySelectorAll(selector)].filter(visible));
  const order = [];
  for (let i = 1; i < shell.length; i += 1) {
    const a = shell[i - 1].getBoundingClientRect(), b = shell[i].getBoundingClientRect();
    const sameRow = Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 12;
    if ((sameRow && b.left < a.left) || (!sameRow && b.top < a.top)) order.push(name(shell[i - 1]) + ' -> ' + name(shell[i]));
  }
  return JSON.stringify({ focusables: items.length, missing, order, overflow: document.documentElement.scrollWidth > innerWidth, mains: document.querySelectorAll('main').length, h1: document.querySelectorAll('h1').length });
})()`;
const CLS = "new Promise((resolve) => { let total = 0; new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) total += e.value; }).observe({ type: 'layout-shift', buffered: true }); setTimeout(() => resolve(Number(total.toFixed(4))), 1500); })";

async function discover() {
  const xml = await (await fetch(`${base}/sitemap.xml`)).text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
  const categories = new Set(["guitarras", "bajos", "baterias", "platillos", "microfonos", "pedales", "amplificadores", "interfaces-de-audio"]);
  return {
    listing: paths.find((url) => url.startsWith("/instrumentos/") && !categories.has(url.split("/")[2])),
    store: paths.find((url) => url.startsWith("/tiendas/")),
  };
}

(async () => {
  const { listing, store } = await discover();
  const groups = {
    public: [["inicio", "/"], ["catalogo", "/listados"], ["categoria", "/instrumentos/guitarras"], ...(listing ? [["publicacion", listing]] : []),
      ...(store ? [["tienda", store]] : []), ["login", "/login"], ["no-encontrada", "/pagina-que-no-existe"], ...(errorRoute ? [["error", errorRoute]] : [])],
    particular: [["resumen", "/mi-cuenta"], ["catalogo", "/listados"], ["publicar", "/mi-cuenta/publicar"]],
    store: [["resumen", "/mi-cuenta"]],
    // An Admin section that does not exist (Admin's own 404) and an unmatched deeper path (the root 404).
    admin: [["admin", "/admin"], ["no-encontrada", "/admin/no-existe"], ["no-encontrada-profunda", "/admin/no-existe/de-verdad"]],
  };
  const report = { base, templates: [], menus: [], zoom: [], cls: [] };
  const log = (line) => console.log(line);

  for (const [group, routes] of Object.entries(groups)) {
    if (group !== "public" && !accounts[group]) { log(`skip ${group}: no account in ${accountsFile}`); continue; }
    const session = `ux-audit-${group}-${process.pid}`;
    try {
      if (group !== "public") signIn(session, accounts[group]);
      for (const width of widths) {
        run(session, "set", "viewport", String(width), "900");
        for (const [name, url] of routes) {
          load(session, url);
          run(session, "press", "Tab");
          const skipFirst = evaluate(session, "document.activeElement?.className") === "skip-link";
          run(session, "press", "Enter");
          const skipToMain = evaluate(session, "document.activeElement?.id") === "contenido";
          evaluate(session, `${axeSource};'ok'`);
          const violations = JSON.parse(await evaluate(session, AXE));
          run(session, "press", "Tab");
          const sweep = JSON.parse(evaluate(session, SWEEP));
          report.templates.push({ group, name, width, skipFirst, skipToMain, violations, ...sweep });
          log(`${group}/${name}@${width}: axe ${violations.length}, focusables ${sweep.focusables}, no ring ${sweep.missing.length}, tab order ${sweep.order.length}, overflow ${sweep.overflow}, skip ${skipFirst && skipToMain}`);
        }
      }
      if (group === "admin" || (group === "particular" && !accounts.admin)) {
        for (const [width, url, button] of [[1440, "/listados", "menu-cuenta"], [390, "/listados", "menu-cuenta"], [390, "/mi-cuenta/favoritos", "menu-cuenta-movil"],
          ...(group === "admin" ? [[390, "/admin", "menu-admin"]] : []), ...(listing ? [[390, listing, "busqueda-movil"]] : [])]) {
          run(session, "set", "viewport", String(width), "900");
          load(session, url);
          run(session, "click", `button[aria-controls="${button}"]`);
          run(session, "wait", "300");
          evaluate(session, `${axeSource};'ok'`);
          const violations = JSON.parse(await evaluate(session, AXE));
          const expanded = evaluate(session, `document.querySelector('button[aria-controls="${button}"]').getAttribute('aria-expanded')`);
          report.menus.push({ menu: button, url, width, expanded, violations });
          log(`menu ${button} open on ${url}@${width}: expanded ${expanded}, axe ${violations.length}`);
        }
        for (const width of [640, 720]) {
          run(session, "set", "viewport", String(width), "900");
          for (const url of ["/", "/listados", ...(listing ? [listing] : []), "/mi-cuenta", ...(group === "admin" ? ["/admin"] : []), "/terminos"]) {
            load(session, url);
            const overflow = evaluate(session, "document.documentElement.scrollWidth > innerWidth");
            report.zoom.push({ width, url, overflow });
            log(`zoom ${width} ${url}: overflow ${overflow}`);
          }
        }
      }
      if (group === "public" || group === "particular") {
        for (const width of [390, 1440]) {
          run(session, "set", "viewport", String(width), "900");
          for (const url of ["/", "/listados", ...(listing ? [listing] : []), ...(group === "particular" ? ["/mi-cuenta"] : [])]) {
            run(session, "open", `${base}${url}`);
            run(session, "wait", "--load", "networkidle");
            const cls = await evaluate(session, CLS);
            report.cls.push({ group, width, url, cls });
            log(`cls ${group} ${width} ${url}: ${cls}`);
          }
        }
      }
    } finally {
      spawnSync(browser, ["--session", session, "close"], { encoding: "utf8" });
    }
  }

  const t = report.templates;
  const summary = {
    runs: t.length,
    axeViolations: t.reduce((n, r) => n + r.violations.length, 0) + report.menus.reduce((n, r) => n + r.violations.length, 0),
    focusables: t.reduce((n, r) => n + r.focusables, 0),
    withoutRing: t.reduce((n, r) => n + r.missing.length, 0),
    tabOrderProblems: t.reduce((n, r) => n + r.order.length, 0),
    skipLinkFailures: t.filter((r) => !r.skipFirst || !r.skipToMain).length,
    pagesWithOverflow: t.filter((r) => r.overflow).length + report.zoom.filter((r) => r.overflow).length,
    pagesWithoutOneMainAndH1: t.filter((r) => r.mains !== 1 || r.h1 !== 1).length,
    maxCls: Math.max(0, ...report.cls.map((r) => r.cls)),
  };
  report.summary = summary;
  const out = path.join(process.cwd(), ".ux-snapshots", label);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "audit.json"), JSON.stringify(report, null, 2));
  log(`summary ${JSON.stringify(summary)}`);
  log(`report: ${path.relative(process.cwd(), path.join(out, "audit.json"))}`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
