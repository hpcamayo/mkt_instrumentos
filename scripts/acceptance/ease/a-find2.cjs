// Effortless Laria acceptance, group A part 2: find (EASE-015 to EASE-028).
"use strict";
const a = require("./a-helpers.cjs");

const cases = [];
const clean = (text) => text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
function roundPrice(value) {
  if (value <= 0) return 0;
  const step = value < 200 ? 10 : value < 1000 ? 50 : value < 5000 ? 100 : value < 20000 ? 500 : 1000;
  return Math.max(step, Math.round(value / step) * step);
}
const forYouCards = (page, id = "para-ti-titulo") => page.locator(`section[aria-labelledby='${id}'] article :is(h2, h3) a[href^='/instrumentos/']`)
  .evaluateAll((links) => links.map((link) => link.getAttribute("href").split("/").pop()));

// ------------------------------------------------------------------ FIND 08: price shortcuts
cases.push({
  id: "EASE-015",
  live: true,
  run: async (t) => {
    const page = await t.page();
    const readPrice = async () => {
      const block = page.locator("section[aria-label='Filtros'] > div", { has: page.locator("h2", { hasText: /^Precio$/ }) });
      return {
        hint: clean(await block.locator("p.t-meta").first().innerText().catch(() => "")),
        chips: (await block.locator("ul a").allInnerTexts()).map(clean),
        block,
      };
    };
    await t.goto(page, "/listados");
    await a.settled(page);
    const data = await a.facets(page);
    const p = data.price;
    const low = roundPrice(p.low);
    const high = roundPrice(p.high);
    const expected = p.count >= 3 && low > 0 && high > low ? [`Hasta ${a.money(low)}`, `${a.money(low)} – ${a.money(high).replace(/^S\/\s?/, "")}`, `Más de ${a.money(high)}`] : [];
    const shown = await readPrice();
    t.check(shown.hint === (p.min === p.max ? `Precio: ${a.money(p.min)}` : `De ${a.money(p.min)} a ${a.money(p.max)}`), `the hint reads "${shown.hint}" (prices on sale ${p.min} to ${p.max})`);
    t.check(JSON.stringify(shown.chips) === JSON.stringify(expected), `three chips from the spread: ${shown.chips.join(" | ")} (low third ${p.low}, high third ${p.high})`);
    await shown.block.scrollIntoViewIfNeeded();
    await t.shot(page, "precio");
    await shown.block.getByRole("link", { name: expected[0] }).click();
    await page.waitForURL((url) => url.searchParams.get("max_price") === String(low), { timeout: 30_000 });
    await a.settled(page);
    t.check(a.params(page.url()).max_price === String(low), `"${expected[0]}" filters to S/ ${low} or less (${a.pathOf(page.url())})`);
    // Fewer than three prices: no chips.
    const brand = (data.brands || []).filter((b) => b.count > 0 && b.count < 3).sort((x, y) => x.count - y.count)[0];
    if (!brand) {
      t.note("no brand with one or two listings; the no-chips rule was not shown");
      return;
    }
    await t.goto(page, `/listados?brand=${encodeURIComponent(brand.brand)}`);
    await a.settled(page);
    const few = await readPrice();
    const fewData = await a.facets(page, `brand=${encodeURIComponent(brand.brand)}`);
    t.check(fewData.price.count < 3 && few.chips.length === 0 && /^(Precio:|De) S\/ /.test(few.hint), `${brand.brand} (${fewData.price.count} prices) shows the hint "${few.hint}" and no chips`);
  },
});

