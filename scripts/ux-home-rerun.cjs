#!/usr/bin/env node
// Re-runs the acceptance rows the UX-3b home touches (docs/ux-redesign/ux-3-discovery.md § Evidence plan) on a running
// local build, following each row's own steps, and records what it observes. It never decides a status: the owner reads
// the observations and records any result in acceptance/cases.tsv. It also checks the home's own rules against the
// database (3b criterion 3): the vitrina and the feed are recomputed in SQL as the anon role (so RLS applies, as on the
// site) and compared with the page.
//
//   node scripts/ux-home-rerun.cjs --base http://localhost:3300 --db-container supabase_db_mkt_instrumentos --label ux3b-rows
//
// Rows: PUB-001 (the home signed out), PUB-006 (payment, delivery and guarantee words on the home), SEO-002 (the home's
// category links to the landings, followed to a populated landing), AN-001 (impressions from the home, source "home"),
// and PUB-009 for the banner search (typing records nothing, Enter records exactly one search, on the catalog).
// Local Supabase only. Browser: agent-browser on PATH or LARIA_AGENT_BROWSER_BIN. Output: .ux-snapshots/<label>/rows.json.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const base = option("base", "http://localhost:3300").replace(/\/$/, "");
const label = option("label", "ux3b-rows");
const dbContainer = option("db-container");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new Error("Local builds only.");
if (!dbContainer) throw new Error("Pass --db-container (the local Supabase Postgres container).");
const browser = process.env.LARIA_AGENT_BROWSER_BIN ?? "agent-browser";
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
const load = (session, url) => { run(session, "open", `${base}${url}`); settle(session); };
function session(width) {
  const name = `ux3brows${process.pid}-${(sessionCount += 1)}`;
  run(name, "set", "viewport", String(width), "900");
  return name;
}
const close = (name) => { try { run(name, "close"); } catch { /* already closed */ } };
const shot = (name, file) => run(name, "screenshot", path.resolve(outDir, file));
// psql's last output line (a leading SET ROLE prints "SET").
function sql(query) {
  const result = spawnSync("docker", ["exec", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-Atc", query], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`SQL failed: ${result.stderr}`);
  return result.stdout.trim().split("\n").pop();
}
const count = (query) => Number(sql(query));
const asAnon = (query) => sql(`set role anon; ${query}`);

const report = { base, date: new Date().toISOString(), rows: {} };
const log = (row, step, observed) => {
  (report.rows[row] ??= []).push({ step, observed });
  console.log(`${row} ${step}: ${JSON.stringify(observed)}`);
};
const save = () => fs.writeFileSync(path.join(outDir, "rows.json"), `${JSON.stringify(report, null, 2)}\n`);

const ORDER = "published_at desc nulls last, created_at desc, id";
const slugsOf = (section) => `JSON.stringify([...document.querySelectorAll('section[aria-labelledby="${section}"] article h3 a')].map((a) => a.getAttribute('href').replace('/instrumentos/', '')))`;

(async () => {
  // 3b criterion 3: the vitrina and the feed, recomputed as the anon role.
  {
    const winners = asAnon(`select coalesce(string_agg(slug, ',' order by ${ORDER}), '') from (select distinct on (category) slug, published_at, created_at, id from listings l where status = 'approved' and public.listing_photo_count(l) >= 3 order by category, ${ORDER}) w`).split(",").filter(Boolean);
    const expectedVitrina = winners.slice(0, 5);
    const newest = asAnon(`select coalesce(string_agg(slug, ',' order by ${ORDER}), '') from (select slug, published_at, created_at, id from listings where status = 'approved' order by ${ORDER} limit 16) n`).split(",").filter(Boolean);
    const expectedFeed = newest.filter((slug) => !expectedVitrina.includes(slug)).slice(0, 11);
    const photoCounts = asAnon("select string_agg(category || '=' || n, ', ' order by category) from (select category, max(public.listing_photo_count(l)) n from listings l where status = 'approved' group by category) c");
    const hiddenWithPhotos = sql("select coalesce(string_agg(l.slug, ','), '') from listings l join stores s on s.id = l.store_id where l.status = 'approved' and s.status <> 'active' and public.listing_photo_count(l) >= 3");
    const s = session(1440);
    load(s, "/");
    const vitrina = json(s, slugsOf("vitrina-titulo"));
    const feed = json(s, slugsOf("recientes-titulo"));
    const tiles = json(s, `JSON.stringify([...document.querySelectorAll('section[aria-labelledby="vitrina-titulo"] article')].map((a) => ({ category: a.querySelector('.t-micro')?.textContent, price: a.querySelector('span.bg-ink')?.textContent, favourite: !!a.querySelector('button'), links: a.querySelectorAll('a').length })))`);
    shot(s, "home-1440.png");
    log("3b-3", "vitrina = each category's newest approved listing with 3+ photos, the five most recent (anon SQL vs page, 1440)", { expected: expectedVitrina, onPage: vitrina, equal: JSON.stringify(expectedVitrina) === JSON.stringify(vitrina), allWinners: winners, maxPhotosPerCategory: photoCounts, notPublicWithPhotos: hiddenWithPhotos, tiles });
    log("3b-3", "feed = newest approved without the vitrina's, eleven at most (anon SQL vs page, 1440)", { expected: expectedFeed, onPage: feed, equal: JSON.stringify(expectedFeed) === JSON.stringify(feed), overlap: feed.filter((slug) => vitrina.includes(slug)) });
    close(s);
    const p = session(390);
    load(p, "/");
    log("3b-3", "phones (390): vitrina row, six feed cards and the catalog button", json(p, `JSON.stringify({ vitrinaRow: (() => { const ul = document.querySelector('section[aria-labelledby="vitrina-titulo"] ul'); return { scrolls: ul.scrollWidth > ul.clientWidth, tileWidth: Math.round(ul.querySelector('li').getBoundingClientRect().width) }; })(),
      feedVisible: [...document.querySelectorAll('section[aria-labelledby="recientes-titulo"] article')].filter((a) => a.getClientRects().length).length,
      button: [...document.querySelectorAll('section[aria-labelledby="recientes-titulo"] a')].filter((a) => a.getClientRects().length).map((a) => a.textContent).at(-1), overflow: document.documentElement.scrollWidth > innerWidth })`));
    shot(p, "home-390.png");
    close(p);
  }
  save();

  // PUB-001, PUB-006, SEO-002: the home signed out.
  {
    const s = session(1440);
    load(s, "/");
    log("PUB-001", "open / signed out (1440)", json(s, `JSON.stringify({ url: location.pathname, h1: document.querySelector('h1')?.textContent, header: !!document.querySelector('header.surface-frame'),
      categoriesButton: !!document.querySelector('button[aria-controls="menu-categorias"]'), headerLinks: [...document.querySelectorAll('header nav a')].map((a) => a.textContent), signIn: [...document.querySelectorAll('header a')].some((a) => a.textContent.includes('Ingresar')),
      strip: !!document.querySelector('nav[aria-label="Categorías"]'), search: !!document.querySelector('form[role=search] input[name=brand]'), sections: [...document.querySelectorAll('main h2')].map((h) => h.textContent),
      footerColumns: [...document.querySelectorAll('footer nav[aria-label]')].map((n) => n.getAttribute('aria-label')) })`));
    run(s, "click", 'button[aria-controls="menu-categorias"]');
    log("PUB-001", "the home's Categorías menu (marketplace navigation), signed out", json(s, `JSON.stringify({ links: [...document.querySelectorAll('#menu-categorias a')].map((a) => a.textContent + ' → ' + a.getAttribute('href')) })`));
    run(s, "click", "#como-funciona-titulo");
    const text = evaluate(s, "document.querySelector('main').innerText + '\\n' + document.querySelector('footer').innerText");
    const lines = [...text.matchAll(/[^\n]*(pag[oa]s?|pagar|checkout|carrito|escrow|env[ií]os?|entrega|garant[ií]a|garantiza|comisi[oó]n|reembolso|devoluci[oó]n|correo)[^\n]*/gi)].map((m) => m[0].trim().slice(0, 200));
    log("PUB-006", "payment, delivery, guarantee and email words on the home (main and footer)", { lines: [...new Set(lines)] });
    const tiles = json(s, `JSON.stringify([...document.querySelectorAll('section[aria-labelledby="categorias-titulo"] a')].map((a) => [a.querySelector('span')?.textContent, a.getAttribute('href'), a.innerText.split('\\n').at(-1)]))`);
    const counts = Object.fromEntries(asAnon("select string_agg(category || '=' || n, ';') from (select category, count(*) n from listings where status = 'approved' group by category) c").split(";").map((pair) => pair.split("=")));
    log("SEO-002", "the home's Explora por categoría: eight landing links and their counts (anon SQL)", { tiles, approvedPerCategory: counts, total: asAnon("select count(*) from listings where status = 'approved'"), noCatalogQueryLinks: tiles.every(([, href]) => !href.startsWith("/listados?")) });
    run(s, "click", 'section[aria-labelledby="categorias-titulo"] a[href="/instrumentos/guitarras"]');
    settle(s);
    log("SEO-002", "followed Guitarras from the home: the landing with real cards", json(s, `JSON.stringify({ url: location.pathname, h1: document.querySelector('h1')?.textContent, cards: document.querySelectorAll('main article').length,
      canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href'), robots: document.querySelector('meta[name=robots]')?.getAttribute('content') ?? null,
      jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => { try { return JSON.parse(s.textContent)['@type']; } catch { return 'invalid'; } }) })`));
    close(s);
  }
  save();

  // AN-001: impressions from the home carry the listing and source "home".
  {
    const events = (type, where = "") => count(`select count(*) from marketplace_events where event_type = '${type}' ${where}`);
    const s = session(1440);
    const before = events("listing_impression", "and source = 'home'");
    const startedAt = sql("select now()");
    load(s, "/");
    // An impression needs half of the card on screen (components/marketplace-telemetry.tsx): the vitrina is in the first
    // screen; then the feed's section is brought to the top of the viewport (both rows fit at 1440 × 900).
    run(s, "wait", "1500");
    evaluate(s, "document.querySelector('section[aria-labelledby=\"recientes-titulo\"]').scrollIntoView({ block: 'start' }); 'ok'");
    run(s, "wait", "2500");
    const onPage = json(s, `JSON.stringify([...document.querySelectorAll('main article h3 a')].map((a) => a.getAttribute('href').replace('/instrumentos/', '')))`);
    run(s, "wait", "1000");
    const recorded = sql(`select coalesce(string_agg(distinct l.slug, ','), '') from marketplace_events e join listings l on l.id = e.listing_id where e.event_type = 'listing_impression' and e.source = 'home' and e.created_at >= '${startedAt}'`).split(",").filter(Boolean);
    const sources = sql(`select coalesce(string_agg(distinct source, ','), '') from marketplace_events where event_type = 'listing_impression' and created_at >= '${startedAt}'`);
    log("AN-001", "impressions after loading the home and bringing the feed into view (1440)", { before, after: events("listing_impression", "and source = 'home'"), sources, cardsOnPage: onPage.length, listingsRecorded: recorded.length,
      recordedNotOnPage: recorded.filter((slug) => !onPage.includes(slug)), onPageNotRecorded: onPage.filter((slug) => !recorded.includes(slug)) });
    close(s);
  }
  save();

  // PUB-009, the banner search: typing records nothing; Enter goes to the catalog, which records exactly one search.
  {
    const searches = () => count("select count(*) from marketplace_events where event_type = 'search'");
    const h = session(1440);
    load(h, "/");
    const start = searches();
    run(h, "fill", "#busqueda-inicio", "MarcaInexistenteUX3b");
    run(h, "wait", "1500");
    const typed = searches();
    run(h, "press", "Enter");
    settle(h);
    run(h, "wait", "1500");
    const submitted = searches();
    const url = evaluate(h, "location.pathname + location.search");
    const results = evaluate(h, "document.getElementById('resultados-estado')?.textContent ?? null");
    load(h, "/");
    run(h, "focus", "#busqueda-inicio");
    run(h, "wait", "1500");
    log("PUB-009", "banner search: type, Enter, back to the home and focus again (1440)", { start, afterTyping: typed, afterEnter: submitted, afterRefocus: searches(), url, results,
      metadata: sql("select metadata::text from marketplace_events where event_type = 'search' order by created_at desc limit 1") });
    close(h);
  }
  save();
  console.log(`Report: ${path.join(outDir, "rows.json")}`);
})().catch((error) => {
  save();
  console.error(error.message);
  process.exitCode = 1;
});
