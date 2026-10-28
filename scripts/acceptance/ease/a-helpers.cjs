// Group A's helpers (find, listing page and WhatsApp): reading the catalog and listing pages the way a visitor sees them.
"use strict";
const h = require("./harness.cjs");

// The catalog's results are settled: no transition pending, the network quiet for a moment.
async function settled(page, timeout = 20_000) {
  await page.waitForLoadState("load");
  await page.waitForFunction(() => !document.querySelector("#resultados[aria-busy]"), null, { timeout }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
}

// "39 resultados" in the title row.
async function resultCount(page) {
  const text = await page.locator("#resultados-estado").innerText({ timeout: 15_000 });
  const match = /([\d,.]+)\s+resultados?/.exec(text);
  return match ? Number(match[1].replace(/[,.]/g, "")) : /Sin resultados|0 resultados/.test(text) ? 0 : null;
}

// The result cards in order: title, slug and the card's text.
async function resultCards(page, scope = "#resultados") {
  return page.locator(`${scope} article :is(h2, h3) a[href^='/instrumentos/']`).evaluateAll((links) => links.map((a) => ({
    title: a.textContent.trim(),
    slug: a.getAttribute("href").split("/").pop(),
    text: a.closest("article").innerText.replace(/\s+/g, " ").trim(),
    // A real drop shows "Antes" and the old price struck through (a line-through span, components/ui/price.tsx).
    drop: Boolean(a.closest("article").querySelector("s, del, .line-through")),
  })));
}

// Every result's slug across up to `pages` numbered pages (24 per page), starting from the page already open.
async function allResultSlugs(t, page, pages = 3) {
  const start = new URL(page.url());
  const slugs = (await resultCards(page)).map((card) => card.slug);
  const count = await resultCount(page).catch(() => null);
  for (let number = 2; number <= pages && count && (number - 1) * 24 < count; number += 1) {
    const next = new URL(start);
    next.searchParams.set("page", String(number));
    await t.goto(page, next.pathname + next.search);
    await settled(page);
    slugs.push(...(await resultCards(page)).map((card) => card.slug));
  }
  return [...new Set(slugs)];
}

// The filter counts the phone sheet asks for (public JSON), fetched by the page itself so the live pacing applies.
async function facets(page, query = "") {
  return page.evaluate(async (q) => {
    const response = await fetch(`/api/catalog/facets${q ? `?${q}` : ""}`);
    return response.ok ? response.json() : null;
  }, query);
}

// Types into the header search and submits it; resolves once the catalog has settled.
async function headerSearch(page, text, { submit = true } = {}) {
  const box = page.locator("#global-marketplace-search");
  await box.click();
  await box.fill(text);
  if (!submit) return box;
  const before = page.url();
  await box.press("Enter");
  await page.waitForURL((url) => url.href !== before && url.pathname.startsWith("/listados"), { timeout: 30_000 });
  await settled(page);
  return box;
}

// The applied chips ("Filtros activos"): links with their aria-label and href, "Limpiar todo" left out.
async function chipTexts(page) {
  const row = page.locator("div", { has: page.locator(":scope > span", { hasText: /^Filtros activos:$/ }) }).last();
  if (!(await row.count())) return [];
  const links = await row.locator("a").evaluateAll((items) => items.map((a) => ({ text: a.innerText.replace(/\s+/g, " ").trim(), label: a.getAttribute("aria-label") || "", href: a.getAttribute("href") })));
  return links.filter((link) => /^Quitar filtro/.test(link.label));
}

// A listing page's WhatsApp contact link.
function contactLink(page) {
  return page.locator(".contact-bar a[href^='https://wa.me/']").first();
}

// The box of an element in the viewport, with the scroll and viewport height.
async function rect(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), innerHeight: window.innerHeight, scrollY: Math.round(window.scrollY) };
  }, selector);
}

// A word nobody else uses (letters only, so search treats it as one word).
function word(prefix = "zq") {
  const letters = "bcdfghjklmnpqrstvwxz";
  let out = prefix;
  for (let i = 0; i < 9; i += 1) out += letters[Math.floor(Math.random() * letters.length)];
  return out;
}

// Rows of a query as a signed-in user (or anon): several rows come back as one jsonb value (harness.sqlAs reads one line).
function sqlAsRows(userId, query, options) {
  const [row] = h.sqlAs(userId, `select coalesce(jsonb_agg(q), '[]'::jsonb) as rows from (${query}) q`, options);
  return row ? row.rows : [];
}

// Waits until fn() is truthy (polling), or the timeout passes; returns the last value.
async function until(fn, { timeout = 15_000, every = 300 } = {}) {
  const end = Date.now() + timeout;
  let value;
  do {
    value = await fn();
    if (value) return value;
    await h.sleep(every);
  } while (Date.now() < end);
  return value;
}

// Local only: asks for a cached page (the home's 60 s ISR) until its HTML holds `needle`, so the next visit shows it.
async function waitForHtml(t, route, needle, timeout = 180_000) {
  return until(async () => {
    const response = await fetch(t.url(route)).catch(() => null);
    const html = response ? await response.text() : "";
    return html.includes(needle);
  }, { timeout, every: 5_000 });
}

// The home's "Para ti" pool as the server sent it (React's flight data): slug, category, type, seller_key...
async function homePool(page) {
  return page.evaluate(() => {
    const text = (self.__next_f || []).map((entry) => (typeof entry[1] === "string" ? entry[1] : "")).join("");
    const start = text.indexOf('"pool":[');
    if (start < 0) return null;
    let depth = 0;
    let i = start + 7;
    let inString = false;
    let escaped = false;
    for (; i < text.length; i += 1) {
      const c = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "[" || c === "{") depth += 1;
      else if (c === "]" || c === "}") {
        depth -= 1;
        if (depth === 0) {
          i += 1;
          break;
        }
      }
    }
    try {
      return JSON.parse(text.slice(start + 7, i));
    } catch {
      return null;
    }
  });
}

// The whole flight payload and HTML of the page, for privacy checks.
async function pageSource(page) {
  return page.evaluate(() => `${document.documentElement.outerHTML}\n${(self.__next_f || []).map((entry) => (typeof entry[1] === "string" ? entry[1] : "")).join("")}`);
}

const params = (url) => Object.fromEntries([...new URL(url, "http://x").searchParams.keys()].map((key) => [key, new URL(url, "http://x").searchParams.getAll(key).join(",")]));
const sameSet = (a, b) => a.length === b.length && a.every((item) => b.includes(item));
const short = (items, n = 6) => (items.length > n ? `${items.slice(0, n).join(", ")} … (${items.length})` : items.join(", "));
const money = (value) => `S/ ${Number(value).toLocaleString("en-US")}`;
const pathOf = (url) => {
  const u = new URL(url);
  return u.pathname + u.search;
};

module.exports = {
  settled, resultCount, resultCards, allResultSlugs, facets, headerSearch, chipTexts, contactLink, rect, word, sqlAsRows,
  until, waitForHtml, homePool, pageSource, params, sameSet, short, money, pathOf,
};