// ------------------------------------------------------------------ FIND 09: back to the results, same place
cases.push({
  id: "EASE-016",
  live: true,
  run: async (t) => {
    const page = await t.page();
    await t.goto(page, "/listados");
    await a.settled(page);
    const cards = await a.resultCards(page);
    if (cards.length < 6) t.skip("needs six results or more");
    const links = page.locator("#resultados article :is(h2, h3) a[href^='/instrumentos/']");
    const resultsUrl = a.pathOf(page.url());
    async function openFourth() {
      await page.evaluate(() => window.scrollTo(0, 450));
      await links.nth(3).scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const scrollY = await page.evaluate(() => Math.round(window.scrollY));
      await links.nth(3).click();
      await page.waitForURL((url) => url.pathname === `/instrumentos/${cards[3].slug}`, { timeout: 30_000 });
      await page.getByRole("link", { name: "Volver a resultados" }).waitFor({ timeout: 15_000 });
      return scrollY;
    }
    const position = () => page.getByText(/^\d+ de \d+$/).first().innerText().catch(() => "");
    const scrollY = await openFourth();
    t.check(scrollY > 0, `the results were scrolled (${scrollY} px) before opening the fourth card`);
    t.check((await position()) === `4 de ${cards.length}`, `the listing shows Volver a resultados, Anterior, "${await position()}" and Siguiente`);
    t.check((await page.getByRole("link", { name: /Anterior/ }).count()) > 0 && (await page.getByRole("link", { name: /Siguiente/ }).count()) > 0, "with both arrows");
    await t.shot(page, "listing");
    await page.getByRole("link", { name: /Siguiente/ }).first().click();
    await page.waitForURL((url) => url.pathname === `/instrumentos/${cards[4].slug}`, { timeout: 30_000 });
    await a.until(async () => (await position()) === `5 de ${cards.length}`, { timeout: 10_000 });
    t.check((await position()) === `5 de ${cards.length}`, `Siguiente opens the fifth (${await position()})`);
    await page.getByRole("link", { name: /Anterior/ }).first().click();
    await page.waitForURL((url) => url.pathname === `/instrumentos/${cards[3].slug}`, { timeout: 30_000 });
    await a.until(async () => (await position()) === `4 de ${cards.length}`, { timeout: 10_000 });
    t.check((await position()) === `4 de ${cards.length}`, `Anterior goes back to the fourth (${await position()})`);
    await page.getByRole("link", { name: "Volver a resultados" }).click();
    await page.waitForURL((url) => url.pathname === "/listados", { timeout: 30_000 });
    await a.settled(page);
    await page.waitForTimeout(800);
    let back = await page.evaluate(() => Math.round(window.scrollY));
    t.check(a.pathOf(page.url()) === resultsUrl && Math.abs(back - scrollY) <= 60, `after the arrows, Volver a resultados opens ${a.pathOf(page.url())} at ${back} px (left at ${scrollY})`);
    await t.shot(page, "back");
    // Opened straight from the results, it is the browser's back.
    const again = await openFourth();
    await page.getByRole("link", { name: "Volver a resultados" }).click();
    await page.waitForURL((url) => url.pathname === "/listados", { timeout: 30_000 });
    await a.settled(page);
    await page.waitForTimeout(800);
    back = await page.evaluate(() => Math.round(window.scrollY));
    t.check(a.pathOf(page.url()) === resultsUrl && Math.abs(back - again) <= 60, `straight back: ${a.pathOf(page.url())} at ${back} px (left at ${again})`);
  },
});

// ------------------------------------------------------------------ FIND 10: new sorts
cases.push({
  id: "EASE-017",
  live: true,
  timeout: 300_000,
  run: async (t) => {
    let drop = null;
    if (!t.live) {
      const seller = t.account({ kind: "particular" });
      drop = t.listing(seller, { title: `Fender Jazz Bass ${a.word("zd")}`, category: "basses", type: "bass", model: "Jazz Bass", price: 2000, publishedDaysAgo: 10 });
      t.exec(`update public.listings set price_pen = 1700 where id = ${t.literal(drop.id)}`);
      const [row] = t.sql(`select previous_price_pen, price_dropped_at from public.listings where id = ${t.literal(drop.id)}`);
      t.check(Number(row.previous_price_pen) === 2000 && row.price_dropped_at, `a 15% drop is recorded (Antes ${row.previous_price_pen})`);
    }
    const page = await t.page();
    await t.goto(page, "/listados");
    await a.settled(page);
    const data = await a.facets(page);
    async function sortBy(name, value) {
      await page.locator("#orden-boton").click();
      await page.locator("#menu-orden").getByRole("link", { name }).click();
      await page.waitForURL((url) => url.searchParams.get("sort") === value, { timeout: 30_000 });
      await a.settled(page);
      return a.resultCards(page);
    }
    const drops = await sortBy("Bajaron de precio", "price_drop");
    const firstPlain = drops.findIndex((card) => !card.drop);
    const lastDrop = drops.map((card) => card.drop).lastIndexOf(true);
    const withDrop = drops.filter((card) => card.drop);
    if (t.live && !withDrop.length) t.skip("no listing on the live catalog has a recent price drop");
    t.check(withDrop.length > 0 && (firstPlain < 0 || lastDrop < firstPlain), `"Bajaron de precio" lists the ${withDrop.length} recent drops first, each with the old price struck through`);
    if (drop) {
      const mine = drops.find((card) => card.slug === drop.slug);
      t.check(mine?.drop && /S\/ 2,000/.test(clean(mine.text)) && /S\/ 1,700/.test(clean(mine.text)), `the new drop is among them: "${mine?.text}"`);
    }
    await t.shot(page, "drops");
    const verified = await sortBy("Tiendas verificadas primero", "verified_first");
    const verifiedCount = data.seller_type?.verified_store || 0;
    const isVerified = (cards) => cards.map((card) => /Tienda verificada/.test(card.text));
    const pageOne = isVerified(verified);
    t.check(verifiedCount > 0 && pageOne.slice(0, Math.min(24, verifiedCount)).every(Boolean), `"Tiendas verificadas primero" starts with verified stores (${verifiedCount} verified listings)`);
    // The page where verified stores end.
    const boundary = Math.floor(verifiedCount / 24) + 1;
    let cards = verified;
    if (boundary > 1) {
      await t.goto(page, `/listados?sort=verified_first&page=${boundary}`);
      await a.settled(page);
      cards = await a.resultCards(page);
    }
    const flags = isVerified(cards);
    const firstOther = flags.indexOf(false);
    t.check(firstOther < 0 || flags.slice(firstOther).every((flag) => !flag), `on page ${boundary}, ${flags.filter(Boolean).length} verified then ${flags.filter((f) => !f).length} others, never mixed`);
    await t.shot(page, "verified");
  },
});

