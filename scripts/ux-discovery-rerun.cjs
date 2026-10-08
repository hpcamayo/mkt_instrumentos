#!/usr/bin/env node
// Re-runs the acceptance rows UX-3a touches (docs/ux-redesign/ux-3-discovery.md § Evidence plan) on a running local
// build, following each row's own steps, and records what it observes. It never decides a status: the owner reads the
// observations and records any result in acceptance/cases.tsv.
//
//   node scripts/ux-discovery-rerun.cjs --base http://localhost:3300 --paged-base http://localhost:3301 \
//     --db-container supabase_db_mkt_instrumentos --label ux3a-rows
//
// --base is a production build; --paged-base a scratch build of the same code with LISTINGS_PAGE_SIZE = 2, for the
// pagination rows (the local data has 14 approved listings, fewer than one 24-item page). --db-container (the local
// Supabase Postgres container) lets the rows that change data (favourites, alerts, events) count rows before and
// after; what the run creates (one favourite, one alert) it removes again through the app. Local Supabase only.
// Accounts: .ux-accounts.local.json. Browser: agent-browser on PATH or LARIA_AGENT_BROWSER_BIN.
// Output: .ux-snapshots/<label>/rows.json.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const base = option("base", "http://localhost:3300").replace(/\/$/, "");
const pagedBase = option("paged-base", "").replace(/\/$/, "");
const label = option("label", "ux3a-rows");
const dbContainer = option("db-container");
for (const url of [base, pagedBase].filter(Boolean)) if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) throw new Error("Local builds only.");
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
const settle = (session) => { run(session, "wait", "--load", "networkidle"); run(session, "wait", "900"); };
const load = (session, url, origin = base) => { run(session, "open", `${origin}${url}`); settle(session); };
function session(width, account, origin = base) {
  const name = `ux3rows${process.pid}-${(sessionCount += 1)}`;
  run(name, "set", "viewport", String(width), "900");
  if (account) {
    run(name, "open", `${origin}/login`);
    const status = evaluate(name, `fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${JSON.stringify({ email: account.email, password: account.password })}) }).then((r) => r.status)`);
    if (status !== 200) throw new Error(`Sign-in failed for ${account.email} (HTTP ${status}).`);
  }
  return name;
}
const close = (name) => { try { run(name, "close"); } catch { /* already closed */ } };
const shot = (name, file) => run(name, "screenshot", path.resolve(outDir, file));
function sql(query) {
  if (!dbContainer) return null;
  const result = spawnSync("docker", ["exec", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-Atc", query], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`SQL failed: ${result.stderr}`);
  return result.stdout.trim();
}
const count = (query) => (dbContainer ? Number(sql(query)) : null);

const report = { base, pagedBase: pagedBase || null, date: new Date().toISOString(), rows: {} };
const log = (row, step, observed) => {
  (report.rows[row] ??= []).push({ step, observed });
  console.log(`${row} ${step}: ${JSON.stringify(observed)}`);
};
const save = () => fs.writeFileSync(path.join(outDir, "rows.json"), `${JSON.stringify(report, null, 2)}\n`);

const CARDS = `JSON.stringify([...document.querySelectorAll('main article')].map((a) => { const img = a.querySelector('img'); const link = a.querySelector('h2 a, h3 a');
  return { title: link?.textContent ?? null, href: link?.getAttribute('href') ?? null, src: img?.getAttribute('src') ?? null, srcset: !!img?.getAttribute('srcset'), sizes: img?.getAttribute('sizes') ?? null, loading: img?.getAttribute('loading') ?? null,
    favourite: a.querySelector('[aria-label*="avoritos"]')?.getAttribute('aria-label') ?? null, pressed: a.querySelector('button[aria-pressed]')?.getAttribute('aria-pressed') ?? null }; }))`;
const PAGE = `JSON.stringify({ url: location.pathname + location.search, h1: document.querySelector('h1')?.textContent ?? null, count: document.getElementById('resultados-estado')?.textContent ?? null,
  cards: document.querySelectorAll('main article').length, canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href') ?? null, robots: document.querySelector('meta[name=robots]')?.getAttribute('content') ?? null,
  jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => { try { return JSON.parse(s.textContent)['@type']; } catch { return 'invalid'; } }),
  showing: [...document.querySelectorAll('main p')].map((p) => p.textContent).find((t) => t.startsWith('Mostrando')) ?? null, pages: [...document.querySelectorAll('nav[aria-label="Páginas de resultados"] a, nav[aria-label="Páginas de resultados"] [aria-current]')].map((a) => a.textContent.trim()) })`;
// The event batches this page sent (agent-browser's network log): status and the events in each.
function eventBatches(session) {
  const data = run(session, "network", "requests", "--filter", "/api/events");
  return (data?.requests ?? data ?? []).filter((r) => /\/api\/events$/.test(r.url ?? "")).map((r) => {
    let events = null;
    try { events = JSON.parse(r.postData ?? r.request?.postData ?? "").events.map((e) => e.type + (e.listingId ? `:${e.listingId}` : "") + (e.source ? `@${e.source}` : "")); } catch { /* no body */ }
    return { status: r.status ?? r.response?.status ?? null, events };
  });
}

(async () => {
  // PUB-001, PUB-002, PUB-005, PUB-006: anonymous browsing and copy.
  {
    const s = session(1440);
    load(s, "/");
    log("PUB-001", "open / signed out", json(s, `JSON.stringify({ url: location.pathname, h1: document.querySelector('h1')?.textContent, header: !!document.querySelector('header.surface-frame'), strip: !!document.querySelector('nav[aria-label="Categorías"]'), login: location.pathname.startsWith('/login') })`));
    load(s, "/listados");
    const page = json(s, PAGE);
    log("PUB-002", "open /listados signed out", { ...page, approvedInDatabase: count("select count(*) from listings where status = 'approved'") });
    shot(s, "pub-002-catalogo-1440.png");
    const listing = evaluate(s, "document.querySelector('main article h2 a')?.getAttribute('href')");
    const store = sql("select slug from stores where status = 'active' order by created_at limit 1");
    const visited = [];
    for (const url of ["/listados?category=guitars", listing, store ? `/tiendas/${store}` : null].filter(Boolean)) {
      load(s, url);
      visited.push({ asked: url, at: evaluate(s, "location.pathname + location.search"), h1: evaluate(s, "document.querySelector('h1')?.textContent ?? null") });
    }
    log("PUB-005", "browse catalog, detail and store signed out", visited);
    const copy = [];
    for (const url of ["/listados", "/instrumentos/guitarras", "/listados?brand=zzzz"]) {
      load(s, url);
      const text = evaluate(s, "document.querySelector('main').innerText");
      const hits = [...text.matchAll(/[^\n]*(pag[oa]s?|pagar|checkout|carrito|escrow|env[ií]os?|garant[ií]a|garantiza|comisi[oó]n)[^\n]*/gi)].map((m) => m[0].trim().slice(0, 200));
      copy.push({ url, lines: [...new Set(hits)] });
    }
    log("PUB-006", "payment, delivery and guarantee words in the catalog and landing copy", copy);
    close(s);
  }
  save();

  // SEO-001 to SEO-007 on the landings.
  {
    const s = session(1440);
    for (const [row, url] of [["SEO-001", "/instrumentos/guitarras"], ["SEO-002", "/instrumentos/guitarras"], ["SEO-003", "/instrumentos/baterias"], ["SEO-004", "/instrumentos/microfonos"]]) {
      load(s, url);
      log(row, `open ${url}`, json(s, PAGE));
    }
    load(s, "/listados");
    const slug = evaluate(s, "document.querySelector('main article h2 a')?.getAttribute('href')?.split('/').pop() ?? null");
    if (slug) { load(s, `/instrumentos/${slug}`); log("SEO-001", "open a listing detail", json(s, `JSON.stringify({ url: location.pathname, h1: document.querySelector('h1')?.textContent, canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href') })`)); }
    // SEO-005: a filter on a landing leads to the URL-driven catalog with the category.
    load(s, "/instrumentos/guitarras");
    run(s, "click", "#filtro-condition-Nuevo");
    settle(s);
    log("SEO-005", "landing: choose Condición Nuevo in the filter column", json(s, PAGE));
    load(s, "/instrumentos/guitarras?condition=Nuevo");
    log("SEO-005", "landing URL with a filter is forwarded", json(s, PAGE));
    load(s, "/instrumentos/guitarras");
    log("SEO-006", "landing metadata and robots", json(s, `JSON.stringify({ title: document.title, description: document.querySelector('meta[name=description]')?.content, canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href'), robots: document.querySelector('meta[name=robots]')?.content ?? null, ogUrl: document.querySelector('meta[property="og:url"]')?.content })`));
    log("SEO-007", "landing content", json(s, `JSON.stringify({ h1: document.querySelector('h1')?.textContent, lead: document.querySelector('main p.text-lead')?.textContent, cards: document.querySelectorAll('main article').length, otherCategories: [...document.querySelectorAll('#otras-categorias ~ ul a')].map((a) => a.textContent), safety: !!document.getElementById('compra-con-cuidado') })`));
    shot(s, "seo-002-guitarras-1440.png");
    close(s);
  }
  save();

  // REL-001, REL-003, REL-004 and SEO-005 pagination on the page-size-2 build.
  if (pagedBase) {
    const s = session(1440, null, pagedBase);
    load(s, "/listados", pagedBase);
    log("REL-001", "page 1 of the catalog (scratch build, 2 per page)", json(s, PAGE));
    load(s, "/listados?condition=Nuevo", pagedBase);
    const first = json(s, PAGE);
    run(s, "click", 'nav[aria-label="Páginas de resultados"] a[href*="page=2"]');
    settle(s);
    const second = json(s, PAGE);
    run(s, "back"); settle(s);
    log("REL-003", "filtered catalog, page 2 and back", { first, second, back: evaluate(s, "location.pathname + location.search") });
    load(s, "/listados?location=Lima&location=Arequipa", pagedBase);
    run(s, "click", 'nav[aria-label="Páginas de resultados"] a[href*="page=2"]');
    settle(s);
    log("REL-003", "F11: two locations, page 2", json(s, PAGE));
    const walk = () => {
      const ids = [];
      load(s, "/listados", pagedBase);
      for (let page = 1; page <= 10; page += 1) {
        ids.push(...json(s, CARDS).map((card) => card.href));
        const next = evaluate(s, `document.querySelector('nav[aria-label="Páginas de resultados"] a[href*="page=${page + 1}"]')?.getAttribute('href') ?? null`);
        if (!next) break;
        load(s, next, pagedBase);
      }
      return ids;
    };
    const a = walk();
    const b = walk();
    log("REL-004", "walk every page twice", { listings: a.length, unique: new Set(a).size, sameOrder: JSON.stringify(a) === JSON.stringify(b), approvedInDatabase: count("select count(*) from listings where status = 'approved'") });
    load(s, "/instrumentos/guitarras?page=2", pagedBase);
    log("SEO-005", "landing page 2 (scratch build)", json(s, PAGE));
    shot(s, "rel-003-paginacion-1440.png");
    close(s);
  }
  save();

  // PHOTO-010, PHOTO-016: the card shows the first photo, as an optimized responsive image.
  {
    const s = session(1440);
    load(s, "/listados");
    const cards = json(s, CARDS);
    const primary = cards.map((card) => {
      const slug = card.href?.split("/").pop();
      const expected = slug && dbContainer ? sql(`select p.image_url from listing_photos p join listings l on l.id = p.listing_id where l.slug = '${slug.replace(/'/g, "''")}' order by p.sort_order limit 1`) : null;
      const shown = card.src?.startsWith("/_next/image") ? new URL(card.src, base).searchParams.get("url") : card.src;
      return { slug, shown, expected, matches: expected === null ? null : shown === expected };
    });
    log("PHOTO-010", "each card's photo is the listing's first photo (sort_order)", { cards: primary.length, mismatches: primary.filter((item) => item.matches === false) });
    log("PHOTO-016", "card images", { optimized: cards.filter((card) => card.src?.startsWith("/_next/image")).length, withSrcset: cards.filter((card) => card.srcset).length, sizes: [...new Set(cards.map((card) => card.sizes))], loading: cards.map((card) => card.loading) });
    close(s);
  }
  save();

  // LIFE-007: sold listings never appear in the catalog.
  {
    const sold = dbContainer ? sql("select coalesce(string_agg(slug, ','), '') from listings where status = 'sold'") : null;
    const s = session(1440);
    load(s, "/listados");
    const shown = json(s, CARDS).map((card) => card.href?.split("/").pop());
    log("LIFE-007", "sold listings in the database vs the catalog", { sold: sold ? sold.split(",") : [], shownSold: sold ? shown.filter((slug) => sold.split(",").includes(slug)) : null, note: sold ? undefined : "No sold listing in the local data; the catalog query still filters status = approved." });
    close(s);
  }
  save();

  // FAV-003 signed out, FAV-007 signed in.
  {
    const before = count("select count(*) from favorites");
    const s = session(390);
    load(s, "/listados");
    run(s, "click", 'main article a[aria-label="Ingresa para guardar en favoritos"]');
    settle(s);
    log("FAV-003", "favourite on a card, signed out", { url: evaluate(s, "location.pathname + location.search"), favouritesBefore: before, favouritesAfter: count("select count(*) from favorites") });
    close(s);
    const p = session(1440, accounts.particular);
    load(p, "/listados");
    const target = evaluate(p, "document.querySelector('main article h2 a')?.getAttribute('href')");
    run(p, "click", 'main article button[aria-label="Guardar en favoritos"]');
    run(p, "wait", "1500");
    load(p, "/listados");
    const card = json(p, CARDS).find((item) => item.href === target);
    log("FAV-007", "favourite a card, then reload the catalog", { listing: target, pressedAfterReload: card?.pressed, label: card?.favourite });
    shot(p, "fav-007-catalogo-1440.png");
    // Leave the data as found.
    run(p, "click", 'main article button[aria-label="Quitar de favoritos"]');
    run(p, "wait", "1500");
    log("FAV-007", "cleanup: favourite removed again", { favourites: count("select count(*) from favorites") });
    close(p);
  }
  save();

  // ALERT-001 signed in (exact single-value state; multi-value searches show the line), ALERT-002 signed out.
  {
    const anon = session(1440);
    load(anon, "/listados?category=guitars&condition=Nuevo");
    log("ALERT-002", "alert entry signed out", json(anon, `JSON.stringify([...document.querySelectorAll('a')].filter((a) => a.textContent.trim() === 'Crear alerta' && a.getClientRects().length).map((a) => a.getAttribute('href')))`));
    close(anon);
    // The app deletes an alert by marking it (deleted_at); count the live ones.
    const live = "select count(*) from saved_search_alerts where deleted_at is null";
    const before = count(live);
    const p = session(1440, accounts.particular);
    load(p, "/listados?category=guitars&condition=Nuevo&location=Lima&min_price=100");
    run(p, "click", 'button[aria-controls="alerta-button-panel"]');
    run(p, "wait", "300");
    shot(p, "alert-001-panel-1440.png");
    evaluate(p, "(() => { const select = document.querySelector('#alerta-button-panel select'); select.value = 'daily'; select.dispatchEvent(new Event('change', { bubbles: true })); })()");
    evaluate(p, "[...document.querySelectorAll('#alerta-button-panel button')].find((b) => b.textContent.trim() === 'Crear alerta').click()");
    run(p, "wait", "2000");
    const notice = evaluate(p, "document.querySelector('#alerta-button-panel [role=status], #alerta-button-panel [role=alert]')?.textContent ?? null");
    const saved = dbContainer ? sql("select id || '|' || search_filters::text || '|' || frequency from saved_search_alerts order by created_at desc limit 1") : null;
    log("ALERT-001", "create an alert on /listados?category=guitars&condition=Nuevo&location=Lima&min_price=100", { notice, alertsBefore: before, alertsAfter: count(live), saved: saved?.split("|").slice(1) });
    load(p, "/listados?category=guitars&condition=Nuevo&condition=Usado+-+buen+estado");
    log("ALERT-001", "F11: a search with two conditions", json(p, `JSON.stringify({ entries: [...document.querySelectorAll('button, a')].filter((e) => e.textContent.trim() === 'Crear alerta' && e.getClientRects().length).length, line: document.body.innerText.includes('Para crear una alerta, elige un solo valor en cada filtro.') })`));
    if (saved) {
      const id = saved.split("|")[0];
      const status = evaluate(p, `fetch('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: '${id}' }) }).then((r) => r.status)`);
      log("ALERT-001", "cleanup: the alert deleted again through the app", { status, liveAlerts: count(live) });
    }
    close(p);
  }
  save();

  // AN-001, AN-004, AN-006, PUB-009: events.
  if (dbContainer) {
    const events = (type) => count(`select count(*) from marketplace_events where event_type = '${type}'`);
    const last = (type) => sql(`select metadata::text from marketplace_events where event_type = '${type}' order by created_at desc limit 1`);
    const s = session(1440);
    const impressions = events("listing_impression");
    load(s, "/listados");
    run(s, "wait", "1500");
    const attributed = sql("select count(*) || ' events, ' || count(distinct listing_id) || ' listings, sources ' || string_agg(distinct source, ',') from marketplace_events where event_type = 'listing_impression' and created_at > now() - interval '30 seconds'");
    log("AN-001", "impressions after loading the catalog", { before: impressions, after: events("listing_impression"), recent: attributed, batches: eventBatches(s), localListingIds: sql("select string_agg(id::text, ',') from (select id from listings where status = 'approved' order by id limit 3) t") });
    const searches = events("search");
    const filters = events("filter_applied");
    load(s, "/listados?brand=Fender&condition=Nuevo");
    run(s, "wait", "1500");
    log("AN-004", "one search on /listados?brand=Fender&condition=Nuevo", { searchesBefore: searches, searchesAfter: events("search"), metadata: last("search") });
    log("AN-006", "filter applied on the same search", { before: filters, after: events("filter_applied"), metadata: last("filter_applied") });
    load(s, "/listados?location=Lima&location=Arequipa");
    run(s, "wait", "1500");
    log("AN-004", "F11: a search with two locations", { metadata: last("search"), batches: eventBatches(s) });
    const zero = events("search");
    load(s, "/listados?location=Lima&location=Arequipa&brand=SinResultados");
    run(s, "wait", "1500");
    log("AN-004", "F11: two locations and a brand with no results (no cards on screen)", { searchesBefore: zero, searchesAfter: events("search"), metadata: last("search") });
    close(s);
    // PUB-009: type without submitting, press Enter, then focus the header again.
    const h = session(1440);
    load(h, "/listados");
    const start = events("search");
    run(h, "fill", "#global-marketplace-search", "MarcaQueNoExiste");
    run(h, "wait", "1000");
    const typed = events("search");
    run(h, "press", "Enter");
    settle(h);
    run(h, "wait", "1200");
    const submitted = events("search");
    const url = evaluate(h, "location.pathname + location.search");
    run(h, "focus", "#global-marketplace-search");
    run(h, "wait", "1200");
    log("PUB-009", "type, Enter, focus again", { start, afterTyping: typed, afterEnter: submitted, afterFocus: events("search"), url, metadata: last("search") });
    close(h);
  }
  save();
  console.log(`Report: ${path.join(outDir, "rows.json")}`);
})().catch((error) => {
  save();
  console.error(error.message);
  process.exitCode = 1;
});
