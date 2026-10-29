// Group E: Descubrir (EASE-830 to EASE-859) and the maybes integration in Descubrir (EASE-880 to EASE-882).
// Live-marked checks read only what the page and the catalog's page route show; local ones make their own listings.
"use strict";
const h = require("./harness.cjs");
const e = require("./e-helpers.cjs");
const x = require("./e-local.cjs");

const NUEVO = () => `fotos=todas&desde=${e.sevenDayStart()}`;
const results = (query) => `/descubrir?modo=resultados&${query}`;
// Canonical functional-spec: sparse weeks widen to 30 Lima days, both in the feed and its end message.
async function nuevoWindow(t) {
  const weekly = await e.catalogPage(t, NUEVO());
  t.check(weekly.status === 200, `the 7-day page answers ${weekly.status}`);
  const days = weekly.status === 200 && weekly.body?.total < 12 ? 30 : 7;
  const api = days === 7 ? weekly : await e.catalogPage(t, `fotos=todas&desde=${e.shiftDay(e.limaDay(), -29)}`);
  if (days === 30) {
    t.check(api.status === 200, `the sparse-week 30-day page answers ${api.status}`);
    t.note("30-day fallback required by docs/functional-spec.md § Descubrir (fewer than 12 listings this week).");
  }
  return { api, days };
}

const DESC_TEST = "tests/maybes-descubrir.test.cjs";
const sameParams = (a, b) => {
  const left = [...new URL(a, "http://x").searchParams].map(String).sort().join("&");
  const right = [...new URL(b, "http://x").searchParams].map(String).sort().join("&");
  return left === right;
};
const limaMidnight = (day) => Date.parse(`${day}T05:00:00Z`);

// A small results list: own listings that only this feed holds (local), or a category with 3 to 30 listings (live).
async function smallFeed(t, { count = 4, prices, photos = 2, daysAgo = 0 } = {}) {
  if (t.live) {
    const list = await e.smallList(t, { min: 3, max: 30 });
    if (!list) t.skip("live: no category holds 3 to 30 listings to walk to its end");
    return { query: list.query, total: list.total, own: null };
  }
  const own = e.particularListings(t, { count, prices, photos, daysAgo });
  return { query: `q=${own.word}`, total: count, own };
}

async function open(t, page, route) {
  await e.openFeed(t, page, route);
  return e.screen(page);
}

async function disabled(page, name) {
  return (await page.getByRole("button", { name, exact: true }).getAttribute("aria-disabled")) === "true";
}

// Lo nuevo's listings of today (Lima) and of the window, from the page route the feed reads.
async function todayCounts(t) {
  const feed = await e.feedListings(t, NUEVO(), { pages: 20 });
  const today = limaMidnight(e.limaDay());
  return { total: feed.total, today: feed.listings.filter((item) => Date.parse(item.published_at) >= today).length, listings: feed.listings };
}