// ------------------------------------------------------------------ FIND 11: recently viewed
cases.push({
  id: "EASE-018",
  run: async (t) => {
    const page = await t.page();
    await t.goto(page, "/listados");
    await a.settled(page);
    const opened = (await a.resultCards(page)).slice(0, 2);
    for (const card of opened) {
      await t.goto(page, `/instrumentos/${card.slug}`);
      await page.waitForTimeout(1_000);
    }
    for (const [route, label] of [["/", "home"], ["/listados", "catalog"], ["/instrumentos/no-existe-ease", "not-found"]]) {
      await t.goto(page, route);
      const section = page.locator("section[aria-labelledby='vistos-titulo']");
      const ok = await section.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
      const slugs = ok ? await section.locator("a[href^='/instrumentos/']").evaluateAll((links) => links.map((l) => l.getAttribute("href").split("/").pop())) : [];
      const text = ok ? clean(await section.innerText()) : "";
      t.check(ok && opened.every((card) => slugs.includes(card.slug)) && /Solo en este dispositivo\./.test(text) && /Borrar/.test(text),
        `${label}: "Vistos recientemente" shows both opened listings, "Solo en este dispositivo." and Borrar`);
      if (ok) {
        await section.scrollIntoViewIfNeeded();
        await t.shot(page, label);
      }
    }
    await page.locator("section[aria-labelledby='vistos-titulo']").getByRole("button", { name: "Borrar" }).click();
    await page.waitForTimeout(800);
    t.check((await page.locator("section[aria-labelledby='vistos-titulo']").count()) === 0, "Borrar removes the row");
    await t.goto(page, "/");
    await page.waitForTimeout(2_500);
    t.check((await page.locator("section[aria-labelledby='vistos-titulo']").count()) === 0, "and it stays forgotten on the home");
  },
});

// ------------------------------------------------------------------ FIND 12: compare
cases.push({
  id: "EASE-019",
  live: true,
  run: async (t) => {
    const page = await t.page();
    await t.goto(page, "/listados");
    await a.settled(page);
    const cards = await a.resultCards(page);
    const boxes = page.locator("#resultados article input[type=checkbox]");
    for (let i = 0; i < 3; i += 1) await boxes.nth(i).check();
    const tray = page.locator("aside[aria-label='Comparación']");
    await tray.waitFor();
    t.check(/Comparar \(3 de 3\)/.test(clean(await tray.innerText())), `the ticks gather in the tray: "${clean(await tray.innerText()).slice(0, 120)}"`);
    const fourth = boxes.nth(3);
    const fourthLabel = clean(await page.locator(`label[for='${await fourth.getAttribute("id")}']`).innerText());
    t.check((await fourth.isDisabled()) && fourthLabel === "Comparar (máximo 3)", `a fourth tick is disabled ("${fourthLabel}")`);
    await t.shot(page, "tray");
    await tray.getByRole("link", { name: "Comparar 3" }).click();
    await page.waitForURL((url) => url.pathname === "/comparar", { timeout: 30_000 });
    await page.waitForLoadState("load");
    const p = a.params(page.url()).p?.split(",") || [];
    t.check(a.sameSet(p, cards.slice(0, 3).map((c) => c.slug)), `/comparar opens with the three (${a.pathOf(page.url())})`);
    const columns = await page.locator("thead th[scope='col']").count();
    const differs = await page.locator("tbody th[scope='row']", { hasText: "Distinto" }).count();
    const robots = await page.locator("meta[name='robots']").getAttribute("content");
    t.check((await page.locator("h1").innerText()).trim() === "Comparar instrumentos" && columns === 4, `a side-by-side table: ${columns - 1} listing columns`);
    t.check(differs > 0, `${differs} rows are marked "Distinto"`);
    t.check(/noindex/.test(robots || ""), `the page is not indexed (${robots})`);
    await t.shot(page, "comparar", { fullPage: true });
  },
});

