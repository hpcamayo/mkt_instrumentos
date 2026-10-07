#!/usr/bin/env node
// Re-runs the navigation rows of acceptance/cases.tsv (PUB-008 to PUB-015) on a running local build, following each
// row's own steps, and records what it observes. It never decides a status: the owner reads the observations and
// records the result (N12, docs/ux-redesign/ux-2-reconciliation.md).
//
//   node --require ./tests/setup-alias.cjs scripts/ux-pub-rerun.cjs --base http://localhost:3100 --label n12 [--db-container <name>] [--rows PUB-010,PUB-011]
//
// Accounts: .ux-accounts.local.json (scripts/ux-local-accounts.cjs). Browser: agent-browser on PATH or
// LARIA_AGENT_BROWSER_BIN. --db-container (the local Supabase Postgres container) lets PUB-009 count the search
// events it causes; without it PUB-009 is skipped. Local Supabase only. Output: .ux-snapshots/<label>/pub-rerun.json.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { categoryMenus } = require("../lib/shell.ts");

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const base = option("base", "http://localhost:3100").replace(/\/$/, "");
const label = option("label", "pub-rerun");
const dbContainer = option("db-container");
const rows = new Set((option("rows", "PUB-008,PUB-009,PUB-010,PUB-011,PUB-012,PUB-013,PUB-014,PUB-015")).split(","));
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new Error("Local builds only.");
const browser = process.env.LARIA_AGENT_BROWSER_BIN ?? "agent-browser";
const accounts = JSON.parse(fs.readFileSync(process.env.LARIA_UX_ACCOUNTS ?? ".ux-accounts.local.json", "utf8"));
const outDir = path.join(".ux-snapshots", label);
fs.mkdirSync(outDir, { recursive: true });

let sessionCount = 0;
function run(session, ...command) {
  const result = spawnSync(browser, ["--session", session, "--json", ...command], { encoding: "utf8", timeout: 90000, maxBuffer: 64 << 20 });
  if (result.status !== 0) throw new Error(`agent-browser ${command[0]} failed: ${result.error?.message || result.stderr || result.stdout}`);
  const parsed = JSON.parse(result.stdout.trim().split("\n").pop());
  if (!parsed.success) throw new Error(parsed.error ?? `agent-browser ${command[0]} failed`);
  return parsed.data;
}
const evaluate = (session, js) => run(session, "eval", js).result;
const json = (session, js) => JSON.parse(evaluate(session, js));
const settle = (session) => { run(session, "wait", "--load", "networkidle"); run(session, "wait", "700"); };
const load = (session, url) => { run(session, "open", `${base}${url}`); settle(session); };
// A fresh browser per step group (agent-browser blanks a tab a few seconds after a run of key presses).
function session(width, account) {
  const name = `pub${process.pid}-${(sessionCount += 1)}`;
  run(name, "set", "viewport", String(width), "900");
  if (account) {
    run(name, "open", `${base}/login`);
    const status = evaluate(name, `fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${JSON.stringify({ email: account.email, password: account.password })}) }).then((r) => r.status)`);
    if (status !== 200) throw new Error(`Sign-in failed for ${account.email} (HTTP ${status}).`);
  }
  return name;
}
const close = (name) => { try { run(name, "close"); } catch { /* already closed */ } };
const shot = (name, file) => run(name, "screenshot", path.resolve(outDir, file));

const VISIBLE = "const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]');";
const SHELL = `(() => { ${VISIBLE}
  const header = document.querySelector('header.surface-frame');
  const strip = document.querySelector('nav[aria-label="Categorías"]');
  return JSON.stringify({
    url: location.pathname + location.search,
    publicHeader: !!header,
    logo: vis(document.querySelector('a[aria-label="Laria inicio"]')),
    search: [...document.querySelectorAll('input[name=brand]')].some(vis),
    searchIcon: vis(document.querySelector('button[aria-controls="busqueda-movil"]')),
    signIn: vis(header?.querySelector('a[href^="/login"]')),
    accountMenu: vis(document.querySelector('button[aria-controls="menu-cuenta"]')),
    strip: vis(strip),
    categoryButtons: strip ? [...strip.querySelectorAll('button[aria-controls^="categoria-"]')].filter(vis).length : 0,
    accountRail: vis(document.querySelector('nav[aria-label="Navegación de cuenta"]')),
    accountSwitcher: vis(document.querySelector('button[aria-controls="menu-cuenta-movil"]')),
    adminNavigation: [...document.querySelectorAll('aside nav[aria-label="Navegación administrativa"], button[aria-controls="menu-admin"]')].some(vis),
    exploreCategories: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Explorar categorías'),
    footer: !!document.querySelector('footer'),
    mains: document.querySelectorAll('main').length,
    overflow: document.documentElement.scrollWidth > innerWidth,
  });
})()`;
const PANELS = `JSON.stringify({ open: [...document.querySelectorAll('nav[aria-label="Categorías"] button[aria-expanded="true"]')].map((b) => b.getAttribute('aria-controls')),
  panels: [...document.querySelectorAll('[id^="categoria-"]')].map((p) => ({ id: p.id, links: [...p.querySelectorAll('a')].map((a) => [a.textContent.trim(), a.getAttribute('href')]) })),
  focus: document.activeElement?.getAttribute('aria-controls') ?? document.activeElement?.textContent?.trim().slice(0, 40) ?? null,
  url: location.pathname + location.search, overflow: document.documentElement.scrollWidth > innerWidth })`;
