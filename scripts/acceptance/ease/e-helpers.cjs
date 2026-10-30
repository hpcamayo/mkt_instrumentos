// Group E helpers for the Effortless Laria acceptance run (checks-e.cjs): moving through Descubrir, reading what it
// shows, and the small fixtures the Reservado, offer and AI checks share. Local fixtures use the harness's own writers;
// the Descubrir readers work signed out on any deployment.
"use strict";
const h = require("./harness.cjs");

const num = (text) => Number(String(text).replace(/[^\d]/g, ""));
const unique = () => `zq${h.tag().slice(-7)}`;

// ------------------------------------------------------------------ Descubrir

// The top bar's second line: "Lo nuevo · 3 de 24", or the list's name alone on a stop.
async function barText(page) {
  return (await page.locator("main h1 + p").first().innerText()).replace(/\s+/g, " ").trim();
}

async function counter(page) {
  const match = /·\s*([\d,]+)(?:\s+de\s+([\d,]+))?\s*$/.exec(await barText(page));
  return match ? { position: num(match[1]), total: match[2] ? num(match[2]) : null } : null;
}

// The screen in view: the one section that is not inert.
function current(page) {
  return page.locator("[data-slot] > section:not([inert])").first();
}

async function slotIndex(page) {
  return page.evaluate(() => {
    const feed = document.querySelector("main .snap-y");
    return feed && feed.clientHeight ? Math.round(feed.scrollTop / feed.clientHeight) : -1;
  });
}

async function slotCount(page) {
  return page.locator("[data-slot]").count();
}