cases.push({
  id: "EASE-020",
  run: async (t) => {
    const buyer = t.account({ kind: "buyer" });
    const seller = t.account({ kind: "particular" });
    const saved = [
      t.listing(seller, { title: `Fender Player Telecaster ${a.word("zf")}`, model: "Player Telecaster", price: 3900 }),
      t.listing(seller, { title: `Squier Classic Vibe ${a.word("zf")}`, brand: "Squier", model: "Classic Vibe 50s", price: 2100, condition: "Nuevo" }),
      t.listing(seller, { title: `Yamaha Pacifica 112V ${a.word("zf")}`, brand: "Yamaha", model: "Pacifica 112V", price: 1300 }),
    ];
    t.exec(saved.map((l, i) => `insert into public.favorites (user_id, listing_id, created_at, saved_price_pen) values (${t.literal(buyer.id)}, ${t.literal(l.id)}, now() - make_interval(mins => ${i}), ${l.price})`).join("; "));
    const page = await t.page({ phone: true, as: buyer.email });
    await t.goto(page, "/mi-cuenta/favoritos");
    const compare = page.locator("details", { has: page.locator("summary", { hasText: "Comparar favoritas" }) });
    await compare.locator("summary").click();
    await compare.getByRole("button", { name: saved[0].title }).click();
    await compare.getByRole("button", { name: saved[2].title }).click();
    t.check((await compare.getByRole("button", { name: saved[0].title }).getAttribute("aria-pressed")) === "true", "picking marks the favorite");
    await t.shot(page, "pick");
    await compare.getByRole("link", { name: "Comparar 2" }).click();
    await page.waitForURL((url) => url.pathname === "/comparar", { timeout: 30_000 });
    const p = a.params(page.url()).p?.split(",") || [];
    t.check(a.sameSet(p, [saved[0].slug, saved[2].slug]) && (await page.locator("thead th[scope='col']").count()) === 3,
      `"Comparar favoritas" at 390 px opens /comparar with the two picked (${a.pathOf(page.url())})`);
    await t.shot(page, "comparar");
  },
});

// ------------------------------------------------------------------ FIND 15: "Ver 24 más" on phones
cases.push({
  id: "EASE-021",
  live: true,
  run: async (t) => {
    const page = await t.page({ phone: true });
    await t.goto(page, "/listados");
    await a.settled(page);
    const total = await a.resultCount(page);
    if (total <= 24) t.skip(`needs more than 24 results (${total})`);
    const pager = page.locator("nav[aria-label='Páginas de resultados'] a[href*='page=2']");
    t.check((await pager.count()) > 0 && !(await pager.first().isVisible()), "the numbered page links stay in the HTML, hidden on phones");
    const more = page.getByRole("button", { name: /^Ver [\d,]+ más$/ });
    const expectMore = Math.min(24, total - 24);
    t.check(clean(await more.innerText()) === `Ver ${expectMore} más` && /Mostrando 24 de/.test(clean(await page.locator("#resultados").innerText())), `"${clean(await more.innerText())}" under "Mostrando 24 de ${total}"`);
    await more.click();
    const added = page.locator("ul[aria-label^='Más resultados'] article :is(h2, h3) a[href^='/instrumentos/']");
    await a.until(async () => (await added.count()) === expectMore, { timeout: 20_000 });
    t.check((await added.count()) === expectMore && page.url().endsWith("/listados"), `the next ${expectMore} load below, on the same page (${a.pathOf(page.url())})`);
    const target = added.nth(Math.min(5, expectMore - 1));
    const slug = (await target.getAttribute("href")).split("/").pop();
    await target.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const scrollY = await page.evaluate(() => Math.round(window.scrollY));
    await t.shot(page, "more");
    // Three round trips: the place is restored after the added listings render again (a race shows only sometimes).
    const trips = [];
    for (let trip = 0; trip < 3; trip += 1) {
      const left = trip === 0 ? scrollY : await page.evaluate(() => Math.round(window.scrollY));
      await added.nth(Math.min(5, expectMore - 1)).click();
      await page.waitForURL((url) => url.pathname.startsWith("/instrumentos/"), { timeout: 30_000 });
      await page.waitForLoadState("load");
      await page.goBack();
      await page.waitForURL((url) => url.pathname === "/listados", { timeout: 30_000 });
      await a.until(async () => (await added.count()) === expectMore, { timeout: 20_000 });
      await page.waitForTimeout(1_200);
      const back = await page.evaluate(() => ({ y: Math.round(window.scrollY), height: document.documentElement.scrollHeight }));
      trips.push({ left, back: back.y, cards: await added.count() });
      if (trip === 0) await t.shot(page, "restored");
      if (Math.abs(back.y - left) > 150) await t.shot(page, `missed-${trip + 1}`);
      if (back.y < left - 150) await page.evaluate((y) => window.scrollTo(0, y), left);
    }
    t.check(trips.every((trip) => trip.cards === expectMore), `back restores the ${expectMore} added listings (${trips.map((trip) => trip.cards).join(", ")})`);
    t.check(trips.every((trip) => Math.abs(trip.back - trip.left) <= 150), `and the place: ${trips.map((trip) => `left at ${trip.left}, back at ${trip.back}`).join("; ")}`);
  },
});