// Samples a scroll position over the frames after a press: did it pass through values between start and end?
async function glides(page, read, press) {
  await page.evaluate((code) => {
    window.__easeSamples = [];
    const get = new Function(`return (${code})()`);
    const tick = () => {
      window.__easeSamples.push(get());
      if (window.__easeSamples.length < 90) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, read);
  await press();
  await h.sleep(1600);
  const samples = await page.evaluate(() => window.__easeSamples);
  const start = samples[0];
  const end = samples[samples.length - 1];
  const between = samples.filter((value) => Math.abs(value - start) > 2 && Math.abs(value - end) > 2);
  return { start, end, between: between.length, moved: Math.abs(end - start) > 2 };
}

module.exports = [
  // ------------------------------------------------------------------ entries
  {
    id: "EASE-830",
    live: true,
    timeout: 300_000,
    async run(t) {
      const page = await t.page({ phone: true });
      await t.goto(page, "/");
      const link = page.locator('main a[href="/descubrir"]').first();
      await link.waitFor({ timeout: 20_000 }).catch(() => {});
      t.check(await link.count(), "the home links to /descubrir");
      const text = (await link.innerText()).replace(/\s+/g, " ").trim();
      t.check(/Descubrir lo nuevo/.test(text), `the link reads "${text}"`);
      const headingOf = () => link.evaluate((node) => {
        for (let el = node.parentElement; el && el !== document.body; el = el.parentElement) {
          const title = el.querySelector("h2");
          if (title) return { id: title.id, text: title.textContent.trim() };
        }
        return { id: "", text: "" };
      });
      const heading = await headingOf();
      t.check(heading.id === "para-ti-titulo", `it sits by the Para ti heading (#${heading.id}, reading "${heading.text}" for a first visit)`);
      const choice = page.locator('section[aria-labelledby="que-tocas-titulo"] ul button').first();
      if (await choice.count()) {
        await choice.click();
        await page.locator('section[aria-labelledby="que-tocas-titulo"]').getByRole("button", { name: "Listo" }).click();
        await h.sleep(800);
        const personal = await headingOf();
        t.check(personal.text === "Para ti" && await link.count() === 1, `with an interest chosen the heading reads "${personal.text}" and still offers it`);
      }
      await link.scrollIntoViewIfNeeded();
      await t.shot(page, "home-entry");
      const opened = Date.now();
      await link.click();
      await page.waitForURL((url) => url.pathname === "/descubrir", { timeout: 30_000 });
      await e.current(page).locator("h2").waitFor({ timeout: 30_000 });
      await e.settle(page, null);
      const bar = await e.barText(page);
      t.check(/^Lo nuevo · 1 de [\d,]+$/.test(bar), `the bar reads "${bar}"`);
      const shown = await e.screen(page);
      const { api, days } = await nuevoWindow(t);
      const list = api.body?.listings || [];
      const at = list.findIndex((item) => item.slug === shown.slug);
      const newer = at > 0 ? list.slice(0, at) : [];
      t.check(at === 0 || (at > 0 && newer.every((item) => Date.parse(item.published_at) >= opened - 5_000)),
        `the first screen is the newest listing of the ${days} Lima days (position ${at + 1} in the page route's answer; ${newer.length} published since)`);
      const total = (await e.counter(page))?.total;
      t.check(typeof api.body?.total === "number" && api.body.total > 0 && Math.abs(total - api.body.total) <= newer.length, `the count ${total} is the window's ${api.body?.total}`);
      const caption = days === 7 ? /^Publicado (hoy|ayer|hace [2-6] días)$/ : /^Publicado .+/;
      t.check(caption.test(shown.published || "") && at >= 0 && Date.parse(list[at].published_at) >= limaMidnight(e.shiftDay(e.limaDay(), 1 - days)), `the first screen says "${shown.published}" within its ${days}-day window`);
      await t.shot(page, "first-screen");
      // The home's markup is the same for every visitor: with or without the visit cookies (and, locally, signed in).
      const strip = (html) => html.replace(/nonce="[^"]*"/g, "");
      const plain = async (cookie) => strip(await (await fetch(t.url("/"), { headers: cookie ? { cookie } : {} })).text());
      let cookie = `laria_ultima_visita=${Date.now() - 3_600_000}; laria_visita_anterior=${Date.now() - 86_400_000}`;
      if (!t.live) {
        const signed = await t.page({ as: t.demo.buyer });
        cookie = (await signed.context().cookies()).map((item) => `${item.name}=${item.value}`).join("; ");
      }
      let same = false;
      for (let round = 0; round < 3 && !same; round += 1) {
        const [a, b] = [await plain(null), await plain(cookie)];
        same = a === b;
        if (!same) await h.sleep(2_000);
      }
      t.check(same, `the home's HTML is identical for a visitor and for ${t.live ? "a returning visitor" : "a signed-in buyer"}`);
    },
  },
  {
    id: "EASE-831",
    live: true,
    timeout: 300_000,
    async run(t) {
      let route;
      if (t.live) {
        const list = await e.smallList(t, { min: 3, max: 24 });
        if (!list) t.skip("live: no category holds 3 to 24 listings");
        route = `/listados?${list.query}&sort=price_asc`;
      } else {
        const own = e.particularListings(t, { count: 6, prices: [1500, 900, 1200, 700, 1800, 1100], city: "Tacna", category: "basses", type: "electric_bass" });
        route = `/listados?q=${own.word}&location=Tacna&sort=price_asc`;
      }
      const page = await t.page();
      await t.goto(page, route);
      const grid = await page.locator('main h2 a[href^="/instrumentos/"]').evaluateAll((links) => links.map((a) => a.getAttribute("href").replace(/^\/instrumentos\//, "")));
      t.check(grid.length >= 3, `the list shows ${grid.length} cards`);
      if (!t.live) t.check(grid.length === 6, "all six of the list");
      const entry = page.getByRole("link", { name: "Ver en Descubrir" });
      t.check(await entry.count() === 1, "one visible Ver en Descubrir");
      const href = await entry.first().getAttribute("href");
      const carried = new URL(href, t.base).searchParams;
      t.check(carried.get("modo") === "resultados" && carried.get("sort") === "price_asc" && sameParams(href.replace(/modo=resultados&?/, ""), route.replace(/^\/listados/, "")),
        `Ver en Descubrir carries the list's filters and order (${href})`);
      await entry.first().click();
      await page.waitForURL((url) => url.pathname === "/descubrir", { timeout: 30_000 });
      await e.current(page).locator("h2").waitFor({ timeout: 30_000 });
      await e.settle(page, null);
      await t.shot(page, "first");
      const walked = [];
      for (let step = 0; step < 40; step += 1) {
        const shown = await e.screen(page);
        if (!shown.slug) break;
        walked.push(shown.slug);
        await e.pressNext(page);
      }
      t.check(walked.length === grid.length && walked.every((slug, index) => slug === grid[index]),
        `Descubrir walks the list in the grid's order (${walked.length} screens, ${grid.length} cards)`);
      const end = await e.screen(page);
      t.check(end.heading === "Viste todos los resultados", `then the end: "${end.heading}"`);
      const line = /(\d+) publicaci(?:ones|ón) en ([^.]+)\./.exec(end.text);
      t.check(line && Number(line[1]) === grid.length, `the end says "${line ? line[0] : end.text.slice(0, 120)}"`);
      t.check(await disabled(page, "Siguiente"), "Siguiente is disabled on the end");
      const at = await e.slotIndex(page);
      await page.getByRole("button", { name: "Siguiente", exact: true }).click({ force: true }).catch(() => {});
      await h.sleep(800);
      t.check(await e.slotIndex(page) === at, "nothing loops back");
      await t.shot(page, "end");
      await page.getByRole("link", { name: "Salir de Descubrir" }).click();
      await page.waitForURL((url) => url.pathname === "/listados", { timeout: 30_000 });
      t.check(sameParams(page.url(), route), `Salir de Descubrir returns to the list (${new URL(page.url()).pathname}${new URL(page.url()).search})`);
    },
  },
  {
    id: "EASE-832",
    live: true,
    timeout: 240_000,
    async run(t) {
      x.ciAsserts(t, DESC_TEST, ["only a list with results offers it", "one entry for desktop, one for phones"]);
      const empty = `/listados?q=zzqx${Date.now().toString(36)}`;
      for (const options of [{ width: 1280 }, { phone: true }]) {
        const page = await t.page(options);
        await t.goto(page, empty);
        const text = await x.mainText(page);
        t.check(/0 resultados|Sin resultados|No encontramos/i.test(text), `${options.phone ? "390" : "1280"} px: the empty search shows no results`);
        t.check(await page.getByRole("link", { name: "Ver en Descubrir" }).count() === 0, `${options.phone ? "390" : "1280"} px: an empty list offers no Ver en Descubrir`);
      }
      const list = "/listados?category=guitars";
      const desk = await t.page({ width: 1280 });
      await t.goto(desk, list);
      const link = desk.getByRole("link", { name: "Ver en Descubrir" });
      t.check(await link.count() === 1, "desktop: one Ver en Descubrir");
      const sort = await desk.locator("#orden-boton").boundingBox();
      const box = await link.first().boundingBox();
      t.check(sort && box && Math.abs((box.y + box.height / 2) - (sort.y + sort.height / 2)) < 12 && Math.abs(sort.x - (box.x + box.width)) < 120,
        `desktop: a button beside Ordenar (button ${box && Math.round(box.x)},${box && Math.round(box.y)}; Ordenar ${sort && Math.round(sort.x)},${sort && Math.round(sort.y)})`);
      await t.shot(desk, "desktop");
      const phone = await t.page({ phone: true });
      await t.goto(phone, list);
      const filter = await phone.getByRole("button", { name: /^Filtrar/ }).first().boundingBox();
      const order = await phone.getByRole("button", { name: /^Ordenar/ }).first().boundingBox();
      const plink = phone.getByRole("link", { name: "Ver en Descubrir" });
      const pbox = await plink.first().boundingBox();
      t.check(await plink.count() === 1 && filter && order && pbox && pbox.y >= Math.max(filter.y + filter.height, order.y + order.height) - 1,
        "phone: a link under Filtrar and Ordenar");
      await t.shot(phone, "phone");
    },
  },
  // ------------------------------------------------------------------ the page route
  {
    id: "EASE-833",
    async run(t) {
      x.ciAsserts(t, DESC_TEST, ["Lo nuevo counts Lima days", "the page opens on Lo nuevo's last 7 days, or 30 when the week holds fewer than 12"]);
      const feed = await e.feedListings(t, NUEVO(), { pages: 20 });
      const start = limaMidnight(e.sevenDayStart());
      if (t.live && Number.isInteger(feed.total) && feed.total < 12) t.skip(`live: the dense-week branch requires at least 12 listings (${feed.total}); sparse fallback is checked by EASE-830 and EASE-842`);
      t.check(feed.total >= 12, `the week holds ${feed.total} listings (12 or more, so 7 days)`);
      t.check(feed.listings.every((item) => Date.parse(item.published_at) >= start), "every listing was published since midnight Lima 6 days ago");
      t.check(feed.listings.every((item, index, all) => index === 0 || Date.parse(all[index - 1].published_at) >= Date.parse(item.published_at)), "newest first");
      const before = h.sql(`select count(*)::int as n from public.listings where status = 'approved' and published_at < ${x.L(new Date(start).toISOString())}::timestamptz`)[0].n;
      const all = await e.catalogPage(t, "fotos=todas");
      t.check(all.status === 200 && all.body.total > feed.total && before > 0, `a results feed has no date window (${all.body?.total} listings, ${before} older than the week)`);
    },
  },
  {
    id: "EASE-834",
    live: true,
    async run(t) {
      const old = e.shiftDay(e.limaDay(), -32);
      const future = e.shiftDay(e.limaDay(), 2);
      for (const desde of [old, future, "2026-13-45", "ayer"]) {
        const { status, body } = await e.catalogPage(t, `fotos=todas&desde=${desde}`);
        t.check(status === 400 && !(body?.listings?.length), `desde=${desde} answers ${status} with ${body?.listings?.length ?? 0} listings`);
      }
      const ok = await e.catalogPage(t, `fotos=todas&desde=${e.shiftDay(e.limaDay(), -30)}`);
      t.check(ok.status === 200, `the window's oldest day, 30 days back, is served (${ok.status})`);
      const edge = await e.catalogPage(t, `fotos=todas&desde=${e.shiftDay(e.limaDay(), -31)}`);
      t.note(`desde 31 days back answers ${edge.status} (the unit test's "31 days back is refused")`);
      if (!t.live) x.ciAsserts(t, DESC_TEST, ["a feed's start reaches at most 31 days back", "31 days back is refused"]);
    },
  },
  {
    id: "EASE-835",
    live: true,
    async run(t) {
      const page1 = await e.catalogPage(t, "");
      t.check(page1.status === 200 && typeof page1.body?.total === "number", `the plain page answers ${page1.status} with total ${page1.body?.total}`);
      const listings = page1.body?.listings || [];
      t.check(listings.length > 0 && listings.every((item) => (item.listing_photos || []).length <= 1), `one photo a card (${listings.length} cards)`);
      const page = await t.page();
      let same = false;
      for (let round = 0; round < 3 && !same; round += 1) {
        await t.goto(page, "/listados");
        const grid = await page.locator('main h2 a[href^="/instrumentos/"]').evaluateAll((links) => links.map((a) => a.getAttribute("href").replace(/^\/instrumentos\//, "")));
        const api = round === 0 ? page1 : await e.catalogPage(t, "");
        same = grid.length > 0 && grid.slice(0, 20).every((slug, index) => api.body.listings[index]?.slug === slug);
      }
      t.check(same, "the route's first page is the catalog's first page, in its order");
      const next = await e.catalogPage(t, "page=2");
      t.check(next.status === 200 && Array.isArray(next.body?.listings), `page=2 answers ${next.status} (${next.body?.listings?.length} cards)`);
    },
  },
  {
    id: "EASE-836",
    live: true,
    async run(t) {
      const { status, body } = await e.catalogPage(t, NUEVO());
      t.check(status === 200 && typeof body?.total === "number", `fotos=todas&desde answers ${status} with total ${body?.total}`);
      const listings = body?.listings || [];
      if (t.live && status === 200 && !listings.length) t.skip("live: no listings in the seven-day window to verify multi-photo responses");
      t.check(listings.every((item) => (item.listing_photos || []).length <= 10), "at most 10 photos a listing");
      t.check(listings.every((item) => (item.listing_photos || []).every((photo, index, all) => index === 0 || all[index - 1].sort_order <= photo.sort_order)), "in their order");
      t.check(listings.every((item) => Date.parse(item.published_at) >= limaMidnight(e.sevenDayStart())), "published from the window's first day");
      t.check(listings.some((item) => (item.listing_photos || []).length > 1), "listings carry more than one photo");
      if (!t.live) {
        const own = e.particularListings(t, { count: 1, photos: 12 });
        const { body: mine } = await e.catalogPage(t, `q=${own.word}&fotos=todas`);
        const item = mine?.listings?.[0];
        const stored = h.sql(`select image_url from public.listing_photos where listing_id = ${x.L(own.listings[0].id)} order by sort_order`).map((row) => row.image_url);
        t.check(item && item.listing_photos.length === 10 && item.listing_photos.every((photo, index) => photo.image_url === stored[index]),
          `a listing with 12 photos carries its first 10 in order (${item?.listing_photos?.length})`);
        t.check(item && item.photo_count === 12, `and says it has ${item?.photo_count} photos`);
      }
    },
  },
  // ------------------------------------------------------------------ moving
  {
    id: "EASE-837",
    live: true,
    timeout: 300_000,
    async run(t) {
      const feed = await smallFeed(t, { count: 4 });
      const page = await t.page({ phone: true });
      await open(t, page, results(feed.query));
      t.check(await e.slotIndex(page) === 0 && await disabled(page, "Anterior"), "Anterior is disabled on the first screen");
      const moves = [
        ["swipe up", () => e.swipeVertical(page, "next"), 1], ["swipe down", () => e.swipeVertical(page, "prev"), 0],
        ["Siguiente", () => e.pressNext(page), 1], ["Anterior", () => e.pressPrevious(page), 0],
        ["↓", () => e.key(page, "ArrowDown"), 1], ["↑", () => e.key(page, "ArrowUp"), 0],
        ["PageDown", () => e.key(page, "PageDown"), 1], ["PageUp", () => e.key(page, "PageUp"), 0],
      ];
      for (const [name, move, expected] of moves) {
        await page.locator("main").first().click({ position: { x: 5, y: 300 } }).catch(() => {});
        const index = await move();
        t.check(index === expected, `${name} moves to screen ${index + 1} (expected ${expected + 1})`);
      }
      const count = await e.slotCount(page);
      await e.jump(page, count - 1);
      const end = await e.screen(page);
      t.check(/^Viste todos los resultados/.test(end.heading) && await disabled(page, "Siguiente"), `Siguiente is disabled on the end ("${end.heading}")`);
      await t.shot(page, "end");
    },
  },
  {
    id: "EASE-838",
    live: true,
    timeout: 300_000,
    async run(t) {
      const page = await t.page({ phone: true });
      let total = 4;
      if (t.live) {
        await open(t, page, "/descubrir");
        const at = await e.seek(page, (s) => /Foto 1 \/ [3-9]|Foto 1 \/ 10/.test(s.text), { limit: 60 });
        if (at < 0) t.skip("live: no listing with 3 or more photos in the first screens");
        total = Number(/Foto 1 \/ (\d+)/.exec((await e.screen(page)).text)[1]);
      } else {
        const own = e.particularListings(t, { count: 2, photos: [4, 0], prices: [100, 200] });
        await open(t, page, results(`q=${own.word}&sort=price_asc`));
      }
      const read = async () => Number(/(\d+)\s*\/\s*\d+/.exec((await e.photoCounter(page)) || "")?.[1]);
      const counterText = await e.photoCounter(page);
      t.check(new RegExp(`1 / ${total}`).test(counterText || ""), `the counter reads "${counterText}"`);
      const group = e.current(page).locator('[role="group"][aria-label^="Fotos de"]');
      t.check(await group.count() === 1, "the photos are a named group");
      await e.current(page).getByRole("button", { name: "Foto siguiente" }).click();
      await h.sleep(700);
      t.check(await read() === 2, "Foto siguiente shows photo 2");
      await t.shot(page, "photo-2");
      await group.focus().catch(() => {});
      await page.keyboard.press("ArrowRight");
      await h.sleep(700);
      t.check(await read() === 3, "→ shows photo 3");
      await e.swipePhotos(page, "next");
      t.check(await read() === Math.min(4, total), `a swipe shows photo ${Math.min(4, total)}`);
      if (total === 4) {
        const next = e.current(page).getByRole("button", { name: "Foto siguiente" });
        const off = (await next.getAttribute("aria-disabled")) === "true" || (await next.isDisabled());
        await next.click({ force: true }).catch(() => {});
        await page.keyboard.press("ArrowRight");
        await e.swipePhotos(page, "next");
        t.check(off && await read() === 4, "the last photo stays: no wrap-around");
      }
      await page.keyboard.press("ArrowLeft");
      await h.sleep(700);
      await e.current(page).getByRole("button", { name: "Foto anterior" }).click();
      await h.sleep(700);
      await e.swipePhotos(page, "prev");
      t.check(await read() === Math.max(1, Math.min(4, total) - 3), "← , Foto anterior and a swipe go back");
      const first = e.current(page).getByRole("button", { name: "Foto anterior" });
      t.check((await first.getAttribute("aria-disabled")) === "true" || (await first.isDisabled()), "Foto anterior is disabled on the first photo");
      if (t.live) {
        const none = await e.seek(page, (s) => /Sin foto/.test(s.text), { from: await e.slotIndex(page), limit: 80 });
        if (none < 0) t.skip("live: no listing without photos among the first screens; photo moves verified");
      } else {
        await e.pressNext(page);
      }
      t.check(/Sin foto/.test((await e.screen(page)).text), "a listing without photos says Sin foto");
      await t.shot(page, "sin-foto");
    },
  },
  {
    id: "EASE-839",
    live: true,
    timeout: 240_000,
    async run(t) {
      const page = await t.page({ phone: true });
      if (t.live) {
        await open(t, page, "/descubrir");
        if (await e.seek(page, (s) => /Foto 1 \/ ([2-9]|10)/.test(s.text), { limit: 60 }) < 0) t.skip("live: no listing with 2 photos in the first screens");
      } else {
        const own = e.particularListings(t, { count: 2, photos: 3 });
        await open(t, page, results(`q=${own.word}`));
      }
      const store = () => page.evaluate(() => [localStorage.getItem("laria:favoritos"), localStorage.getItem("laria:descubrir-ocultos")]);
      const before = { index: await e.slotIndex(page), storage: await store(), counter: await e.photoCounter(page) };
      await e.swipePhotos(page, "next");
      const left = { index: await e.slotIndex(page), counter: await e.photoCounter(page) };
      await e.swipePhotos(page, "prev");
      const right = { index: await e.slotIndex(page), counter: await e.photoCounter(page), storage: await store() };
      t.check(left.index === before.index && right.index === before.index, "a left or right swipe stays on the listing");
      t.check(left.counter !== before.counter && right.counter === before.counter, `it only moves the photos (${before.counter} → ${left.counter} → ${right.counter})`);
      t.check(JSON.stringify(right.storage) === JSON.stringify(before.storage), "nothing is saved or hidden by a swipe");
      const heart = e.current(page).getByRole("button", { name: /^(Guardar en favoritos|Quitar de favoritos)/ });
      const hide = e.current(page).getByRole("button", { name: "No me interesa" });
      t.check(await heart.count() === 1 && await hide.count() === 1, "♥ and No me interesa are buttons with their names");
      await t.shot(page, "buttons");
    },
  },
  // ------------------------------------------------------------------ stops and ends
  {
    id: "EASE-840",
    live: true,
    timeout: 420_000,
    async run(t) {
      const counts = await todayCounts(t);
      if (!counts.today || counts.today >= counts.total) t.skip(`no earlier days after today's ${counts.today} of ${counts.total}`);
      const page = await t.page({ phone: true });
      await open(t, page, "/descubrir");
      const at = await e.seek(page, (s) => s.heading === "Viste todo lo nuevo de hoy", { from: Math.max(0, counts.today - 3), limit: counts.today + 40 });
      t.check(at >= 0, `a stop after today's listings (screen ${at + 1})`);
      if (at < 0) return;
      const stop = await e.screen(page);
      const after = await todayCounts(t);
      const more = /Sigue para ver (\d+) más de los últimos 7 días\./.exec(stop.text);
      t.check(more && [counts.total - counts.today, after.total - after.today].includes(Number(more[1])), `"${more ? more[0] : stop.text.slice(0, 140)}" (${counts.total - counts.today} earlier)`);
      t.check(await e.current(page).getByRole("button", { name: "Ver los de días anteriores" }).count() === 1, "Ver los de días anteriores");
      t.check(await e.current(page).getByRole("link", { name: "Volver al inicio" }).count() === 1, "Volver al inicio");
      await t.shot(page, "today-stop");
      await e.jump(page, at - 1);
      t.check((await e.screen(page)).published === "Publicado hoy", "the screen before it was published today");
      await e.jump(page, at);
      const before = await e.slotIndex(page);
      await e.current(page).getByRole("button", { name: "Ver los de días anteriores" }).click();
      await e.settle(page, before);
      const next = await e.screen(page);
      t.check(next.slug && next.published && next.published !== "Publicado hoy", `it moves on to "${next.published}"`);
    },
  },
  {
    id: "EASE-841",
    live: true,
    timeout: 420_000,
    async run(t) {
      if (!t.live) x.ciAsserts(t, DESC_TEST, ["pauses every 48"]);
      const page = await t.page({ phone: true });
      await open(t, page, "/descubrir");
      const total = (await e.counter(page))?.total;
      if (!(total > 48)) t.skip(`Lo nuevo holds ${total} listings, not more than 48`);
      const at = await e.seek(page, (s) => /^Llevas 48 de/.test(s.heading), { from: 44, limit: 70 });
      t.check(at >= 0, `a pause after 48 listings (screen ${at + 1})`);
      if (at < 0) return;
      const stop = await e.screen(page);
      t.check(new RegExp(`^Llevas 48 de ${total.toLocaleString("en-US")}$|^Llevas 48 de ${total}$`).test(stop.heading), `"${stop.heading}" (total ${total})`);
      t.check(await e.current(page).getByRole("button", { name: "Seguir" }).count() === 1, "Seguir");
      t.check(await e.current(page).getByRole("link", { name: "Volver al inicio" }).count() === 1, "and the way back home");
      await t.shot(page, "pause");
      const before = await e.slotIndex(page);
      await e.current(page).getByRole("button", { name: "Seguir" }).click();
      await e.settle(page, before);
      t.check((await e.screen(page)).slug, "Seguir moves on to the next listing");
    },
  },
  {
    id: "EASE-842",
    live: true,
    timeout: 600_000,
    async run(t) {
      if (!t.live) x.ciAsserts(t, DESC_TEST, ["ends visibly"]);
      const page = await t.page({ phone: true });
      await open(t, page, "/descubrir");
      const total = (await e.counter(page))?.total;
      const { days } = await nuevoWindow(t);
      const { screen: end } = await e.loadAll(page, { rounds: 40 });
      t.check(end.heading === "Viste todo lo nuevo", `Lo nuevo ends with "${end.heading}"`);
      const line = new RegExp(`Las ([\\d,]+) publicaciones de los últimos ${days} días\\.`).exec(end.text);
      t.check(line && Math.abs(e.num(line[1]) - total) <= 3, `"${line ? line[0] : end.text.slice(0, 120)}" (bar total ${total})`);
      t.check(await disabled(page, "Siguiente"), "Siguiente is disabled");
      const at = await e.slotIndex(page);
      await page.keyboard.press("ArrowDown");
      await h.sleep(800);
      t.check(await e.slotIndex(page) === at, "nothing loops back");
      await t.shot(page, "nuevo-end");
      const feed = await smallFeed(t, { count: 3 });
      const other = await t.page({ phone: true });
      await open(t, other, results(feed.query));
      const done = (await e.loadAll(other)).screen;
      const words = /([\d,]+) publicaci(?:ones|ón) en ([^.]+)\./.exec(done.text);
      t.check(done.heading === "Viste todos los resultados" && words && e.num(words[1]) === feed.total, `a results feed ends with "${done.heading}" and "${words ? words[0] : done.text.slice(0, 120)}"`);
      t.check(await disabled(other, "Siguiente"), "Siguiente is disabled there too");
      await t.shot(other, "results-end");
    },
  },
  {
    id: "EASE-843",
    live: true,
    async run(t) {
      if (!t.live) x.ciAsserts(t, DESC_TEST, ["No hay publicaciones nuevas", "the stops say what is true and offer one primary way on"]);
      const word = `zzqx${Date.now().toString(36)}`;
      const page = await t.page({ phone: true });
      await open(t, page, results(`q=${word}`));
      const shown = await e.screen(page);
      t.check(shown.heading === "Esta lista no tiene publicaciones", `an empty results feed: "${shown.heading}"`);
      t.check(/Vuelve a la lista para cambiar los filtros\./.test(shown.text), "it says to go back to the list");
      const back = await e.current(page).getByRole("link", { name: "Volver a la lista" }).getAttribute("href");
      t.check(back && sameParams(back, `/listados?q=${word}`) && back.startsWith("/listados"), `Volver a la lista → ${back}`);
      t.check(await e.current(page).getByRole("link", { name: "Volver al inicio" }).getAttribute("href") === "/", "Volver al inicio → /");
      await t.shot(page, "empty-results");
    },
  },
  {
    id: "EASE-844",
    timeout: 300_000,
    async run(t) {
      const own = e.particularListings(t, { count: 26, photos: 1, daysAgo: 9 });
      const page = await t.page({ phone: true });
      await open(t, page, results(`q=${own.word}`));
      const count = await e.slotCount(page);
      t.check(count === 25, `the first page draws 24 listings and a loading screen (${count} slots)`);
      await page.route("**/api/catalog/page**", (route) => route.abort("internetdisconnected"));
      await e.jump(page, count - 1);
      const failed = await x.until(async () => { const s = await e.screen(page); return /^No pudimos/.test(s.heading) ? s : null; }, { timeout: 20_000 });
      t.check(failed && failed.heading === "No pudimos cargar más publicaciones", `a failed next page says "${failed?.heading}"`);
      t.check(failed && /Revisa tu conexión y vuelve a intentarlo\./.test(failed.text), "Revisa tu conexión y vuelve a intentarlo.");
      await t.shot(page, "error");
      await page.unroute("**/api/catalog/page**");
      await e.current(page).getByRole("button", { name: "Reintentar" }).click();
      const loaded = await x.until(async () => (await e.slotCount(page)) > count, { timeout: 20_000 });
      t.check(loaded, `Reintentar loads that page (${await e.slotCount(page)} slots)`);
      // The first page: the server's read fails and the feed has nothing to show.
      const first = await t.page({ phone: true });
      let rewritten = false;
      await first.route(/\/descubrir\?/, async (route) => {
        if (route.request().resourceType() !== "document") return route.continue();
        const response = await route.fetch();
        const body = await response.text();
        const changed = body.replace(/\\"initial\\":\{/, '\\"initial\\":null,\\"easeDropped\\":{');
        rewritten = changed !== body;
        return route.fulfill({ response, body: changed });
      });
      await first.route("**/api/catalog/page**", (route) => route.abort("internetdisconnected"));
      await t.goto(first, results(`q=${own.word}`));
      const empty = await x.until(async () => {
        const text = await x.mainText(first);
        return /No pudimos cargar las publicaciones/.test(text) ? text : null;
      }, { timeout: 20_000 });
      if (!rewritten) t.note("could not take the first page out of the server's answer; the first-page wording rests on CI");
      t.check(!rewritten || empty, "with no first page: No pudimos cargar las publicaciones");
      if (rewritten && empty) {
        await t.shot(first, "first-error");
        await first.unroute("**/api/catalog/page**");
        await first.getByRole("button", { name: "Reintentar" }).click();
        const back = await x.until(async () => (await e.screen(first).catch(() => null))?.slug, { timeout: 20_000 });
        t.check(back, "Reintentar loads the first page");
      }
    },
  },
  // ------------------------------------------------------------------ No me interesa
  {
    id: "EASE-845",
    live: true,
    timeout: 360_000,
    async run(t) {
      const page = await t.page({ phone: true });
      await t.goto(page, "/");
      const onHome = new Set(await page.locator('main a[href^="/instrumentos/"]').evaluateAll((links) => links.map((a) => a.getAttribute("href").replace(/^\/instrumentos\//, ""))));
      await open(t, page, "/descubrir");
      const at = await e.seek(page, (s) => s.slug && onHome.has(s.slug), { limit: 30 });
      if (at < 0) t.skip("none of the first 30 Lo nuevo listings is on the home yet");
      const target = await e.screen(page);
      await e.current(page).getByRole("button", { name: "No me interesa" }).click();
      await h.sleep(600);
      const toast = await page.locator('p[role="status"]').filter({ hasText: "no volverás a ver" }).first().innerText().catch(() => "");
      t.check(toast.includes(`Listo, no volverás a ver “${target.heading}” en Descubrir.`) && /Deshacer/.test(toast), `the notice: "${toast.replace(/\s+/g, " ")}"`);
      const slots = await e.drawnSlots(page);
      t.check(!slots.some((slot) => slot.slug === target.slug) && (await e.screen(page)).slug !== target.slug, "the listing leaves the feed at once");
      await t.shot(page, "hidden");
      // While it is hidden here: this browser's home and catalog, and another browser's Descubrir, still show it. The
      // home is read at once in a second tab (other runs keep adding newer listings that push it off the home).
      const tab = await page.context().newPage();
      await t.goto(tab, "/");
      t.check(await tab.locator(`main a[href="/instrumentos/${target.slug}"]`).count() > 0, "the home still shows it");
      await t.goto(tab, `/listados?q=${encodeURIComponent(target.heading)}`);
      t.check(await tab.locator(`main a[href="/instrumentos/${target.slug}"]`).count() > 0, "the catalog still shows it");
      await tab.close();
      const other = await t.page({ phone: true });
      await open(t, other, "/descubrir");
      t.check(await e.seek(other, (s) => s.slug === target.slug, { limit: at + 10 }) >= 0, "another browser still shows it in Descubrir");
      await page.bringToFront();
      await page.getByRole("button", { name: "Deshacer" }).click();
      await h.sleep(800);
      const back = await e.drawnSlots(page);
      const inView = await e.screen(page);
      const where = await e.counter(page);
      t.check(back.some((slot) => slot.slug === target.slug), "Deshacer puts it back in the feed");
      t.check(inView.slug === target.slug, inView.slug === target.slug ? "and in view" : `and in view (the view stays on the next listing, ${where?.position} de ${where?.total}; it is back one screen up)`);
      await t.shot(page, "undone");
      // Hide it again from its own screen, then reload.
      for (let step = 0; step < 3 && (await e.screen(page)).slug !== target.slug; step += 1) await e.pressPrevious(page);
      await e.current(page).getByRole("button", { name: "No me interesa" }).click();
      await h.sleep(500);
      await page.reload();
      await e.current(page).locator("h2").waitFor({ timeout: 30_000 });
      t.check(await e.seek(page, (s) => s.slug === target.slug, { limit: at + 5 }) < 0, "after a reload it stays out of Descubrir");
    },
  },
  {
    id: "EASE-846",
    live: true,
    timeout: 300_000,
    async run(t) {
      const feed = await smallFeed(t, { count: 4 });
      const page = await t.page({ phone: true });
      await open(t, page, results(feed.query));
      const first = await e.screen(page);
      await e.current(page).getByRole("button", { name: "No me interesa" }).click();
      await h.sleep(700);
      const second = await e.screen(page);
      await e.current(page).getByRole("button", { name: "No me interesa" }).click();
      await h.sleep(700);
      const { screen: end } = await e.loadAll(page);
      t.check(/Omitimos 2 que marcaste con “No me interesa”\./.test(end.text), `the end says "${/Omitimos[^.]*\./.exec(end.text)?.[0] || end.text.slice(0, 160)}"`);
      await t.shot(page, "end-hidden");
      const before = await e.slotIndex(page);
      await e.current(page).getByRole("button", { name: "Volver a mostrarlas" }).click();
      await e.settle(page, before);
      const now = await e.screen(page);
      t.check(now.slug === first.slug, `Volver a mostrarlas moves to the first hidden one (${now.heading})`);
      await e.pressNext(page);
      t.check((await e.screen(page)).slug === second.slug, "and the second is back after it");
      t.check(await page.evaluate(() => localStorage.getItem("laria:descubrir-ocultos")) === null, "nothing stays hidden");
    },
  },
  {
    id: "EASE-847",
    live: true,
    timeout: 240_000,
    async run(t) {
      if (!t.live) x.ciAsserts(t, DESC_TEST, ["cleared with the rest"]);
      const page = await t.page({ phone: true });
      const shown = await open(t, page, "/descubrir");
      await e.current(page).getByRole("button", { name: "No me interesa" }).click();
      await h.sleep(600);
      t.check(JSON.parse(await page.evaluate(() => localStorage.getItem("laria:descubrir-ocultos")) || "[]").length === 1, "one listing is hidden on this device");
      await t.goto(page, "/favoritos");
      await page.getByRole("button", { name: "Borrar lo guardado en este dispositivo" }).click();
      const dialog = page.getByRole("dialog").or(page.getByRole("alertdialog")).first();
      await dialog.waitFor({ timeout: 10_000 });
      const said = (await dialog.innerText()).replace(/\s+/g, " ");
      t.check(/lo que ocultaste en Descubrir/.test(said), `the confirmation says "${said.slice(0, 200)}"`);
      await t.shot(page, "confirm");
      await dialog.getByRole("button", { name: "Borrar", exact: true }).click();
      await h.sleep(600);
      t.check(await page.evaluate(() => localStorage.getItem("laria:descubrir-ocultos")) === null, "the hidden list is cleared");
      await open(t, page, "/descubrir");
      t.check(await e.seek(page, (s) => s.slug === shown.slug, { limit: 6 }) >= 0, "the listing is back in Descubrir");
    },
  },
  {
    id: "EASE-848",
    live: true,
    timeout: 240_000,
    async run(t) {
      if (!t.live) x.ciAsserts(t, DESC_TEST, ["No me interesa is kept on this device for Descubrir only, capped"]);
      const page = await t.page({ phone: true });
      await t.goto(page, "/favoritos");
      await page.evaluate(() => localStorage.setItem("laria:descubrir-ocultos", "{roto"));
      const shown = await open(t, page, "/descubrir");
      t.check(shown.slug && (await e.counter(page))?.position === 1, "broken storage reads as nothing hidden");
      const filler = Array.from({ length: 200 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
      await page.evaluate((ids) => localStorage.setItem("laria:descubrir-ocultos", JSON.stringify([...ids, "no-es-un-id", 5])), filler);
      await page.reload();
      await e.current(page).locator("h2").waitFor({ timeout: 30_000 });
      const target = await e.screen(page);
      await e.current(page).getByRole("button", { name: "No me interesa" }).click();
      await h.sleep(600);
      const kept = JSON.parse(await page.evaluate(() => localStorage.getItem("laria:descubrir-ocultos")) || "[]");
      const listingId = t.live ? null : x.idOf(target.slug);
      t.check(kept.length === 200, `at most 200 are kept (${kept.length})`);
      t.check(!kept.includes("no-es-un-id") && !kept.includes(5), "anything but a listing id is dropped");
      t.check(t.live ? /^[0-9a-f-]{36}$/.test(kept[0]) && !filler.slice(0, 1).includes(kept[0]) : kept[0] === listingId, "the newest first");
    },
  },
  // ------------------------------------------------------------------ the buttons
  {
    id: "EASE-849",
    timeout: 240_000,
    async run(t) {
      const own = e.particularListings(t, { count: 2, prices: [800, 850] });
      const page = await t.page({ phone: true });
      const posts = [];
      page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/contact") posts.push(request.postData()); });
      const shown = await open(t, page, results(`q=${own.word}&sort=price_asc`));
      const listing = own.listings.find((item) => item.slug === shown.slug);
      const popup = await x.popupOf(page, () => x.control(e.current(page), "WhatsApp").click());
      await h.sleep(800);
      t.check(posts.length === 1, `one press posts to /api/contact once (${posts.length})`);
      const url = new URL(popup.url());
      t.check(/wa\.me|whatsapp\.com/.test(url.hostname) && url.href.includes(own.seller.phone), `it opens wa.me for the seller (${url.hostname}${url.pathname})`);
      t.check(t.whatsappText(popup.url()).includes(`/instrumentos/${listing.slug}`), "with the listing's link");
      const events = await x.until(() => h.sql(`select source from public.marketplace_events where listing_id = ${x.L(listing.id)} and event_type = 'whatsapp_contact'`).length || null, { timeout: 10_000 });
      t.check(events === 1, "counted as one contact");
      const phone = own.seller.phone;
      const api = await (await fetch(t.url(`/api/catalog/page?q=${own.word}&fotos=todas`))).text();
      const html = await (await fetch(t.url(results(`q=${own.word}`)))).text();
      t.check(!api.includes(phone) && !api.includes(phone.slice(2)) && !html.includes(phone.slice(2)), "no phone number in the feed's data or page");
      await page.route("**/api/contact", (route) => route.abort("failed"));
      await e.pressNext(page);
      await x.control(e.current(page), "WhatsApp").click();
      const alert = page.getByRole("alert").filter({ hasText: "No pudimos abrir WhatsApp" });
      await alert.waitFor({ timeout: 10_000 }).catch(() => {});
      const said = (await alert.count()) ? (await alert.first().innerText()).replace(/\s+/g, " ") : "";
      t.check(/No pudimos abrir WhatsApp\. Abre la publicación/.test(said), `with no link: "${said}"`);
      t.check(await alert.first().locator('a[href^="/instrumentos/"]').count() > 0 || (await page.locator('[role="alert"] a[href^="/instrumentos/"]').count()) > 0, "with a link to the listing");
      await t.shot(page, "no-link");
    },
  },
  {
    id: "EASE-850",
    timeout: 240_000,
    async run(t) {
      const own = e.particularListings(t, { count: 2, prices: [1500, 1200] });
      const page = await t.page({ phone: true });
      await open(t, page, results(`q=${own.word}&sort=price_desc`));
      const button = () => x.control(e.current(page), "WhatsApp");
      let opened = 0;
      page.context().on("page", () => { opened += 1; });
      await button().click();
      const sheet = x.safetySheet(page);
      await sheet.waitFor({ timeout: 10_000 }).catch(() => {});
      t.check(await sheet.count() === 1 && opened === 0, "from S/ 1,000 the safety sheet opens first");
      await t.shot(page, "sheet");
      await sheet.getByRole("button", { name: "Volver" }).click();
      await h.sleep(400);
      const focus = await e.focusInfo(page);
      t.check(await sheet.count() === 0 && /WhatsApp/.test(focus?.name || ""), `Volver closes it and focus returns to WhatsApp (${focus?.name})`);
      await button().click();
      await sheet.waitFor({ timeout: 10_000 });
      const popup = await x.popupOf(page, () => x.control(sheet, "Continuar a WhatsApp").click());
      t.check(/wa\.me|whatsapp\.com/.test(new URL(popup.url()).hostname), "Continuar a WhatsApp opens WhatsApp");
      await popup.close();
      const again = await x.popupOf(page, () => button().click());
      t.check(await x.safetySheet(page).count() === 0 && /wa\.me|whatsapp/.test(again.url()), "the same listing opens WhatsApp without the sheet");
      await again.close();
      await e.pressNext(page);
      const other = await x.popupOf(page, () => button().click());
      t.check(await x.safetySheet(page).count() === 0 && /wa\.me|whatsapp/.test(other.url()), "and another listing over S/ 1,000 too: not again in this browser");
    },
  },
  {
    id: "EASE-851",
    timeout: 240_000,
    async run(t) {
      const own = e.particularListings(t, { count: 2 });
      const page = await t.page({ phone: true });
      const shown = await open(t, page, results(`q=${own.word}`));
      const id = x.idOf(shown.slug);
      await e.current(page).getByRole("button", { name: /^Guardar en favoritos/ }).click();
      await h.sleep(800);
      const saved = await page.evaluate(() => localStorage.getItem("laria:favoritos") || "");
      t.check(saved.includes(id), "signed out, ♥ saves to this device");
      t.check(await e.current(page).getByRole("button", { name: /^Quitar de favoritos/ }).count() === 1, "and shows as saved");
      await t.goto(page, "/favoritos");
      await page.locator(`a[href="/instrumentos/${shown.slug}"]`).first().waitFor({ timeout: 15_000 }).catch(() => {});
      t.check(await page.locator(`a[href="/instrumentos/${shown.slug}"]`).count() > 0, "Favoritos lists it");
      await t.goto(page, `/listados?q=${own.word}`);
      const card = page.locator("article, li").filter({ has: page.locator(`a[href="/instrumentos/${shown.slug}"]`) }).last();
      await card.getByRole("button", { name: /^Quitar de favoritos/ }).waitFor({ timeout: 10_000 }).catch(() => {});
      const hearts = await card.getByRole("button", { name: /favoritos/ }).evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label") || node.textContent.trim()));
      t.check(await card.getByRole("button", { name: /^Quitar de favoritos/ }).count() === 1, `the catalog card shows it saved (${hearts.join(" · ") || "no ♥ on the card"})`);
      const buyer = t.account({ kind: "buyer" });
      const signed = await t.page({ phone: true, as: buyer.email });
      await open(t, signed, results(`q=${own.word}`));
      await e.current(signed).getByRole("button", { name: /^Guardar en favoritos/ }).click();
      const row = await x.until(() => h.sql(`select 1 from public.favorites where user_id = ${x.L(buyer.id)} and listing_id = ${x.L(id)}`).length || null, { timeout: 10_000 });
      t.check(row, "signed in, ♥ saves to the account");
      await t.goto(signed, "/mi-cuenta/favoritos");
      t.check(await signed.locator(`a[href="/instrumentos/${shown.slug}"]`).count() > 0, "Mi cuenta › Favoritos lists it");
      await t.goto(signed, `/listados?q=${own.word}`);
      const signedCard = signed.locator("article, li").filter({ has: signed.locator(`a[href="/instrumentos/${shown.slug}"]`) }).last();
      await signedCard.getByRole("button", { name: /^Quitar de favoritos/ }).waitFor({ timeout: 10_000 }).catch(() => {});
      t.check(await signedCard.getByRole("button", { name: /^Quitar de favoritos/ }).count() === 1, "and the catalog card shows it saved");
      await t.shot(signed, "catalog-saved");
    },
  },
  {
    id: "EASE-852",
    live: true,
    timeout: 360_000,
    async run(t) {
      const page = await t.page({ phone: true });
      await open(t, page, "/descubrir");
      const total = (await e.counter(page))?.total;
      if (!(total > 30)) t.skip(`Lo nuevo holds ${total} listings, fewer than 30`);
      const at = await e.seek(page, (s) => Boolean(s.slug), { from: 30, limit: 40 });
      const target = await e.screen(page);
      const position = (await e.counter(page))?.position;
      t.check(at >= 30 && target.slug, `on screen ${at + 1}: ${target.heading} (${position} de ${total})`);
      await e.current(page).getByRole("link", { name: "Ver publicación" }).click();
      await page.waitForURL((url) => url.pathname === `/instrumentos/${target.slug}`, { timeout: 30_000 });
      t.check(true, "Ver publicación opens the listing");
      await page.goBack();
      await page.waitForURL((url) => url.pathname === "/descubrir", { timeout: 30_000 });
      const back = await x.until(async () => {
        const shown = await e.screen(page).catch(() => null);
        return shown?.slug === target.slug ? shown : null;
      }, { timeout: 20_000 });
      t.check(back, "back opens Descubrir on that listing");
      t.check((await e.counter(page))?.position === position, `at the same place (${(await e.counter(page))?.position} de ${total})`);
      await t.shot(page, "back");
    },
  },
  {
    id: "EASE-853",
    live: true,
    timeout: 240_000,
    async run(t) {
      if (!t.live) x.ciAsserts(t, DESC_TEST, ["the feed draws the screen in view and its neighbours"]);
      const state = async (page) => page.evaluate(() => [...document.querySelectorAll("[data-slot]")].map((slot) => ({
        index: Number(slot.dataset.slot),
        drawn: Boolean(slot.querySelector("section")),
        current: Boolean(slot.querySelector("section:not([inert])")),
        images: [...slot.querySelectorAll("img")].map((img) => ({ loading: img.getAttribute("loading"), complete: img.complete && img.naturalWidth > 0 })),
      })));
      for (const saveData of [false, true]) {
        const page = await t.page({ phone: true, saveData });
        await open(t, page, "/descubrir");
        await e.jump(page, 2);
        await h.sleep(1500);
        const slots = await state(page);
        const at = slots.findIndex((slot) => slot.current);
        const here = slots[at];
        const next = slots[at + 1];
        const label = saveData ? "saving data" : "normal";
        t.check(here.images.slice(0, 2).every((img) => img.loading !== "lazy" && img.complete), `${label}: the screen in view loads its first two photos`);
        t.check(here.images.slice(2).every((img) => img.loading === "lazy"), `${label}: its other photos wait`);
        if (saveData) t.check(!next.images.length || next.images[0].loading === "lazy", `saving data: the next listing's first photo does not load ahead (${next.images[0]?.loading})`);
        else t.check(next.images.length && next.images[0].loading !== "lazy" && next.images.slice(1).every((img) => img.loading === "lazy"), `normal: only the next listing's first photo loads ahead (${next.images.map((img) => img.loading).join(",")})`);
        t.check(slots.every((slot) => slot.drawn === (Math.abs(slot.index - at) <= 1)), `${label}: screens beyond the neighbours are not drawn`);
      }
    },
  },
  {
    id: "EASE-854",
    live: true,
    timeout: 300_000,
    async run(t) {
      const page = await t.page();
      await open(t, page, "/descubrir");
      const total = (await e.counter(page))?.total;
      await e.key(page, "ArrowDown");
      let shown = await e.screen(page);
      let focus = await e.focusInfo(page);
      t.check(focus?.tag === "H2" && focus.id === shown.headingId, `↓ puts focus on the new screen's heading (${focus?.tag}#${focus?.id})`);
      const said = await x.until(async () => { const text = await e.liveText(page); return text.startsWith("2 de") ? text : null; }, { timeout: 5_000 });
      t.check(said === `2 de ${total}: ${shown.heading}` || said === `2 de ${total.toLocaleString("en-US")}: ${shown.heading}`, `a polite announcement: "${said}"`);
      await e.pressNext(page);
      shown = await e.screen(page);
      focus = await e.focusInfo(page);
      t.check(focus?.tag === "H2" && focus.id === shown.headingId, `the bar's Siguiente puts focus on the new screen's heading (focus is on ${focus?.tag} "${focus?.name}")`);
      const slots = await e.drawnSlots(page);
      t.check(slots.filter((slot) => slot.drawn && slot.index !== shown.index).every((slot) => slot.inert === true), "screens out of view are inert");
      const counts = t.live ? null : await todayCounts(t);
      if (counts && counts.today && counts.today < counts.total) {
        const at = await e.seek(page, (s) => s.heading === "Viste todo lo nuevo de hoy", { from: Math.max(0, counts.today - 2), limit: counts.today + 40 });
        if (at >= 0) {
          await e.key(page, "ArrowUp");
          await e.key(page, "ArrowDown");
          const stop = await x.until(async () => { const text = await e.liveText(page); return text === "Viste todo lo nuevo de hoy" ? text : null; }, { timeout: 5_000 });
          t.check(stop, "a stop is announced by its title");
        }
      }
      await t.shot(page, "focus");
    },
  },
  {
    id: "EASE-855",
    live: true,
    timeout: 240_000,
    async run(t) {
      const feedTop = "() => document.querySelector('main .snap-y').scrollTop";
      const photoLeft = `() => { const s = document.querySelector('[data-slot] > section:not([inert])'); const g = s && s.querySelector('[role="group"][aria-label^="Fotos de"]'); if (!g) return 0; const el = [g, ...g.querySelectorAll('*')].find((n) => n.scrollWidth > n.clientWidth + 2); return el ? el.scrollLeft : 0; }`;
      const outcome = {};
      for (const motion of ["reduce", "no-preference"]) {
        const page = await t.page({ phone: true, reducedMotion: motion });
        await open(t, page, "/descubrir");
        if (t.live || true) await e.seek(page, (s) => /Foto 1 \/ ([2-9]|10)/.test(s.text), { limit: 40 });
        const screenMove = await glides(page, feedTop, () => page.getByRole("button", { name: "Siguiente", exact: true }).click());
        await e.settle(page, null);
        await e.pressPrevious(page);
        const photoMove = await glides(page, photoLeft, () => e.current(page).getByRole("button", { name: "Foto siguiente" }).click());
        outcome[motion] = { screenMove, photoMove };
      }
      const { reduce, "no-preference": smooth } = outcome;
      t.check(reduce.screenMove.moved && reduce.screenMove.between === 0, `reduced motion: the screen jumps (${reduce.screenMove.between} frames in between)`);
      t.check(reduce.photoMove.moved && reduce.photoMove.between === 0, `reduced motion: the photo jumps (${reduce.photoMove.between} frames in between)`);
      t.check(smooth.screenMove.between > 0 && smooth.photoMove.between > 0, `without it both glide (${smooth.screenMove.between} and ${smooth.photoMove.between} frames in between)`);
    },
  },
  {
    id: "EASE-856",
    live: true,
    timeout: 600_000,
    async run(t) {
      const feed = await smallFeed(t, { count: 3 });
      const counts = await todayCounts(t);
      for (const options of [{ phone: true }, { width: 1280 }]) {
        const width = options.phone ? 390 : 1280;
        const page = await t.page(options);
        await open(t, page, "/descubrir");
        const listing = await t.axe(page, `${width} listing`);
        t.check(listing.length === 0, `${width} px listing screen: ${listing.length} axe violations`);
        const small = await page.evaluate(() => [...document.querySelectorAll("main a, main button")].filter((node) => {
          if (node.closest("[inert]") || node.closest(".sr-only")) return false;
          const box = node.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44);
        }).map((node) => `${node.getAttribute("aria-label") || node.textContent.trim().slice(0, 30)} ${Math.round(node.getBoundingClientRect().width)}x${Math.round(node.getBoundingClientRect().height)}`));
        t.check(small.length === 0, `${width} px: every control is at least 44 px${small.length ? ` (${small.join("; ")})` : ""}`);
        const english = await page.evaluate(() => [...document.querySelectorAll("main [aria-label], main button, main a")].map((node) => node.getAttribute("aria-label") || node.textContent.trim())
          .filter((text) => /\b(Next|Previous|Back|Close|Photo|Save|Share|Loading|Hide|Retry|Open)\b/.test(text)));
        t.check(english.length === 0, `${width} px: labels are in Spanish${english.length ? ` (${english.join("; ")})` : ""}`);
        if (counts.today && counts.today < counts.total) {
          const at = await e.seek(page, (s) => s.heading === "Viste todo lo nuevo de hoy", { from: Math.max(0, counts.today - 2), limit: counts.today + 40 });
          if (at >= 0) {
            const stop = await t.axe(page, `${width} stop`);
            t.check(stop.length === 0, `${width} px stop: ${stop.length} axe violations`);
          } else t.check(false, `${width} px: no today stop reached`);
        } else {
          const at = await e.seek(page, (s) => /^Llevas 48 de/.test(s.heading), { from: 44, limit: 70 });
          if (at >= 0) t.check((await t.axe(page, `${width} pause`)).length === 0, `${width} px pause: axe`);
        }
        await t.shot(page, `${width}-stop`);
        const end = await t.page(options);
        await open(t, end, results(feed.query));
        await e.loadAll(end);
        const done = await t.axe(end, `${width} end`);
        t.check(done.length === 0, `${width} px end: ${done.length} axe violations`);
        await t.shot(end, `${width}-end`);
      }
    },
  },
  {
    id: "EASE-857",
    timeout: 300_000,
    async run(t) {
      const own = e.particularListings(t, { count: 2, prices: [700, 750] });
      const page = await t.page({ phone: true });
      const first = await open(t, page, "/descubrir");
      await h.sleep(2500);
      const session = await e.sessionId(page.context());
      t.check(session, `the visit has a marketplace session (${session})`);
      const popup = await (async () => {
        const target = await open(t, page, results(`q=${own.word}&sort=price_asc`));
        await h.sleep(2500);
        const tab = await x.popupOf(page, () => x.control(e.current(page), "WhatsApp").click());
        return { target, tab };
      })();
      await popup.tab.close();
      await t.goto(page, "/favoritos");
      await h.sleep(1500);
      const events = await x.until(() => {
        const rows = h.sql(`select event_type, source, l.slug from public.marketplace_events m join public.listings l on l.id = m.listing_id
          where m.session_id::text = ${x.L(session)} order by m.created_at`);
        return rows.some((row) => row.event_type === "listing_impression" && row.slug === popup.target.slug) ? rows : null;
      }, { timeout: 30_000 });
      const list = events || [];
      t.note(`events: ${list.map((row) => `${row.event_type}/${row.source}`).join(", ")}`);
      t.check(list.some((row) => row.event_type === "listing_impression" && row.source === "home" && row.slug === first.slug), "Lo nuevo counts an impression with source home");
      t.check(list.some((row) => row.event_type === "listing_impression" && row.source === "catalog" && row.slug === popup.target.slug), "a results feed counts one with source catalog");
      t.check(list.some((row) => row.event_type === "whatsapp_contact" && row.source === "catalog" && row.slug === popup.target.slug), "WhatsApp counts a contact with that source");
      t.check(!list.some((row) => row.event_type === "listing_view"), "Descubrir counts no listing view");
    },
  },
  {
    id: "EASE-858",
    live: true,
    async run(t) {
      if (!t.live) x.ciAsserts(t, DESC_TEST, ["the entries, the frame, the crawler guard and the index rules"]);
      for (const agent of ["Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)", "Mozilla/5.0 (compatible; Reflectionbot/1.0)", "Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)"]) {
        for (const route of ["/descubrir", "/listados"]) {
          await h.paceNavigation();
          const response = await fetch(t.url(route), { headers: { "user-agent": agent } });
          t.check(response.status === 403, `${agent.split(";")[1].trim()} gets ${response.status} on ${route}`);
        }
      }
      const response = await fetch(t.url("/descubrir"), { headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1" } });
      const html = await response.text();
      t.check(response.status === 200, `a browser gets ${response.status}`);
      t.check(/<meta name="robots" content="[^"]*noindex/.test(html) || /noindex/.test(response.headers.get("x-robots-tag") || ""), "the page is noindex");
      const page = await t.page({ phone: true });
      await open(t, page, "/descubrir");
      const frame = await page.evaluate(() => ({ footers: document.querySelectorAll("footer").length, publish: document.querySelectorAll('a[href="/mi-cuenta/publicar"], a[href="/publicar"]').length }));
      t.check(frame.footers === 0 && frame.publish === 0, `no site header or footer (${frame.footers} footers, ${frame.publish} Publicar links)`);
      await t.shot(page, "frame");
    },
  },
  {
    id: "EASE-859",
    async run(t) {
      x.ciAsserts(t, DESC_TEST, ["Reservado"]);
      x.ciAsserts(t, "tests/maybes-reservado.test.cjs", ["the contact route's link says the listing is reserved"]);
    },
  },
  // ------------------------------------------------------------------ maybes in Descubrir
  {
    id: "EASE-880",
    timeout: 600_000,
    async run(t) {
      const word = e.unique();
      const seller = t.account({ kind: "particular" });
      const today = t.listing(seller, { title: `Guitarra ${word} reservada hoy`, price: 900, photos: 2 });
      const older = t.listing(seller, { title: `Bajo ${word} reservado antes`, price: 950, photos: 2, publishedDaysAgo: 3, category: "basses", type: "electric_bass" });
      const many = e.particularListings(t, { count: 26, word, daysAgo: 10, seller, prices: Array.from({ length: 26 }, (_, n) => 400 + n * 10) });
      const lastByPrice = many.listings[25];
      for (const item of [today, older, lastByPrice]) e.reserve(t, seller, item.id, 2);
      const api = await e.catalogPage(t, NUEVO());
      t.check(api.body.reserved.includes(today.id), "the page route's first page says the new one is reserved");
      const later = await e.feedListings(t, NUEVO());
      t.check(later.reserved.has(older.id), "and a later page says the older one is");
      for (const options of [{ phone: true }, { width: 1366 }]) {
        const width = options.phone ? 390 : 1366;
        const page = await t.page(options);
        await open(t, page, "/descubrir");
        const atToday = await e.seek(page, (s) => s.slug === today.slug, { limit: 80 });
        const shownToday = await e.screen(page);
        t.check(atToday >= 0 && shownToday.reserved, `${width} px: the first page's reserved listing says Reservado`);
        const neighbours = (await e.drawnSlots(page)).filter((slot) => slot.slug && slot.slug !== today.slug);
        t.check(neighbours.every((slot) => !slot.reserved || later.reserved.has(x.idOf(slot.slug))), `${width} px: the listings around it say nothing`);
        await t.shot(page, `${width}-nuevo`);
        const atOlder = await e.seek(page, (s) => s.slug === older.slug, { from: Math.max(atToday, 0), limit: 400 });
        t.check(atOlder >= 24 && (await e.screen(page)).reserved, `${width} px: a later page's reserved listing says Reservado (screen ${atOlder + 1})`);
        const feed = await t.page(options);
        await open(t, feed, results(`q=${word}&sort=price_asc`));
        let reservedSeen = 0;
        for (let step = 0; step < 30; step += 1) {
          const shown = await e.screen(feed);
          if (!shown.slug) break;
          if (shown.reserved) reservedSeen += 1;
          if (shown.slug === lastByPrice.slug) t.check(shown.reserved && step >= 24, `${width} px: the results feed's reserved listing on its second page says Reservado (screen ${step + 1})`);
          await e.pressNext(feed);
        }
        t.check(reservedSeen === 3, `${width} px: only the three reserved ones say it (${reservedSeen})`);
        await t.shot(feed, `${width}-results`);
      }
    },
  },
  {
    id: "EASE-881",
    timeout: 300_000,
    async run(t) {
      const own = e.particularListings(t, { count: 2, prices: [1500, 900] });
      const [held, free] = own.listings;
      e.reserve(t, own.seller, held.id, 2);
      const page = await t.page({ phone: true });
      await t.goto(page, held.path);
      const pageHref = await page.getByRole("link", { name: /WhatsApp/ }).first().getAttribute("href");
      const pageText = t.whatsappText(pageHref);
      t.check(pageText.endsWith("Vi que está reservado. Si se libera, ¿me avisas?"), `the listing page's message ends "${pageText.slice(-60)}"`);
      await open(t, page, results(`q=${own.word}&sort=price_desc`));
      await x.control(e.current(page), "WhatsApp").click();
      await x.safetySheet(page).waitFor({ timeout: 10_000 });
      const popup = await x.popupOf(page, () => x.control(x.safetySheet(page), "Continuar a WhatsApp").click());
      const text = t.whatsappText(popup.url());
      t.check(text === pageText, `Descubrir opens the same text as the listing page (${text.slice(-60)})`);
      await popup.close();
      await e.pressNext(page);
      const second = await x.popupOf(page, () => x.control(e.current(page), "WhatsApp").click());
      const plain = t.whatsappText(second.url());
      t.check(plain.endsWith("¿Sigue disponible?") && !plain.includes("reservado"), `a listing that is not reserved asks "${plain.slice(-40)}"`);
      t.check(free.slug && plain.includes(free.slug), "for that listing");
    },
  },
  {
    id: "EASE-882",
    async run(t) {
      x.ciAsserts(t, "tests/maybes-reservado.test.cjs", ["one failed read means no badge rather than a wrong one"]);
      x.ciAsserts(t, "tests/catalog-recovery.test.cjs", ["LARIA_CATALOG_ENRICHMENT_DISABLED", "Reservado"]);
    },
  },
];