const ACCOUNT_MENU = `JSON.stringify([...document.querySelectorAll('#menu-cuenta a, #menu-cuenta button')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim() + (e.getAttribute('href') ? ' → ' + e.getAttribute('href') : '')))`;
const expected = (key) => categoryMenus.find((menu) => menu.key === key);
// The panel id as components/global-categories.tsx builds it ("audio interfaces" → categoria-audio-interfaces).
const panelId = (key) => `categoria-${key.replace(/[^a-z0-9]+/gi, "-")}`;
const expectedLinks = (key) => [["Ver todos", expected(key).href], ...expected(key).types.map((type) => [type.label, type.href])];

const report = { base, date: new Date().toISOString(), rows: {} };
const log = (row, step, observed) => {
  (report.rows[row] ??= []).push({ step, observed });
  console.log(`${row} ${step}: ${JSON.stringify(observed)}`);
};
async function discover() {
  const xml = await (await fetch(`${base}/sitemap.xml`)).text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
  const categories = new Set(categoryMenus.map((menu) => menu.href.split("/")[2]));
  return {
    listing: paths.find((url) => url.startsWith("/instrumentos/") && !categories.has(url.split("/")[2])),
    store: paths.find((url) => url.startsWith("/tiendas/")),
  };
}
function searchEvents() {
  const sql = "select count(*) from public.marketplace_events where event_type = 'search'";
  const result = spawnSync("docker", ["exec", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-Atc", sql], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Could not count search events: ${result.stderr}`);
  return Number(result.stdout.trim());
}

(async () => {
  const { listing, store } = await discover();

  // PUB-008: representative routes per visitor, desktop and phone; role-specific account links.
  if (rows.has("PUB-008")) {
  const routes = {
    public: ["/", "/listados", listing, store, "/registro/vendedor", "/login"].filter(Boolean),
    particular: ["/mi-cuenta", "/mi-cuenta/favoritos", "/listados"],
    store: ["/mi-cuenta", "/mi-cuenta/tienda", "/listados"],
    admin: ["/admin", "/listados"],
  };
  for (const width of [1440, 390]) {
    for (const [group, urls] of Object.entries(routes)) {
      const s = session(width, accounts[group]);
      for (const url of urls) {
        load(s, url);
        log("PUB-008", `${group} ${url} @${width}`, json(s, SHELL));
      }
      if (group !== "public" && width === 1440) {
        load(s, "/listados");
        run(s, "click", 'button[aria-controls="menu-cuenta"]');
        log("PUB-008", `${group} account menu @${width}`, json(s, ACCOUNT_MENU));
      }
      close(s);
    }
  }
  }

  // PUB-009: type without submitting, press Enter, then focus the header again; count search events each time.
  if (!rows.has("PUB-009")) {
    // not requested
  } else if (dbContainer) {
    const s = session(1440);
    load(s, "/");
    const before = searchEvents();
    run(s, "fill", "header input[name=brand]", "MarcaInexistenteUX");
    run(s, "wait", "2000");
    const typed = searchEvents();
    run(s, "press", "Enter");
    settle(s); run(s, "wait", "2500");
    const submitted = searchEvents();
    const page = json(s, `JSON.stringify({ url: location.pathname + location.search, results: document.querySelector('main')?.innerText.match(/\\d+ resultados?|No encontramos[^\\n]*/)?.[0] ?? null })`);
    run(s, "focus", "header input[name=brand]");
    run(s, "wait", "2500");
    const refocused = searchEvents();
    log("PUB-009", "type, Enter, refocus @1440", { ...page, eventsAfterTyping: typed - before, eventsAfterEnter: submitted - before, eventsAfterRefocus: refocused - submitted });
    close(s);
  } else {
    log("PUB-009", "skipped", "no --db-container");
  }

  // PUB-010: Favorites at 390 as Particular and Store Owner: categories, account menus, destinations, width.
  for (const group of rows.has("PUB-010") ? ["particular", "store"] : []) {
    const s = session(390, accounts[group]);
    load(s, "/mi-cuenta/favoritos");
    log("PUB-010", `${group} shell @390`, json(s, SHELL));
    run(s, "click", 'button[aria-controls="categoria-guitars"]');
    log("PUB-010", `${group} Guitarras panel @390`, json(s, PANELS));
    shot(s, `pub-010-${group}-390-panel.png`);
    // The open panel lies over the page below the strip, the switcher included: close it first, as a person would.
    run(s, "click", 'button[aria-controls="categoria-guitars"]');
    run(s, "click", 'button[aria-controls="menu-cuenta-movil"]');
    log("PUB-010", `${group} account switcher @390`, json(s, `JSON.stringify({ panelOpen: !!document.querySelector('[id^="categoria-"]'), items: [...document.querySelectorAll('#menu-cuenta-movil a')].map((a) => a.textContent.replace(/\\s+/g, ' ').trim() + (a.getAttribute('aria-current') ? ' (actual)' : '')), overflow: document.documentElement.scrollWidth > innerWidth })`));
    shot(s, `pub-010-${group}-390-switcher.png`);
    run(s, "click", 'button[aria-controls="menu-cuenta"]');
    log("PUB-010", `${group} header account menu @390`, json(s, `JSON.stringify({ switcherOpen: !document.getElementById('menu-cuenta-movil')?.hidden, items: JSON.parse(${ACCOUNT_MENU}).length })`));
    load(s, "/mi-cuenta/favoritos");
    run(s, "click", 'button[aria-controls="categoria-guitars"]');
    run(s, "click", '#categoria-guitars a[href="/instrumentos/guitarras"]');
    settle(s);
    log("PUB-010", `${group} Ver todos destination @390`, json(s, PANELS));
    close(s);
  }

  // PUB-011: open Guitarras, then Baterías; each panel holds only its own category.
  for (const [group, account] of rows.has("PUB-011") ? [["anonymous", null], ["particular", accounts.particular]] : []) {
    const s = session(1440, account);
    load(s, "/listados");
    run(s, "click", 'button[aria-controls="categoria-guitars"]');
    const guitars = json(s, PANELS);
    run(s, "click", 'button[aria-controls="categoria-drums"]');
    const drums = json(s, PANELS);
    shot(s, `pub-011-${group}-1440-drums.png`);
    log("PUB-011", `${group} Guitarras then Baterías @1440`, {
      guitars: { open: guitars.open, links: guitars.panels.map((p) => p.links.map(([text]) => text)) },
      drums: { open: drums.open, links: drums.panels.map((p) => p.links.map(([text]) => text)) },
      guitarsMatchesTaxonomy: JSON.stringify(guitars.panels[0]?.links) === JSON.stringify(expectedLinks("guitars")),
      drumsMatchesTaxonomy: drums.panels.length === 1 && JSON.stringify(drums.panels[0]?.links) === JSON.stringify(expectedLinks("drums")),
    });
    close(s);
  }

  // PUB-012: every panel's destinations against the canonical taxonomy; follow one type link per category.
  if (rows.has("PUB-012")) {
    const s = session(1440);
    load(s, "/listados");
    const mismatches = [];
    for (const menu of categoryMenus) {
      run(s, "click", `button[aria-controls="${panelId(menu.key)}"]`);
      const state = json(s, PANELS);
      // Clicking the next category closes this one (one panel at a time); no key presses in this session.
      if (state.open.length !== 1 || JSON.stringify(state.panels[0]?.links) !== JSON.stringify(expectedLinks(menu.key))) mismatches.push(menu.key);
    }
    log("PUB-012", "panel destinations = categoryMenus (listing form and catalog taxonomy) @1440", { categories: categoryMenus.length, mismatches });
    close(s);
    for (const menu of categoryMenus) {
      const type = menu.types.find((item) => item.href.startsWith("/listados?")) ?? menu.types[0];
      const t = session(1440);
      load(t, "/listados");
      run(t, "click", `button[aria-controls="${panelId(menu.key)}"]`);
      run(t, "click", `#${panelId(menu.key)} a[href="${type.href}"]`);
      settle(t);
      log("PUB-012", `${menu.key} → ${type.value}`, json(t, `JSON.stringify({ url: location.pathname + location.search, category: document.querySelector('select[name=category]')?.value ?? null, instrumentType: document.querySelector('select[name=instrument_type]')?.value ?? null, heading: document.querySelector('h1')?.textContent ?? null, panelOpen: !!document.querySelector('[id^="categoria-"]') })`));
      close(t);
    }
  }

  // PUB-013: choose a type, then navigate client-side; also a client route change while a panel is open.
  if (rows.has("PUB-013")) {
    const s = session(1440);
    load(s, "/listados");
    run(s, "click", 'button[aria-controls="categoria-guitars"]');
    run(s, "click", '#categoria-guitars a[href="/listados?category=guitars&instrument_type=electric_guitar"]');
    settle(s);
    const afterType = json(s, PANELS);
    const card = evaluate(s, "document.querySelector('main a[href^=\"/instrumentos/\"]:not([href^=\"/instrumentos/guitarras\"])')?.getAttribute('href') ?? null");
    evaluate(s, "window.__sameDocument = true; 'ok'");
    if (card) run(s, "click", `main a[href="${card}"]`);
    settle(s);
    const afterClient = { ...json(s, PANELS), clientNavigation: evaluate(s, "window.__sameDocument === true") };
    log("PUB-013", "type link, then a client navigation to a listing @1440", { afterType, afterClient });
    run(s, "click", 'button[aria-controls="categoria-drums"]');
    const opened = json(s, PANELS).open;
    evaluate(s, "window.next.router.push('/instrumentos/baterias'); 'ok'");
    settle(s);
    log("PUB-013", "panel open, then a client route change @1440", { openBefore: opened, ...json(s, PANELS), clientNavigation: evaluate(s, "window.__sameDocument === true") });
    close(s);
  }

  // PUB-014: outside press, reopen, Escape; aria-expanded and focus (own session: key presses).
  for (const width of rows.has("PUB-014") ? [1440, 768] : []) {
    const s = session(width);
    load(s, "/listados");
    run(s, "click", 'button[aria-controls="categoria-guitars"]');
    const opened = json(s, PANELS);
    run(s, "click", "footer p");
    const outside = json(s, PANELS);
    run(s, "click", 'button[aria-controls="categoria-guitars"]');
    const reopened = json(s, PANELS);
    run(s, "press", "Escape");
    const escaped = { ...json(s, PANELS), expanded: evaluate(s, "document.querySelector('button[aria-controls=\"categoria-guitars\"]').getAttribute('aria-expanded')") };
    log("PUB-014", `outside, reopen, Escape @${width}`, { opened: opened.open, outside: outside.open, reopened: reopened.open, escaped });
    close(s);
  }

  // PUB-015: phone: open a category, follow a type, reopen and close; width and expanded state.
  if (rows.has("PUB-015")) {
    const s = session(390);
    load(s, "/listados");
    run(s, "click", 'button[aria-controls="categoria-pedals"]');
    const opened = json(s, PANELS);
    shot(s, "pub-015-390-pedales.png");
    const type = expected("pedals").types[0];
    run(s, "click", `#categoria-pedals a[href="${type.href}"]`);
    settle(s);
    const navigated = json(s, PANELS);
    run(s, "click", 'button[aria-controls="categoria-microphones"]');
    const reopened = json(s, PANELS);
    run(s, "click", 'button[aria-controls="categoria-microphones"]');
    const toggled = json(s, PANELS);
    log("PUB-015", "open Pedales, follow a type, reopen Micrófonos and close @390", {
      opened: { open: opened.open, links: opened.panels[0]?.links.length, matchesTaxonomy: JSON.stringify(opened.panels[0]?.links) === JSON.stringify(expectedLinks("pedals")), overflow: opened.overflow },
      navigated: { url: navigated.url, open: navigated.open, overflow: navigated.overflow },
      reopened: { open: reopened.open, overflow: reopened.overflow },
      closedByButton: { open: toggled.open, overflow: toggled.overflow },
    });
    close(s);
  }

  fs.writeFileSync(path.join(outDir, "pub-rerun.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report: ${path.join(outDir, "pub-rerun.json")}`);
})().catch((error) => { console.error(error); process.exit(1); });