// ------------------------------------------------------------------ FIND 16: a gone listing points to similar ones
cases.push({
  id: "EASE-022",
  run: async (t) => {
    const seller = t.account({ kind: "particular", name: `Vendedora ${a.word("Zn")}` });
    const unique = a.word("zg");
    const gone = t.listing(seller, { title: `Fender Stratocaster ${unique}`, price: 4321 });
    t.exec(`update public.listings set status = 'hidden' where id = ${t.literal(gone.id)}`);
    const page = await t.page();
    const response = await t.goto(page, gone.path);
    await page.getByRole("heading", { level: 1, name: "Esta publicación ya no está disponible" }).waitFor({ timeout: 15_000 });
    const section = page.locator("section[aria-labelledby='parecidas-titulo']");
    await section.waitFor({ timeout: 15_000 });
    const heading = clean(await section.locator("h2").innerText());
    const cards = await a.resultCards(page, "section[aria-labelledby='parecidas-titulo']");
    const rows = t.sql(`select slug, instrument_type, status from public.listings where slug in (${cards.map((c) => t.literal(c.slug)).join(",") || "''"})`);
    t.check(response.status() === 404, `the address answers 404 (${response.status()})`);
    t.check(heading === "Guitarras eléctricas disponibles" && cards.length > 0 && rows.every((r) => r.instrument_type === "electric_guitar" && r.status === "approved"),
      `"${heading}" shows ${cards.length} live electric guitars, with "Ver todas"`);
    t.check((await section.getByRole("link", { name: "Ver todas" }).count()) === 1, "with Ver todas");
    const text = await page.locator("main").innerText();
    t.check(!text.includes(unique) && !text.includes("4,321") && !text.includes(seller.name), "nothing about the old listing: no title, price or seller");
    const api = await page.evaluate(async (slug) => (await fetch(`/api/catalog/gone?slug=${slug}`)).text(), gone.slug);
    t.check(!api.includes(unique) && !api.includes(seller.name), "the gone lookup returns nothing about it either");
    await t.shot(page, "gone", { fullPage: true });
  },
});

// ------------------------------------------------------------------ FAST 02: instant listing and back
cases.push({
  id: "EASE-023",
  live: true,
  run: async (t) => {
    const page = await t.page();
    const rsc = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.headers().rsc === "1" && url.pathname.startsWith("/instrumentos/")) rsc.push({ path: url.pathname, at: Date.now() });
    });
    await t.goto(page, "/listados");
    await a.settled(page);
    await page.waitForTimeout(2_000);
    const cards = await a.resultCards(page);
    const prefetched = (slug) => rsc.some((r) => r.path === `/instrumentos/${slug}`);
    const firstFour = cards.slice(0, 4);
    t.check(firstFour.every((c) => prefetched(c.slug)), `the first cards' pages load ahead: ${firstFour.map((c) => `${c.slug.slice(0, 18)} ${prefetched(c.slug) ? "yes" : "no"}`).join(", ")}`);
    const later = cards[7] || cards[cards.length - 1];
    t.check(!prefetched(later.slug), `a later card (${later.slug}) is not loaded ahead before hover`);
    const link = page.locator(`#resultados article a[href='/instrumentos/${later.slug}']`).first();
    await link.scrollIntoViewIfNeeded();
    await link.hover();
    await a.until(() => prefetched(later.slug), { timeout: 5_000 });
    t.check(prefetched(later.slug), "hovering it loads its page ahead");
    await page.evaluate(() => { window.__easeMarker = 1; });
    const target = cards[1];
    const before = rsc.length;
    const started = Date.now();
    await page.locator(`#resultados article a[href='/instrumentos/${target.slug}']`).first().click();
    await page.waitForURL((url) => url.pathname === `/instrumentos/${target.slug}`, { timeout: 30_000 });
    await page.locator("h1").first().waitFor();
    const open = Date.now() - started;
    const fetchedAgain = rsc.slice(before).filter((r) => r.path === `/instrumentos/${target.slug}`).length;
    t.check(fetchedAgain === 0, `the click is served from what was loaded ahead (${fetchedAgain} new requests), in ${open} ms`);
    const backStart = Date.now();
    await page.goBack();
    await page.waitForURL((url) => url.pathname === "/listados", { timeout: 30_000 });
    await page.locator("#resultados article").first().waitFor();
    const backMs = Date.now() - backStart;
    const marker = await page.evaluate(() => window.__easeMarker);
    t.check(marker === 1, "neither the click nor back reloaded the document");
    t.check(backMs < 1_500, `back shows the results in ${backMs} ms`);
    t.note(`open ${open} ms, back ${backMs} ms`);
  },
});