// What the screen in view shows: its heading, the listing it opens (if any) and its published line.
async function screen(page) {
  const section = current(page);
  await section.waitFor({ timeout: 15_000 });
  return section.evaluate((node) => {
    const link = [...node.querySelectorAll("a")].find((a) => a.textContent.trim() === "Ver publicación");
    const published = [...node.querySelectorAll("span")].map((span) => span.textContent.trim()).find((text) => /^Publicado /.test(text)) || null;
    return {
      index: Number(node.parentElement.dataset.slot),
      heading: node.querySelector("h2")?.textContent.trim() || "",
      headingId: node.querySelector("h2")?.id || "",
      slug: link ? link.getAttribute("href").replace(/^\/instrumentos\//, "") : null,
      published,
      text: node.innerText.replace(/\s+/g, " ").trim(),
      reserved: [...node.querySelectorAll("span")].some((span) => span.textContent.trim() === "Reservado"),
    };
  });
}

// The drawn slots (the screen in view and its neighbours): index, heading, listing and inert.
async function drawnSlots(page) {
  return page.evaluate(() => [...document.querySelectorAll("[data-slot]")].map((node) => {
    const section = node.querySelector("section");
    const link = section ? [...section.querySelectorAll("a")].find((a) => a.textContent.trim() === "Ver publicación") : null;
    return {
      index: Number(node.dataset.slot),
      drawn: Boolean(section),
      heading: section?.querySelector("h2")?.textContent.trim() || "",
      slug: link ? link.getAttribute("href").replace(/^\/instrumentos\//, "") : null,
      inert: section ? section.hasAttribute("inert") : null,
      reserved: section ? [...section.querySelectorAll("span")].some((span) => span.textContent.trim() === "Reservado") : false,
    };
  }));
}

// Waits until the feed has settled on a screen other than `from` (or any screen when from is null).
async function settle(page, from = null, timeout = 8000) {
  const started = Date.now();
  let last = null;
  for (;;) {
    const state = await page.evaluate(() => {
      const feed = document.querySelector("main .snap-y");
      if (!feed || !feed.clientHeight) return null;
      const section = document.querySelector("[data-slot] > section:not([inert])");
      return {
        index: Math.round(feed.scrollTop / feed.clientHeight),
        aligned: Math.abs(feed.scrollTop - Math.round(feed.scrollTop / feed.clientHeight) * feed.clientHeight) < 2,
        slot: section ? Number(section.parentElement.dataset.slot) : -1,
        heading: section?.querySelector("h2")?.id || "",
      };
    });
    if (state && state.aligned && state.heading && state.slot === state.index && (from === null || state.index !== from)) {
      if (last && last.index === state.index && last.heading === state.heading) return state.index;
      last = state;
    }
    if (Date.now() - started > timeout) return state ? state.index : -1;
    await h.sleep(150);
  }
}

async function openFeed(t, page, route) {
  const response = await t.goto(page, route);
  await current(page).locator("h2").waitFor({ timeout: 30_000 });
  await settle(page, null);
  await h.sleep(300);
  return response;
}

async function pressNext(page) {
  const before = await slotIndex(page);
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  return settle(page, before);
}

async function pressPrevious(page) {
  const before = await slotIndex(page);
  await page.getByRole("button", { name: "Anterior", exact: true }).click();
  return settle(page, before);
}

async function key(page, name) {
  const before = await slotIndex(page);
  await page.keyboard.press(name);
  return settle(page, before);
}

// Straight to a screen, as a long swipe would: the feed loads the pages it needs as it gets near the end.
async function jump(page, index) {
  await page.evaluate((target) => {
    const feed = document.querySelector("main .snap-y");
    feed.scrollTo({ top: target * feed.clientHeight, behavior: "instant" });
  }, index);
  await h.sleep(250);
  return settle(page, null);
}

const STOP_TITLES = /^(Viste todo|Viste todos|No hay publicaciones|Esta lista no tiene|No pudimos)/;

// Every page of the feed in: moves to the last screen until it is the end (or an empty feed, or an error).
async function loadAll(page, { rounds = 60 } = {}) {
  for (let round = 0; round < rounds; round += 1) {
    const count = await slotCount(page);
    await jump(page, count - 1);
    const shown = await screen(page);
    if (STOP_TITLES.test(shown.heading)) return { index: count - 1, screen: shown };
    // Waiting for the next page ("Cargando publicaciones…").
    for (let wait = 0; wait < 80 && (await slotCount(page)) === count; wait += 1) {
      const now = await screen(page).catch(() => null);
      if (now && STOP_TITLES.test(now.heading)) return { index: count - 1, screen: now };
      await h.sleep(250);
    }
  }
  throw new Error("the feed did not reach its end");
}

// Moves to the first drawn screen that matches, loading pages on the way. Returns its index or -1.
async function seek(page, test, { from = 0, limit = 400 } = {}) {
  for (let index = from; index < limit; index += 1) {
    if (index >= (await slotCount(page)) - 1) {
      const count = await slotCount(page);
      await jump(page, count - 1);
      const shown = await screen(page);
      if (count - 1 >= from && test(shown)) return count - 1;
      if (STOP_TITLES.test(shown.heading)) return -1;
      for (let wait = 0; wait < 80 && (await slotCount(page)) === count; wait += 1) await h.sleep(250);
    }
    await jump(page, index);
    const shown = await screen(page);
    if (test(shown)) return index;
    if (STOP_TITLES.test(shown.heading) && /^Viste todo(s)? (lo nuevo|los resultados)$/.test(shown.heading)) return -1;
  }
  return -1;
}

// A finger on the glass: a drag from one point to another (Chrome DevTools touch events).
async function drag(page, from, to, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
  for (let step = 1; step <= steps; step += 1) {
    const x = from.x + ((to.x - from.x) * step) / steps;
    const y = from.y + ((to.y - from.y) * step) / steps;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    await h.sleep(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach().catch(() => {});
}

// Swipe up for the next listing (the finger moves up), down for the previous one, on the white panel.
async function swipeVertical(page, direction) {
  const { height, width } = page.viewportSize();
  const before = await slotIndex(page);
  const low = Math.round(height * 0.85);
  const high = Math.round(height * 0.35);
  if (direction === "next") await drag(page, { x: width / 2, y: low }, { x: width / 2, y: high });
  else await drag(page, { x: width / 2, y: high }, { x: width / 2, y: low });
  return settle(page, before);
}

// Swipe sideways on the photos of the screen in view (or on its photo area when it has one photo or none).
async function swipePhotos(page, direction) {
  const group = current(page).locator('[role="group"][aria-label^="Fotos de"]');
  const box = (await group.count()) ? await group.boundingBox() : await current(page).boundingBox().then((b) => ({ x: b.x, y: b.y + 60, width: b.width, height: b.height * 0.4 }));
  const y = box.y + box.height / 2;
  const right = box.x + box.width * 0.85;
  const left = box.x + box.width * 0.15;
  if (direction === "next") await drag(page, { x: right, y }, { x: left, y });
  else await drag(page, { x: left, y }, { x: right, y });
  await h.sleep(800);
}

async function photoCounter(page) {
  const text = await current(page).locator("span.tabular-nums").filter({ hasText: /\d+\s*\/\s*\d+/ }).first().textContent({ timeout: 3000 }).catch(() => null);
  return text ? text.replace(/\s+/g, " ").trim() : null;
}

async function liveText(page) {
  return (await page.locator('main p[aria-live="polite"].sr-only').first().textContent()).trim();
}

async function focusInfo(page) {
  return page.evaluate(() => {
    const node = document.activeElement;
    // The page itself (body) has no name: a check that wants a control never matches the whole page's text.
    if (!node || node === document.body || node === document.documentElement) return { tag: node ? node.tagName : "NONE", id: "", name: "" };
    return { tag: node.tagName, id: node.id || "", name: node.getAttribute("aria-label") || node.textContent.trim().slice(0, 60) };
  });
}

// The window's first Lima day for "Lo nuevo", as lib/descubrir.ts counts it.
function limaDay(time = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(time);
}
function shiftDay(day, days) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
const sevenDayStart = () => shiftDay(limaDay(), -6);

// The catalog's page route, as the feed reads it (GET only; paced live).
async function catalogPage(t, query) {
  if (h.LIVE) await h.paceCatalog();
  const response = await fetch(t.url(`/api/catalog/page?${query}`));
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

// Every listing of a feed, from the catalog's page route the feed itself reads.
async function feedListings(t, query, { pages = 20 } = {}) {
  const all = [];
  let total = null;
  const reserved = new Set();
  for (let page = 1; page <= pages; page += 1) {
    const { status, body } = await catalogPage(t, `${query}${page > 1 ? `&page=${page}` : ""}`);
    if (status !== 200) throw new Error(`page route answered ${status}`);
    total = body.total;
    for (const id of body.reserved || []) reserved.add(id);
    for (const item of body.listings) if (!all.some((seen) => seen.id === item.id)) all.push(item);
    if (body.listings.length < 24) break;
  }
  return { listings: all, total, reserved };
}

// Live: a small results list (between min and max listings) to walk to its end, from what the catalog holds.
async function smallList(t, { min = 3, max = 30 } = {}) {
  const categories = ["winds", "strings", "audio", "microphones", "keyboards", "percussion", "amplifiers", "basses", "pedals", "guitars"];
  let best = null;
  for (const category of categories) {
    const { status, body } = await catalogPage(t, `category=${category}`);
    if (status !== 200 || typeof body?.total !== "number") continue;
    if (body.total >= min && body.total <= max) return { query: `category=${category}`, total: body.total };
    if (body.total >= min && (!best || body.total < best.total)) best = { query: `category=${category}`, total: body.total };
  }
  return best;
}

// ------------------------------------------------------------------ fixtures (local)

// A Particular with a few published listings that only one results feed holds: their title shares a made-up word.
function particularListings(t, { count = 3, prices = [], photos = 2, extra = {}, word = unique(), city = "Lima", category = "guitars", type = "electric_guitar", daysAgo = 0, seller = null } = {}) {
  const owner = seller || t.account({ kind: "particular", city, region: city });
  const listings = Array.from({ length: count }, (_, index) => t.listing(owner, {
    title: `${["Guitarra", "Bajo", "Teclado", "Pedal", "Amplificador", "Micrófono", "Batería"][index % 7]} ${word} ${index + 1}`,
    price: prices[index] ?? 800 + index * 10,
    photos: Array.isArray(photos) ? photos[index] : photos,
    city,
    region: city,
    category,
    type,
    publishedDaysAgo: Array.isArray(daysAgo) ? daysAgo[index] : daysAgo,
    ...extra,
  }));
  return { seller: owner, listings, word };
}

// A period as the seller's own call makes it (set_listing_reservation), so every trigger runs.
function reserve(t, owner, listingId, days = 2) {
  return t.sqlAs(owner.id, `select public.set_listing_reservation(${t.literal(listingId)}, ${Number(days)}) as result`)[0]?.result;
}

// The marketplace session of a browser context (cookie laria-marketplace-session = base64url JSON {id}.signature).
async function sessionId(context) {
  const cookie = (await context.cookies()).find((item) => item.name === "laria-marketplace-session");
  if (!cookie) return null;
  try {
    return JSON.parse(Buffer.from(decodeURIComponent(cookie.value).split(".")[0], "base64url").toString("utf8")).id || null;
  } catch {
    return null;
  }
}

module.exports = {
  num, unique, barText, counter, current, slotIndex, slotCount, screen, drawnSlots, settle, openFeed, pressNext,
  pressPrevious, key, jump, loadAll, seek, drag, swipeVertical, swipePhotos, photoCounter, liveText, focusInfo, limaDay,
  shiftDay, sevenDayStart, catalogPage, feedListings, smallList, particularListings, reserve, sessionId, STOP_TITLES,
};
