#!/usr/bin/env node
// UX accessibility and shell audit (docs/ux-redesign/review-guide.md). Reproduces the numbers in
// docs/ux-redesign/ux-2-acceptance.md with the same browser as the screenshot harness (agent-browser, decision D10).
//
//   node scripts/ux-audit.cjs --base http://localhost:3100 --axe /path/to/axe-core/axe.min.js
//
// Per template (including 404s inside Admin), width and account: axe-core (WCAG 2.1 A/AA tags), a focus sweep (every visible focusable element
// must show a 2 px outline when focused after a keyboard event), the skip link (first Tab, lands on <main>), Tab order
// inside the header and the category strip (left to right, row by row), one <main> and one <h1>, the correct
// public or Admin frame, and horizontal overflow. The phone/tablet strip check verifies sideways access and the
// final link destination. Then axe with each shell menu open, overflow at 640 / 720 px (200% zoom), and layout shift.
// Category menus (N12 hybrid) at 390 / 768 / 1440: a category opens its panel ("Ver todos" and the canonical types), axe with
// it open, Tab into the panel, Esc back to the button, one panel at a time, outside press, both destination kinds,
// "Instrumentos" from a filtered catalog; on account pages, and next to the account menu; Admin's "Explorar categorías".
// UX-3 discovery (docs/ux-redesign/ux-3-discovery.md): the filter sheet at 390 / 768 (a labelled modal dialog, axe with
// it open, Tab stays inside, the page does not scroll, Esc and the close button return focus to "Filtrar", applying
// moves focus to the results count), the sort menu at 1280 / 1440 and the sort sheet at 390, the alert panel, two tab
// stops per card, two columns without overflow at 390, closed sheets and menus invisible.
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
  return runWithin(90000, session, ...command);
}
function runWithin(timeout, session, ...command) {
  const result = spawnSync(browser, ["--session", session, "--json", ...command], { encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024 });
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
  const adminPath = location.pathname === '/admin' || location.pathname.startsWith('/admin/');
  const adminNavigation = [...document.querySelectorAll('aside nav[aria-label="Navegación administrativa"], button[aria-controls="menu-admin"]')].some(visible);
  const publicHeader = !!document.querySelector('header.surface-frame');
  const footer = !!document.querySelector('footer.surface-frame');
  const frameOk = adminPath ? adminNavigation && !publicHeader && !footer : publicHeader && footer;
  return JSON.stringify({ focusables: items.length, missing, order, overflow: document.documentElement.scrollWidth > innerWidth, mains: document.querySelectorAll('main').length, h1: document.querySelectorAll('h1').length, frameOk });
})()`;
const CLS = "new Promise((resolve) => { let total = 0; new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) total += e.value; }).observe({ type: 'layout-shift', buffered: true }); setTimeout(() => resolve(Number(total.toFixed(4))), 1500); })";

// Clicks a menu button. agent-browser's click occasionally hangs right after keyboard steps (not reproducible by
// hand); after 30 s it is retried once as a DOM click, and the check records that it was.
const fallbacks = [];
function clickButton(session, selector) {
  try {
    runWithin(30000, session, "click", selector);
  } catch (error) {
    if (!/ETIMEDOUT/.test(error.message)) throw error;
    fallbacks.push(selector);
    evaluate(session, `document.querySelector(${JSON.stringify(selector)}).click()`);
  }
}

// One category-menu check: runs the steps, records pass/fail with the observed values.
function check(report, log, name, width, observed, passed) {
  if (fallbacks.length) observed = { ...observed, domClickFallback: fallbacks.splice(0) };
  report.categoryMenus.push({ name, width, passed, observed });
  log(`category menu ${name}@${width}: ${passed ? "pass" : "FAIL"} ${JSON.stringify(observed)}`);
}
const PANEL_STATE = (key) => `JSON.stringify({ open: [...document.querySelectorAll('nav[aria-label="Categorías"] button[aria-expanded="true"]')].map((b) => b.getAttribute('aria-controls')),
  panel: !!document.getElementById('categoria-${key}'), viewAll: document.querySelector('#categoria-${key} a')?.textContent ?? null,
  types: document.querySelectorAll('#categoria-${key} li a').length, active: document.activeElement?.getAttribute('aria-controls') ?? document.activeElement?.textContent?.trim().slice(0, 30) ?? null,
  url: location.pathname + location.search, overflow: document.documentElement.scrollWidth > innerWidth })`;

// Keyboard checks run in their own browser session: after a run of Esc / Enter / Tab presses, agent-browser
// navigates its tab to about:blank a few seconds later (reproduced on a bare HTML page with no app code).
async function categoryMenuKeyboardChecks(session, report, log, width, axeSource) {
  const state = (key) => JSON.parse(evaluate(session, PANEL_STATE(key)));
  load(session, "/listados");
  clickButton(session, 'button[aria-controls="categoria-guitars"]');
  let s = state("guitars");
  evaluate(session, `${axeSource};'ok'`);
  const violations = JSON.parse(await evaluate(session, AXE));
  check(report, log, "opens", width, { ...s, axe: violations.length }, s.panel && s.viewAll === "Ver todos" && s.types === 3 && !s.overflow && violations.length === 0);
  run(session, "press", "Escape");
  s = state("guitars");
  check(report, log, "escape-returns-focus", width, s, !s.panel && s.active === "categoria-guitars");
  run(session, "press", "Enter");
  run(session, "press", "Tab");
  s = state("guitars");
  check(report, log, "keyboard-into-panel", width, s, s.panel && s.active === "Ver todos");
}

async function categoryMenuClickChecks(session, report, log, width) {
  const state = (key) => JSON.parse(evaluate(session, PANEL_STATE(key)));
  let s;
  load(session, "/listados");
  clickButton(session, 'button[aria-controls="categoria-guitars"]');
  clickButton(session, 'button[aria-controls="categoria-basses"]');
  s = state("basses");
  check(report, log, "one-at-a-time", width, s, s.panel && s.open.length === 1 && s.open[0] === "categoria-basses");
  run(session, "click", "footer p"); // outside the panel and not a link, at every width
  s = state("basses");
  check(report, log, "outside-press", width, s, !s.panel && s.open.length === 0);
  clickButton(session, 'button[aria-controls="categoria-guitars"]');
  run(session, "click", '#categoria-guitars a[href="/instrumentos/guitarras"]');
  run(session, "wait", "--load", "networkidle"); run(session, "wait", "500");
  s = state("guitars");
  check(report, log, "view-all-destination", width, s, s.url === "/instrumentos/guitarras" && !s.panel);
  clickButton(session, 'button[aria-controls="categoria-guitars"]');
  run(session, "click", '#categoria-guitars a[href="/listados?category=guitars&instrument_type=electric_guitar"]');
  run(session, "wait", "--load", "networkidle"); run(session, "wait", "500");
  // The filters show the chosen type: the old form's select (before UX-3) or the type option marked current.
  s = { ...state("guitars"), type: evaluate(session, "document.querySelector('select[name=instrument_type]')?.value ?? (document.getElementById('filtro-instrument_type-electric_guitar')?.getAttribute('aria-current') === 'true' ? 'electric_guitar' : null)") };
  check(report, log, "type-destination", width, s, s.url === "/listados?category=guitars&instrument_type=electric_guitar" && s.type === "electric_guitar" && !s.panel);
  run(session, "click", 'nav[aria-label="Categorías"] li:first-child a');
  run(session, "wait", "--load", "networkidle"); run(session, "wait", "500");
  s = state("guitars");
  check(report, log, "instrumentos-from-filtered-catalog", width, s, s.url === "/listados");
}

// UX-3 checks, one record each.
function discoveryCheck(report, log, name, width, observed, passed) {
  report.discovery.push({ name, width, passed, observed });
  log(`discovery ${name}@${width}: ${passed ? "pass" : "FAIL"} ${JSON.stringify(observed)}`);
}
const VISIBLE_JS = "const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';";
const SHEET_STATE = `(() => { ${VISIBLE_JS}
  const dialog = document.querySelector('dialog.sheet');
  const title = dialog && document.getElementById(dialog.getAttribute('aria-labelledby'));
  const active = document.activeElement;
  return JSON.stringify({ open: !!dialog?.open, visible: vis(dialog), modal: dialog?.matches(':modal') ?? false, ariaModal: dialog?.getAttribute('aria-modal') ?? null,
    label: title?.textContent ?? null, focusInside: !!dialog && dialog.contains(active), active: active?.id || active?.getAttribute('aria-label') || active?.textContent?.trim().slice(0, 30) || active?.tagName,
    scrollLocked: getComputedStyle(document.documentElement).overflow === 'hidden', openDialogs: [...document.querySelectorAll('dialog')].filter(vis).length,
    url: location.pathname + location.search, overflow: document.documentElement.scrollWidth > innerWidth });
})()`;
const FILTRAR = `[...document.querySelectorAll('button[aria-haspopup="dialog"]')].find((b) => b.textContent.trim().startsWith('Filtrar'))`;

async function discoveryChecks(report, log) {
  // A fresh browser session per check (agent-browser blanks a tab a while after a run of key presses).
  const fresh = async (name, width, fn) => {
    const session = `ux-audit-ux3-${name}-${width}-${process.pid}`;
    try {
      run(session, "set", "viewport", String(width), "900");
      await fn(session);
    } catch (error) {
      discoveryCheck(report, log, name, width, { error: error.message }, false);
    } finally {
      spawnSync(browser, ["--session", session, "close"], { encoding: "utf8" });
    }
  };
  const axeNow = async (session) => { evaluate(session, `${axeSource};'ok'`); return JSON.parse(await evaluate(session, AXE)); };
  for (const width of [390, 768]) {
    // Opening, axe, Tab inside, scroll lock.
    await fresh("sheet", width, async (session) => {
      load(session, "/listados?category=guitars");
      const closedBefore = JSON.parse(evaluate(session, SHEET_STATE));
      evaluate(session, `${FILTRAR}.click()`);
      run(session, "wait", "500");
      const opened = JSON.parse(evaluate(session, SHEET_STATE));
      const violations = await axeNow(session);
      discoveryCheck(report, log, "filter-sheet-opens", width, { closedBefore: closedBefore.openDialogs, ...opened, axe: violations },
        closedBefore.openDialogs === 0 && opened.open && opened.modal && opened.ariaModal === "true" && opened.label === "Filtros" && opened.focusInside && opened.scrollLocked && !opened.overflow && violations.length === 0);
      let outside = 0;
      for (let i = 0; i < 40; i += 1) {
        run(session, "press", "Tab");
        if (!JSON.parse(evaluate(session, SHEET_STATE)).focusInside) outside += 1;
      }
      discoveryCheck(report, log, "filter-sheet-focus-trap", width, { presses: 40, outside }, outside === 0);
    });
    // Esc discards and returns focus to Filtrar (own session: Esc runs blank agent-browser's tab later).
    await fresh("sheet-esc", width, async (session) => {
      load(session, "/listados?category=guitars");
      evaluate(session, `${FILTRAR}.focus(); ${FILTRAR}.click()`);
      run(session, "wait", "500");
      evaluate(session, `[...document.querySelectorAll('dialog.sheet label')].find((l) => l.textContent.trim() === 'Nuevo')?.click()`);
      run(session, "press", "Escape");
      run(session, "wait", "400");
      const after = JSON.parse(evaluate(session, SHEET_STATE));
      const focusFiltrar = evaluate(session, `document.activeElement === ${FILTRAR}`);
      discoveryCheck(report, log, "filter-sheet-escape", width, { ...after, focusFiltrar }, !after.open && after.openDialogs === 0 && focusFiltrar && after.url === "/listados?category=guitars" && !after.scrollLocked);
    });
    // The close button discards too; then applying runs one navigation and focuses the results count.
    await fresh("sheet-apply", width, async (session) => {
      load(session, "/listados?category=guitars");
      evaluate(session, `${FILTRAR}.click()`);
      run(session, "wait", "500");
      run(session, "click", 'dialog.sheet button[aria-label="Cerrar filtros"]');
      run(session, "wait", "400");
      const closed = JSON.parse(evaluate(session, SHEET_STATE));
      const focusFiltrar = evaluate(session, `document.activeElement === ${FILTRAR}`);
      discoveryCheck(report, log, "filter-sheet-close-button", width, { ...closed, focusFiltrar }, !closed.open && closed.openDialogs === 0 && focusFiltrar);
      evaluate(session, `${FILTRAR}.click()`);
      run(session, "wait", "500");
      for (const text of ["Nuevo", "Usado · buen estado"]) evaluate(session, `[...document.querySelectorAll('dialog.sheet label')].find((l) => l.textContent.trim() === ${JSON.stringify(text)})?.click()`);
      evaluate(session, `[...document.querySelectorAll('dialog.sheet button')].find((b) => b.textContent.trim() === 'Ver resultados').click()`);
      run(session, "wait", "--load", "networkidle"); run(session, "wait", "800");
      const applied = JSON.parse(evaluate(session, `JSON.stringify({ url: location.pathname + location.search, focus: document.activeElement?.id ?? null, chips: [...document.querySelectorAll('a[aria-label^="Quitar filtro"]')].map((a) => a.getAttribute('aria-label')), dialogs: document.querySelectorAll('dialog').length, alertLine: document.body.innerText.includes('Para crear una alerta, elige un solo valor en cada filtro.') })`));
      discoveryCheck(report, log, "filter-sheet-apply-f11", width, applied, applied.url === "/listados?category=guitars&condition=Nuevo&condition=Usado+-+buen+estado" && applied.focus === "resultados-estado" && applied.dialogs === 0 && applied.chips.includes("Quitar filtro: Condición: Nuevo") && applied.chips.includes("Quitar filtro: Condición: Usado · buen estado") && applied.alertLine);
    });
    // Ordenar sheet: axe with it open, a choice applies at once.
    await fresh("sort-sheet", width, async (session) => {
      load(session, "/listados");
      run(session, "click", "#orden-boton-movil");
      run(session, "wait", "500");
      const opened = JSON.parse(evaluate(session, SHEET_STATE));
      const violations = await axeNow(session);
      evaluate(session, `[...document.querySelectorAll('dialog.sheet a')].find((a) => a.textContent.trim() === 'Menor precio').click()`);
      run(session, "wait", "--load", "networkidle"); run(session, "wait", "800");
      const after = JSON.parse(evaluate(session, SHEET_STATE));
      discoveryCheck(report, log, "sort-sheet", width, { opened, axe: violations, after }, opened.open && opened.label === "Ordenar" && violations.length === 0 && after.url === "/listados?sort=price_asc" && after.openDialogs === 0);
    });
  }
  for (const width of [1280, 1440]) {
    await fresh("sort-menu", width, async (session) => {
      load(session, "/listados?category=guitars");
      const closed = evaluate(session, "document.getElementById('menu-orden') === null");
      run(session, "click", "#orden-boton");
      run(session, "wait", "300");
      const open = JSON.parse(evaluate(session, `(() => { ${VISIBLE_JS} return JSON.stringify({ visible: vis(document.getElementById('menu-orden')), expanded: document.getElementById('orden-boton').getAttribute('aria-expanded'), options: [...document.querySelectorAll('#menu-orden a')].map((a) => a.textContent.trim()) }); })()`));
      const violations = await axeNow(session);
      evaluate(session, `[...document.querySelectorAll('#menu-orden a')].find((a) => a.textContent.trim() === 'Mayor precio').click()`);
      run(session, "wait", "--load", "networkidle"); run(session, "wait", "800");
      const after = JSON.parse(evaluate(session, "JSON.stringify({ url: location.pathname + location.search, menu: document.getElementById('menu-orden') !== null, focus: document.activeElement?.id ?? null, label: document.getElementById('orden-boton')?.textContent })"));
      discoveryCheck(report, log, "sort-menu", width, { closed, ...open, axe: violations, after }, closed && open.visible && open.expanded === "true" && open.options.join() === "Más recientes,Menor precio,Mayor precio" && violations.length === 0 && after.url === "/listados?category=guitars&sort=price_desc" && !after.menu && after.focus === "orden-boton" && /Mayor precio/.test(after.label));
    });
    await fresh("sort-menu-esc", width, async (session) => {
      load(session, "/listados");
      run(session, "click", "#orden-boton");
      run(session, "wait", "300");
      run(session, "press", "Escape");
      const after = JSON.parse(evaluate(session, "JSON.stringify({ menu: document.getElementById('menu-orden') !== null, focus: document.activeElement?.id ?? null })"));
      discoveryCheck(report, log, "sort-menu-escape", width, after, !after.menu && after.focus === "orden-boton");
    });
    // The pending state: the router's data request is held for 1.5 s in the page, so the results must stay, dim after
    // 200 ms and announce "Cargando resultados…", then come back at full opacity.
    await fresh("pending", width, async (session) => {
      load(session, "/listados");
      evaluate(session, `(() => { const original = window.fetch; window.fetch = (input, init) => { const headers = new Headers(init?.headers); return headers.get('RSC') === '1' && !headers.get('Next-Router-Prefetch') ? new Promise((resolve) => setTimeout(resolve, 1500)).then(() => original(input, init)) : original(input, init); }; return 'held'; })()`);
      run(session, "click", "#filtro-seller_type-individual");
      run(session, "wait", "100");
      const read = `JSON.stringify({ busy: document.querySelector('.catalog-results')?.getAttribute('aria-busy') ?? null, opacity: getComputedStyle(document.querySelector('.catalog-results')).opacity, status: [...document.querySelectorAll('[role=status]')].map((e) => e.textContent).find((t) => t.includes('Cargando')) ?? null, cards: document.querySelectorAll('main article').length, url: location.pathname + location.search })`;
      const early = JSON.parse(evaluate(session, read));
      run(session, "wait", "450");
      const dimmed = JSON.parse(evaluate(session, read));
      run(session, "wait", "2500");
      const after = JSON.parse(evaluate(session, read));
      discoveryCheck(report, log, "pending-state", width, { early, dimmed, after }, early.busy === "true" && Number(early.opacity) > 0.9 && dimmed.busy === "true" && Math.abs(Number(dimmed.opacity) - 0.5) < 0.05 && dimmed.status === "Cargando resultados…" && dimmed.cards > 0 && after.busy === null && Number(after.opacity) === 1 && after.url === "/listados?seller_type=individual");
    });
    // A desktop facet keeps keyboard focus on the option just chosen.
    await fresh("facet-focus", width, async (session) => {
      load(session, "/listados");
      evaluate(session, "document.getElementById('filtro-condition-Nuevo').focus()");
      run(session, "press", "Enter");
      run(session, "wait", "--load", "networkidle"); run(session, "wait", "800");
      const after = JSON.parse(evaluate(session, "JSON.stringify({ url: location.pathname + location.search, focus: document.activeElement?.id ?? null, current: document.getElementById('filtro-condition-Nuevo')?.getAttribute('aria-current') ?? null })"));
      discoveryCheck(report, log, "facet-keeps-focus", width, after, after.url === "/listados?condition=Nuevo" && after.focus === "filtro-condition-Nuevo" && after.current === "true");
    });
  }
  // Cards: two tab stops each; two columns at 390 without page overflow.
  for (const width of [390, 768, 1440]) {
    await fresh("cards", width, async (session) => {
      load(session, "/listados");
      const cards = JSON.parse(evaluate(session, `(() => { const selector = 'a[href], button, input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])';
        const articles = [...document.querySelectorAll('main article')];
        const grid = articles[0]?.parentElement;
        return JSON.stringify({ cards: articles.length, stops: [...new Set(articles.map((a) => a.querySelectorAll(selector).length))], columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
          cardWidth: Math.round(articles[0]?.getBoundingClientRect().width ?? 0), overflow: document.documentElement.scrollWidth > innerWidth }); })()`));
      const expected = width < 768 ? 2 : width < 1280 ? 3 : 4;
      discoveryCheck(report, log, "card-tab-stops-and-grid", width, cards, cards.cards > 0 && cards.stops.length === 1 && cards.stops[0] === 2 && cards.columns === expected && !cards.overflow);
    });
  }
}

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
    public: [["inicio", "/"], ["catalogo", "/listados"], ["catalogo-filtrado", "/listados?category=guitars&condition=Nuevo&condition=Usado+-+buen+estado&location=Lima&location=Arequipa"],
      ["catalogo-sin-resultados", "/listados?brand=zzzz"], ["categoria", "/instrumentos/guitarras"], ["categoria-baterias", "/instrumentos/baterias"], ...(listing ? [["publicacion", listing]] : []),
      ...(store ? [["tienda", store]] : []), ["login", "/login"], ["no-encontrada", "/pagina-que-no-existe"], ...(errorRoute ? [["error", errorRoute]] : [])],
    particular: [["resumen", "/mi-cuenta"], ["catalogo", "/listados"], ["publicar", "/mi-cuenta/publicar"]],
    store: [["resumen", "/mi-cuenta"]],
    // Both unknown Admin paths must use Admin's 404 inside its frame, including the deeper catch-all.
    admin: [["admin", "/admin"], ["no-encontrada", "/admin/no-existe"], ["no-encontrada-profunda", "/admin/no-existe/de-verdad"]],
  };
  const report = { base, templates: [], menus: [], strip: [], categoryMenus: [], discovery: [], zoom: [], cls: [] };
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
          log(`${group}/${name}@${width}: axe ${violations.length}, focusables ${sweep.focusables}, no ring ${sweep.missing.length}, tab order ${sweep.order.length}, overflow ${sweep.overflow}, frame ${sweep.frameOk}, skip ${skipFirst && skipToMain}`);
        }
      }
      if (group === "public") {
        for (const width of [390, 768]) {
          run(session, "set", "viewport", String(width), "900");
          load(session, "/listados");
          const metrics = JSON.parse(evaluate(session, `(() => {
            const row = document.querySelector('nav[aria-label="Categorías"] ul');
            const last = row?.querySelector('li:last-child a');
            const before = row?.scrollLeft ?? 0;
            if (row) row.scrollLeft = row.scrollWidth;
            const rowRect = row?.getBoundingClientRect();
            const lastRect = last?.getBoundingClientRect();
            return JSON.stringify({ hasStrip: !!row, overflows: !!row && row.scrollWidth > row.clientWidth,
              moved: !!row && row.scrollLeft > before,
              lastVisible: !!rowRect && !!lastRect && lastRect.left >= rowRect.left - 1 && lastRect.right <= rowRect.right + 1,
              pageOverflow: document.documentElement.scrollWidth > innerWidth });
          })()`));
          run(session, "click", 'nav[aria-label="Categorías"] li:last-child a');
          run(session, "wait", "--load", "networkidle");
          const destination = evaluate(session, "new URL(location.href).searchParams.get('seller_type') === 'verified_store'");
          const passed = metrics.hasStrip && metrics.overflows && metrics.moved && metrics.lastVisible && !metrics.pageOverflow && destination;
          report.strip.push({ width, ...metrics, destination, passed });
          log(`strip@${width}: overflow ${metrics.overflows}, moved ${metrics.moved}, last visible ${metrics.lastVisible}, destination ${destination}, page overflow ${metrics.pageOverflow}`);
        }
      }
      if (group === "public") {
        // A fresh browser session per width: after many page loads in one session, agent-browser's click occasionally
        // hung at this point (never reproduced in a fresh session).
        for (const width of [390, 768, 1440]) {
          for (const [kind, checks] of [["keys", categoryMenuKeyboardChecks], ["clicks", categoryMenuClickChecks]]) {
            const menuSession = `ux-audit-menus-${kind}-${width}-${process.pid}`;
            try {
              run(menuSession, "set", "viewport", String(width), "900");
              await checks(menuSession, report, log, width, axeSource);
            } finally {
              spawnSync(browser, ["--session", menuSession, "close"], { encoding: "utf8" });
            }
          }
        }
      }
      if (group === "public") await discoveryChecks(report, log);
      if (group === "particular") {
        // The alert panel, signed in, from the title row (desktop) and the chip (phone).
        for (const [width, button] of [[1440, "alerta-button-panel"], [390, "alerta-chip-panel"]]) {
          run(session, "set", "viewport", String(width), "900");
          load(session, "/listados?category=guitars");
          run(session, "click", `button[aria-controls="${button}"]`);
          run(session, "wait", "300");
          const opened = JSON.parse(evaluate(session, `JSON.stringify({ panel: !!document.getElementById('${button}'), frequency: !!document.querySelector('#${button} select'), overflow: document.documentElement.scrollWidth > innerWidth })`));
          evaluate(session, `${axeSource};'ok'`);
          const violations = JSON.parse(await evaluate(session, AXE));
          discoveryCheck(report, log, "alert-panel", width, { ...opened, axe: violations }, opened.panel && opened.frequency && !opened.overflow && violations.length === 0);
        }
        for (const width of [390, 1440]) {
          run(session, "set", "viewport", String(width), "900");
          // Account pages carry the strip; a category panel and the account menu are never open together (the open
          // account menu covers the strip on phones, so the panel is opened first, then the account menu).
          load(session, "/mi-cuenta/favoritos");
          clickButton(session, 'button[aria-controls="categoria-amplifiers"]');
          const opened = JSON.parse(evaluate(session, PANEL_STATE("amplifiers")));
          clickButton(session, 'button[aria-controls="menu-cuenta"]');
          const s = { ...JSON.parse(evaluate(session, PANEL_STATE("amplifiers"))), panelBefore: opened.panel, accountMenuOpen: evaluate(session, "document.getElementById('menu-cuenta')?.hidden === false") };
          check(report, log, "account-page-and-account-menu", width, s, s.panelBefore && !s.panel && s.accountMenuOpen && !s.overflow);
          run(session, "press", "Escape");
          clickButton(session, 'button[aria-controls="categoria-amplifiers"]');
          run(session, "click", '#categoria-amplifiers a[href="/instrumentos/amplificadores"]');
          run(session, "wait", "--load", "networkidle"); run(session, "wait", "500");
          const after = JSON.parse(evaluate(session, PANEL_STATE("amplifiers")));
          check(report, log, "account-page-destination", width, after, after.url === "/instrumentos/amplificadores");
        }
      }
      if (group === "admin") {
        for (const width of [390, 1440]) {
          run(session, "set", "viewport", String(width), "900");
          load(session, "/admin");
          const scope = width < 1024 ? "#menu-admin" : "aside";
          if (width < 1024) run(session, "click", 'button[aria-controls="menu-admin"]');
          const click = (text) => evaluate(session, `[...document.querySelectorAll('${scope} button')].find((b) => b.textContent.trim().startsWith('${text}'))?.click() ?? 'missing'`);
          // Closed levels must not show their links (a display class once overrode the hidden attribute here).
          const HIDDEN_SHOWN = `[...document.querySelectorAll('${scope} [hidden] a')].filter((a) => a.getClientRects().length > 0).length`;
          const closedShown = evaluate(session, HIDDEN_SHOWN);
          click("Explorar categorías"); click("Guitarras");
          const opened = JSON.parse(evaluate(session, `JSON.stringify({ hiddenShown: ${HIDDEN_SHOWN}, links: [...document.querySelectorAll('${scope} a')].map((a) => a.getAttribute('href')).filter((h) => /^\\/(listados|instrumentos)/.test(h)).length,
            viewAll: !![...document.querySelectorAll('${scope} a')].find((a) => a.textContent === 'Ver todos' && a.offsetParent), publicHeader: !!document.querySelector('header.surface-frame'), footer: !!document.querySelector('footer'),
            overflow: document.documentElement.scrollWidth > innerWidth })`));
          evaluate(session, `${axeSource};'ok'`);
          const violations = JSON.parse(await evaluate(session, AXE));
          check(report, log, "admin-explorar-categorias", width, { ...opened, closedShown, axe: violations.length }, closedShown === 0 && opened.hiddenShown === 0 && opened.viewAll && opened.links >= 26 && !opened.publicHeader && !opened.footer && !opened.overflow && violations.length === 0);
          evaluate(session, `[...document.querySelectorAll('${scope} a')].find((a) => a.textContent === 'Ver todos' && a.offsetParent)?.click()`);
          run(session, "wait", "--load", "networkidle"); run(session, "wait", "500");
          const url = evaluate(session, "location.pathname");
          check(report, log, "admin-destination", width, { url }, url === "/instrumentos/guitarras");
          // Esc levels in their own session (agent-browser's tab goes blank a while after repeated Esc presses; see above).
          const escSession = `ux-audit-admin-esc-${width}-${process.pid}`;
          try {
            signIn(escSession, accounts.admin);
            run(escSession, "set", "viewport", String(width), "900");
            load(escSession, "/admin");
            if (width < 1024) run(escSession, "click", 'button[aria-controls="menu-admin"]');
            const clickIn = (text) => evaluate(escSession, `[...document.querySelectorAll('${scope} button')].find((b) => b.textContent.trim().startsWith('${text}'))?.click() ?? 'missing'`);
            clickIn("Explorar categorías"); clickIn("Guitarras");
            evaluate(escSession, `[...document.querySelectorAll('${scope} button')].find((b) => b.textContent.trim().startsWith('Guitarras'))?.focus()`);
            run(escSession, "press", "Escape");
            const inner = evaluate(escSession, "JSON.stringify({ active: document.activeElement?.textContent?.trim(), expanded: document.activeElement?.getAttribute('aria-expanded') })");
            run(escSession, "press", "Escape");
            const outer = evaluate(escSession, "JSON.stringify({ active: document.activeElement?.textContent?.trim(), expanded: document.activeElement?.getAttribute('aria-expanded') })");
            const esc = { inner: JSON.parse(inner), outer: JSON.parse(outer), menuStillOpen: width < 1024 ? evaluate(escSession, "document.getElementById('menu-admin')?.hidden === false") : null };
            check(report, log, "admin-escape-levels", width, esc, esc.inner.active === "Guitarras" && esc.inner.expanded === "false" && esc.outer.active === "Explorar categorías" && esc.outer.expanded === "false" && (width >= 1024 || esc.menuStillOpen === true));
          } finally {
            spawnSync(browser, ["--session", escSession, "close"], { encoding: "utf8" });
          }
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
          for (const url of ["/", "/listados", "/listados?category=guitars&condition=Nuevo&condition=Usado+-+buen+estado&location=Lima&location=Arequipa", "/instrumentos/baterias", ...(listing ? [listing] : []), "/mi-cuenta", ...(group === "admin" ? ["/admin"] : []), "/terminos"]) {
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
          for (const url of ["/", "/listados", "/instrumentos/guitarras", ...(listing ? [listing] : []), ...(group === "particular" ? ["/mi-cuenta"] : [])]) {
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
    frameFailures: t.filter((r) => !r.frameOk).length,
    stripFailures: report.strip.filter((r) => !r.passed).length,
    categoryMenuChecks: report.categoryMenus.length,
    categoryMenuFailures: report.categoryMenus.filter((r) => !r.passed).length,
    categoryMenuDomClickFallbacks: report.categoryMenus.filter((r) => r.observed.domClickFallback).length,
    discoveryChecks: report.discovery.length,
    discoveryFailures: report.discovery.filter((r) => !r.passed).length,
    maxCls: Math.max(0, ...report.cls.map((r) => r.cls)),
  };
  report.summary = summary;
  const out = path.join(process.cwd(), ".ux-snapshots", label);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "audit.json"), JSON.stringify(report, null, 2));
  log(`summary ${JSON.stringify(summary)}`);
  log(`report: ${path.relative(process.cwd(), path.join(out, "audit.json"))}`);
  if (summary.frameFailures || summary.stripFailures || summary.categoryMenuFailures || summary.discoveryFailures) process.exitCode = 1;
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