// ------------------------------------------------------------------ BIG 01: the home
cases.push({
  id: "EASE-024",
  live: true,
  run: async (t) => {
    const page = await t.page({ phone: true });
    await t.goto(page, "/");
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    const boxes = await page.evaluate(() => {
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY) };
      };
      const card = document.querySelector("main article a[href^='/instrumentos/']")?.closest("article");
      return { form: box(document.querySelector("main form[role='search']")), chips: box(document.querySelector("nav[aria-labelledby='categorias-titulo']")), card: box(card), height: window.innerHeight };
    });
    t.check(boxes.card && boxes.card.top < boxes.height * 1.5, `the first listing starts at ${boxes.card?.top} px, within a screen and a half (${boxes.height * 1.5} px)`);
    t.check(boxes.form && boxes.chips && boxes.chips.top >= boxes.form.bottom && boxes.chips.top - boxes.form.bottom <= 48, `the category chips sit under the search (${boxes.chips?.top - boxes.form?.bottom} px below it)`);
    t.check(boxes.chips && boxes.card && boxes.chips.bottom <= boxes.card.top, "before the first listings");
    await t.shot(page, "phone-home");
    await t.shot(page, "phone-home-1.5", { clip: { x: 0, y: 0, width: 390, height: 1266 }, fullPage: true });
  },
});

async function openFromResults(t, page, route, count) {
  await t.goto(page, route);
  await a.settled(page);
  const cards = (await a.resultCards(page)).slice(0, count);
  for (const card of cards) {
    await page.locator(`#resultados article a[href='/instrumentos/${card.slug}']`).first().click();
    await page.waitForURL((url) => url.pathname === `/instrumentos/${card.slug}`, { timeout: 30_000 });
    await page.locator("h1").first().waitFor();
    await page.waitForTimeout(500);
    await page.goBack();
    await page.waitForURL((url) => url.pathname === "/listados", { timeout: 30_000 });
    await a.settled(page);
  }
  return cards;
}

cases.push({
  id: "EASE-025",
  live: true,
  timeout: 360_000,
  run: async (t) => {
    if (!t.live) {
      // Basses from three sellers, new enough for the home's pool.
      const made = [0, 1, 2].map(() => {
        const seller = t.account({ kind: "particular" });
        return t.listing(seller, { title: `Bajo Ibanez SR ${a.word("zs")}`, category: "basses", type: "bass", brand: "Ibanez", model: "SR300", price: 1600 });
      });
      t.check(await a.waitForHtml(t, "/", made[2].slug), "the home's pool has the new basses");
    }
    const page = await t.page();
    await t.goto(page, "/");
    const firstPool = await a.homePool(page);
    if (!firstPool?.some((item) => item.category === "basses")) t.skip("the home's newest listings have no bass to rank first");
    const opened = await openFromResults(t, page, "/listados?category=basses", 3);
    t.check(opened.length === 3, `opened three basses (${opened.map((c) => c.slug).join(", ")})`);
    await t.goto(page, "/");
    const heading = page.locator("#para-ti-titulo");
    await a.until(async () => (await heading.innerText()) === "Para ti", { timeout: 10_000 });
    const pool = await a.homePool(page);
    const byslug = Object.fromEntries((pool || []).map((item) => [item.slug, item]));
    const shown = await forYouCards(page);
    const section = page.locator("section[aria-labelledby='para-ti-titulo']");
    t.check((await heading.innerText()) === "Para ti" && /Según lo que miraste en este dispositivo\./.test(await section.innerText()), "the row is \"Para ti\", according to what this device opened");
    t.check(byslug[shown[0]]?.category === "basses", `it leads with a bass (${shown[0]}: ${byslug[shown[0]]?.category})`);
    const pairs = shown.slice(1).map((slug, i) => [shown[i], slug]).filter(([x, y]) => byslug[x] && byslug[y] && byslug[x].seller_key === byslug[y].seller_key);
    t.check(shown.length > 1 && !pairs.length, `never two of one seller in a row across ${shown.length} cards${pairs.length ? `; same seller: ${pairs.map((p) => p.join(" + ")).join(", ")}` : ""}`);
    await section.locator("summary", { hasText: "¿Por qué veo esto?" }).click();
    const reasons = (await section.locator("details li").allInnerTexts()).map(clean);
    t.check(reasons.length > 0 && reasons.some((r) => /bajo/i.test(r)), `"¿Por qué veo esto?" lists: ${reasons.join(" | ")}`);
    await t.shot(page, "para-ti");
    await section.getByRole("button", { name: "Sin personalizar" }).click();
    await a.until(async () => (await heading.innerText()) === "Recién publicados", { timeout: 5_000 });
    const plain = await forYouCards(page);
    const plainOrder = (pool || []).map((item) => item.slug).filter((slug) => plain.includes(slug));
    t.check((await heading.innerText()) === "Recién publicados" && JSON.stringify(plain) === JSON.stringify(plainOrder), "\"Sin personalizar\" shows the newest first");
    const toggle = section.getByRole("button", { name: "Personalizar" });
    t.check((await toggle.getAttribute("aria-pressed")) === "true", "and offers Personalizar (pressed)");
    await toggle.click();
    await a.until(async () => (await heading.innerText()) === "Para ti", { timeout: 5_000 });
    t.check((await heading.innerText()) === "Para ti", "Personalizar brings Para ti back");
    await section.locator("summary", { hasText: "¿Por qué veo esto?" }).click();
    await section.getByRole("button", { name: "Empezar de cero" }).click();
    await a.until(async () => (await heading.innerText()) === "Lo más nuevo", { timeout: 5_000 });
    const taste = await page.evaluate(() => localStorage.getItem("laria:gustos"));
    t.check((await heading.innerText()) === "Lo más nuevo" && !taste, "\"Empezar de cero\" forgets the signals: \"Lo más nuevo\"");
  },
});

cases.push({
  id: "EASE-026",
  live: true,
  timeout: 300_000,
  run: async (t) => {
    if (!t.live) {
      const seller = t.account({ kind: "particular" });
      const bass = t.listing(seller, { title: `Bajo Squier Precision ${a.word("zt")}`, category: "basses", type: "bass", brand: "Squier", model: "Precision", price: 1100 });
      t.check(await a.waitForHtml(t, "/", bass.slug), "the home's pool has a new bass");
    }
    const page = await t.page();
    await t.goto(page, "/");
    const row = page.locator("section[aria-labelledby='que-tocas-titulo']");
    t.check(await row.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false), "a first visit shows \"¿Qué tocas?\"");
    await t.shot(page, "row");
    const pool = await a.homePool(page);
    await row.getByRole("button", { name: "Bajo", exact: true }).click();
    await row.getByRole("button", { name: "Listo" }).click();
    await a.until(async () => (await row.count()) === 0, { timeout: 5_000 });
    const heading = clean(await page.locator("#para-ti-titulo").innerText());
    const shown = await forYouCards(page);
    const first = (pool || []).find((item) => item.slug === shown[0]);
    t.check((await row.count()) === 0 && heading === "Para ti", `choosing Bajo hides the row and orders "${heading}"`);
    if (pool?.some((item) => item.category === "basses")) t.check(first?.category === "basses", `with a bass first (${shown[0]})`);
    else t.note("no bass among the home's newest listings to lead with");
    await t.shot(page, "chosen");
    const fresh = await t.page();
    await t.goto(fresh, "/");
    const row2 = fresh.locator("section[aria-labelledby='que-tocas-titulo']");
    await row2.waitFor({ timeout: 15_000 });
    await row2.getByRole("button", { name: "Saltar" }).click();
    await a.until(async () => (await row2.count()) === 0, { timeout: 5_000 });
    t.check((await row2.count()) === 0, "Saltar hides it");
    await t.goto(fresh, "/");
    await fresh.waitForTimeout(2_500);
    t.check((await row2.count()) === 0 && clean(await fresh.locator("#para-ti-titulo").innerText()) === "Lo más nuevo", "and it stays hidden after a reload");
  },
});

cases.push({
  id: "EASE-027",
  timeout: 300_000,
  run: async (t) => {
    const page = await t.page();
    await t.goto(page, "/");
    await page.waitForTimeout(1_500);
    const visitCookie = (await page.context().cookies()).find((cookie) => cookie.name === "laria_ultima_visita");
    t.check(visitCookie, `the visit is marked (${visitCookie?.value})`);
    // The visitor left 40 minutes ago; while away, a listing was published.
    const away = Date.now() - 40 * 60 * 1000;
    await page.context().addCookies([{ name: "laria_ultima_visita", value: String(away), url: t.base }]);
    const seller = t.account({ kind: "particular" });
    const fresh = t.listing(seller, { title: `Yamaha Pacifica ${a.word("zn")}`, brand: "Yamaha", model: "Pacifica 012", price: 1150 });
    const older = t.listing(seller, { title: `Yamaha Revstar ${a.word("zo")}`, brand: "Yamaha", model: "Revstar", price: 3200, publishedDaysAgo: 1 });
    t.check(await a.waitForHtml(t, "/", fresh.slug), "the home's pool has the new listing");
    await t.goto(page, "/");
    const section = page.locator("section[aria-labelledby='nuevo-titulo']");
    const shownOk = await section.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
    const pool = (await a.homePool(page)) || [];
    const published = Object.fromEntries(pool.map((item) => [item.slug, Date.parse(item.published_at)]));
    const fresher = await forYouCards(page, "nuevo-titulo");
    const inOrder = await page.evaluate(() => {
      const n = document.getElementById("nuevo-titulo");
      const p = document.getElementById("para-ti-titulo");
      return Boolean(n && p && n.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    const newerThanFresh = fresher.filter((slug) => published[slug] > published[fresh.slug]).length;
    t.check(shownOk && (fresher.includes(fresh.slug) || newerThanFresh >= 6), `"Nuevo desde tu última visita" shows the listing published while away (${fresher.length} new: ${a.short(fresher, 3)})`);
    t.check(fresher.every((slug) => published[slug] > away) && !fresher.includes(older.slug), "only listings published since the last visit; the older one is not there");
    t.check(inOrder, "the row comes before Para ti");
    await section.scrollIntoViewIfNeeded().catch(() => {});
    await t.shot(page, "nuevo");
    await t.goto(page, "/");
    await page.waitForTimeout(1_500);
    const again = await forYouCards(page, "nuevo-titulo");
    t.check(again.length > 0 && (again.includes(fresh.slug) || newerThanFresh >= 6), "a revisit within the same visit still shows it");
  },
});

cases.push({
  id: "EASE-028",
  live: true,
  run: async (t) => {
    const page = await t.page();
    const sent = [];
    page.on("request", (request) => {
      if (request.resourceType() === "document") return;
      sent.push({ method: request.method(), url: request.url(), body: request.postData() || "" });
    });
    await t.goto(page, "/listados");
    await a.settled(page);
    const opened = await openFromResults(t, page, "/listados", 2);
    const cards = await a.resultCards(page);
    const compared = cards.slice(4, 6);
    for (const card of compared) await page.locator(`#resultados article:has(a[href='/instrumentos/${card.slug}']) input[type=checkbox]`).check();
    await t.goto(page, "/");
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1_500);
    const stored = await page.evaluate(() => ({ gustos: localStorage.getItem("laria:gustos"), comparar: localStorage.getItem("laria:comparar"), vistos: localStorage.getItem("laria:vistos") }));
    t.check(stored.gustos && stored.comparar && stored.vistos, "taste, comparison and recently viewed are kept on the device");
    const api = sent.filter((r) => !/\/_next\/static|\.(png|jpe?g|webp|avif|svg|woff2?|css|js)(\?|$)/.test(r.url) && !(r.method === "GET" && /\/instrumentos\/[^/?]+(\?_rsc=|$)/.test(r.url)));
    const carries = (needle) => api.filter((r) => `${r.url} ${r.body}`.includes(needle));
    const tasteLeaks = api.filter((r) => /gustos|taste/i.test(`${r.url} ${r.body}`) || (stored.gustos && `${r.url} ${r.body}`.includes(stored.gustos)));
    t.check(!tasteLeaks.length, `no request carries the taste (${api.length} requests checked)`);
    const compareLeaks = compared.flatMap((card) => carries(card.slug).map((r) => `${r.method} ${a.pathOf(r.url)}`));
    t.check(!compareLeaks.length, `no request carries the comparison${compareLeaks.length ? `: ${compareLeaks.join(" | ")}` : ""}`);
    const viewedLeaks = opened.flatMap((card) => carries(card.slug).filter((r) => r.method !== "GET" || /\/api\//.test(r.url)).map((r) => `${r.method} ${new URL(r.url).pathname} ${r.body.slice(0, 160)}`));
    t.check(!viewedLeaks.length, `no request carries recently viewed listings${viewedLeaks.length ? `; sent: ${[...new Set(viewedLeaks)].join(" | ")}` : ""}`);
    const pool = await a.homePool(page);
    const source = await a.pageSource(page);
    t.check(pool?.length > 0 && pool.every((item) => /^[0-9a-f]{12}$/.test(item.seller_key)) && !source.includes("owner_user_id"), `the home's ${pool?.length} listings carry only a 12-character seller key, no owner id`);
  },
});

module.exports = cases;
