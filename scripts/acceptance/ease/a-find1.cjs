// Effortless Laria acceptance, group A part 1: find (EASE-001 to EASE-014). Cases marked live read public pages
// signed out and find their data on the page; locally they first create what the case needs.
"use strict";
const a = require("./a-helpers.cjs");

const cases = [];
const rowId = (key, value) => `filtro-${key}-${value ?? "todos"}`.replace(/[^A-Za-z0-9_-]+/g, "-");

// ------------------------------------------------------------------ FIX 07: filters keep the page's place
cases.push({
  id: "EASE-001",
  live: true,
  run: async (t) => {
    const page = await t.page();
    await t.goto(page, "/listados");
    await a.settled(page);
    const data = await a.facets(page);
    const places = (data?.locations || []).filter((place) => place.count > 0).sort((x, y) => y.count - x.count);
    if (places.length < 2) t.skip("needs listings in two places or more");
    const most = places[0];
    const fewest = places[places.length - 1];

    async function choose(city) {
      const id = rowId("location", city);
      const row = page.locator(`#${id}`);
      await row.scrollIntoViewIfNeeded();
      // The row near the top of the screen: low in the column, the results above it.
      await page.evaluate((rid) => window.scrollBy(0, document.getElementById(rid).getBoundingClientRect().top - 140), id);
      await page.waitForTimeout(400);
      const before = await page.evaluate(() => Math.round(window.scrollY));
      const rowBefore = (await a.rect(page, `#${id}`)).top;
      await row.click();
      await page.waitForURL((url) => url.searchParams.toString().includes("location="), { timeout: 30_000 });
      await a.settled(page);
      await page.waitForTimeout(600);
      const region = await a.rect(page, "#resultados");
      const rowAfter = (await a.rect(page, `#${id}`))?.top;
      return { before, after: region.scrollY, region, rowBefore, rowAfter };
    }

    const many = await choose(most.city);
    await t.shot(page, "many");
    // The chips row added above the grid moves the document down; the browser keeps the chosen row where it was.
    t.check(Math.abs(many.rowAfter - many.rowBefore) <= 8 && many.after > 0,
      `choosing ${most.city} (${most.count}) low in the column keeps the page where it was: the row stays at ${many.rowBefore} → ${many.rowAfter} px on screen (scrollY ${many.before} → ${many.after}, not the top)`);
    t.check(many.region.bottom > 0 && many.region.top < many.region.innerHeight, "the results stay on screen");

    await t.goto(page, "/listados");
    await a.settled(page);
    const few = await choose(fewest.city);
    await t.shot(page, "few");
    const moved = few.after !== few.before;
    const inView = few.region.top >= 0 && few.region.top < few.region.innerHeight && few.region.bottom > 0;
    t.check(inView && few.after > 0,
      `choosing ${fewest.city} (${fewest.count}): the results come into view (top ${few.region.top} px of ${few.region.innerHeight}), not the top of the page (scrollY ${few.before} → ${few.after})`);
    t.check(!moved || few.region.top <= 60, moved ? "the results were off-screen, so the page scrolled to their first row" : "the results were on screen, so nothing moved");
    t.note(`off-screen branch ${moved ? "exercised" : "not exercised"}`);
  },
});

// ------------------------------------------------------------------ BIG 03: free-text search
cases.push({
  id: "EASE-002",
  live: true,
  timeout: 360_000,
  run: async (t) => {
    let cajon = null;
    if (!t.live) {
      const seller = t.account({ kind: "particular" });
      cajon = t.listing(seller, { title: `Cajón peruano Meinl ${t.tag().slice(-4)}`, category: "percussion", type: "hand_percussion", brand: "Meinl", model: "Headliner", price: 450 });
    }
    const page = await t.page();
    await t.goto(page, "/listados");
    await a.settled(page);
    const results = {};
    for (const text of ["strato", "stratocaster", "cajon", "bass", "fender strato"]) {
      await a.headerSearch(page, text);
      const url = page.url();
      const count = await a.resultCount(page);
      const slugs = await a.allResultSlugs(t, page, 3);
      const cards = await a.resultCards(page);
      results[text] = { url, count, slugs, cards };
      t.note(`"${text}" → ${a.pathOf(url)}: ${count} resultados`);
      if (text === "strato") await t.shot(page, "strato");
      await t.goto(page, "/listados");
      await a.settled(page);
    }

    // Each result of a Strat search is a Stratocaster (title, model or type).
    const rows = (slugs) => (t.live ? [] : t.sql(`select slug, title, brand, model, category, instrument_type from public.listings where slug in (${slugs.map(t.literal).join(",") || "''"})`));
    // Live: a card shows only the title, so a card without the words is opened (up to six) to read its title and the
    // brand and model line under it.
    const heads = {};
    async function headOf(slug) {
      if (heads[slug] === undefined) {
        const listing = await t.page();
        await t.goto(listing, `/instrumentos/${slug}`);
        heads[slug] = await listing.locator("h1").first().evaluate((h) => {
          let text = h.innerText;
          for (let n = h.nextElementSibling, i = 0; n && i < 2; n = n.nextElementSibling, i += 1) text += ` ${n.innerText}`;
          return text;
        }).catch(() => "");
        await listing.context().close();
      }
      return heads[slug];
    }
    async function lacking(cards, test, limit = 6) {
      const bad = [];
      for (const card of cards.filter((c) => !test(c.text)).slice(0, limit)) if (!test(await headOf(card.slug))) bad.push(card.slug);
      return bad;
    }
    async function isStrat(slugs, cards) {
      if (!t.live) return rows(slugs).filter((row) => !/strat/i.test(`${row.title} ${row.model}`)).map((row) => row.slug);
      return lacking(cards, (text) => /strat/i.test(text));
    }
    for (const text of ["strato", "stratocaster"]) {
      const r = results[text];
      const bad = await isStrat(r.slugs, r.cards);
      t.check(r.count > 0 && bad.length === 0, `"${text}" finds ${r.count} listings, all Stratocasters${bad.length ? `; not: ${a.short(bad)}` : ""}`);
    }

    const c = results.cajon;
    const cp = a.params(c.url);
    if (t.live && !c.count) t.note("the live catalog has no cajón; the cajón part only checked the redirect");
    t.check(cp.category === "percussion" && cp.instrument_type === "hand_percussion",
      `"cajon" opens Batería y percusión · Percusión de mano (${a.pathOf(c.url)})`);
    if (!t.live) t.check(c.slugs.includes(cajon.slug), `"cajon" finds the cajón ${cajon.slug} (${c.count} resultados)`);

    const b = results.bass;
    const bp = a.params(b.url);
    const notBass = t.live ? [] : rows(b.slugs).filter((row) => row.category !== "basses").map((row) => row.slug);
    t.check(bp.category === "basses" && b.count > 0 && notBass.length === 0, `"bass" opens Bajos with ${b.count} basses (${a.pathOf(b.url)})${notBass.length ? `; not basses: ${a.short(notBass)}` : ""}`);

    const fs = results["fender strato"];
    const fsBad = t.live
      ? await lacking(fs.cards, (text) => /fender/i.test(text) && /strat/i.test(text))
      : rows(fs.slugs).filter((row) => !(/fender/i.test(`${row.brand} ${row.title}`) && /strat/i.test(`${row.title} ${row.model}`))).map((row) => row.slug);
    t.check(fs.count > 0 && fsBad.length === 0, `"fender strato" finds ${fs.count} listings, each with both words${fsBad.length ? `; not: ${a.short(fsBad)}` : ""}`);
    const others = t.live
      ? await lacking(results.strato.cards, (text) => /fender/i.test(text))
      : rows(results.strato.slugs).filter((row) => !/fender/i.test(`${row.brand} ${row.title}`)).map((row) => row.slug);
    if (others.length) {
      t.check(others.every((slug) => !fs.slugs.includes(slug)), `Strats of other brands found by "strato" (${a.short(others)}) are left out of "fender strato": every word must match`);
    } else {
      t.note("no Strat of another brand to show the every-word rule");
    }
  },
});

cases.push({
  id: "EASE-003",
  live: true,
  timeout: 300_000,
  run: async (t) => {
    if (!t.live) {
      const seller = t.account({ kind: "particular" });
      t.listing(seller, { title: `Cajón flamenco Schlagwerk ${t.tag().slice(-4)}`, category: "percussion", type: "hand_percussion", brand: "Schlagwerk", model: "CP404", price: 520 });
    }
    const page = await t.page();
    await t.goto(page, "/listados?category=guitars");
    await a.settled(page);
    const guitars = await a.resultCount(page);
    await a.headerSearch(page, "guitara");
    const url = page.url();
    const count = await a.resultCount(page);
    const cards = await a.resultCards(page);
    await t.shot(page, "guitara");
    let notGuitars = [];
    if (!t.live) {
      notGuitars = t.sql(`select slug from public.listings where slug in (${cards.map((c) => t.literal(c.slug)).join(",") || "''"}) and category <> 'guitars'`).map((row) => row.slug);
    } else if (a.params(url).category !== "guitars") {
      for (const card of cards.slice(0, 4)) {
        const listing = await t.page();
        await t.goto(listing, `/instrumentos/${card.slug}`);
        if (!/Guitarras/.test(await listing.locator("nav[aria-label='Ruta de navegación']").innerText().catch(() => ""))) notGuitars.push(card.slug);
        await listing.context().close();
      }
    }
    t.check(count > 0 && notGuitars.length === 0, `"guitara" finds ${count} guitars (${a.pathOf(url)}; Guitarras has ${guitars})${notGuitars.length ? `; not guitars: ${a.short(notGuitars)}` : ""}`);

    const found = {};
    for (const text of ["cajón", "cajon"]) {
      await t.goto(page, "/listados");
      await a.settled(page);
      await a.headerSearch(page, text);
      found[text] = { url: a.pathOf(page.url()), slugs: (await a.resultCards(page)).map((c) => c.slug) };
    }
    t.check(found["cajón"].url === found.cajon.url && a.sameSet(found["cajón"].slugs, found.cajon.slugs) && (t.live || found.cajon.slugs.length > 0),
      `"cajón" and "cajon" open the same page (${found.cajon.url}) with the same ${found.cajon.slugs.length} results`);
  },
});

cases.push({
  id: "EASE-004",
  live: true,
  run: async (t) => {
    const page = await t.page();
    await t.goto(page, "/listados");
    await a.settled(page);
    const redirects = [];
    page.on("response", (response) => {
      const request = response.request();
      if (request.isNavigationRequest() && request.frame() === page.mainFrame() && response.status() >= 300 && response.status() < 400) redirects.push(`${response.status()} ${a.pathOf(response.url())}`);
    });
    await a.headerSearch(page, "bajo 5 cuerdas menos de 2000 en Lima");
    const p = a.params(page.url());
    t.check(p.category === "basses" && p.location === "Lima" && p.max_price === "2000" && p.strings === "5" && !p.q,
      `the phrase opens ${a.pathOf(page.url())}`);
    t.check(redirects.length === 1, `one redirect (${redirects.join(" | ") || "none"})`);
    const chips = await a.chipTexts(page);
    const texts = chips.map((chip) => chip.text);
    t.check(["Bajos", "5 cuerdas", "Hasta S/ 2,000", "Lima"].every((text) => texts.includes(text)), `the chips read ${texts.join(", ")}`);
    await t.shot(page, "chips");
    // Each chip removes its own filter only.
    const current = a.params(page.url());
    const wrong = chips.filter((chip) => {
      const next = a.params(chip.href);
      const removed = Object.keys(current).filter((key) => next[key] !== current[key]);
      const added = Object.keys(next).filter((key) => !(key in current) && key !== "page");
      return removed.length !== 1 || added.length > 0;
    });
    t.check(!wrong.length, `each chip removes only its filter${wrong.length ? `; not: ${wrong.map((c) => `${c.text} → ${c.href}`).join(" | ")}` : ""}`);
    await page.getByRole("link", { name: /Quitar filtro: Precio/ }).click();
    await page.waitForURL((url) => !url.searchParams.has("max_price"), { timeout: 30_000 });
    await a.settled(page);
    const after = a.params(page.url());
    t.check(after.category === "basses" && after.location === "Lima" && after.strings === "5" && !after.max_price, `removing "Hasta S/ 2,000" keeps the rest (${a.pathOf(page.url())})`);
  },
});

cases.push({
  id: "EASE-005",
  run: async (t) => {
    const seller = t.account({ kind: "particular" });
    const words = { shown: a.word("zv"), hidden: a.word("zh"), pending: a.word("zp") };
    const shown = t.listing(seller, { title: `Pedal Boss ${words.shown}`, category: "pedals", type: "pedals", brand: "Boss", model: "DS-1", price: 250 });
    const hidden = t.listing(seller, { title: `Pedal Boss ${words.hidden}`, category: "pedals", type: "pedals", brand: "Boss", model: "SD-1", price: 260 });
    t.exec(`update public.listings set status = 'hidden' where id = ${t.literal(hidden.id)}`);
    t.listing(seller, { status: "pending", title: `Pedal Boss ${words.pending}`, category: "pedals", type: "pedals", brand: "Boss", model: "BD-2", price: 270 });
    const page = await t.page();
    const found = {};
    for (const [kind, text] of Object.entries(words)) {
      await t.goto(page, "/listados");
      await a.settled(page);
      await a.headerSearch(page, text);
      const cards = await a.resultCards(page);
      found[kind] = { count: await a.resultCount(page), slugs: cards.map((c) => c.slug), titles: cards.map((c) => c.title).join(" | ") };
      if (kind === "hidden") await t.shot(page, "hidden");
    }
    t.check(found.shown.count === 1 && found.shown.slugs[0] === shown.slug, `the approved control listing is found by its word (${found.shown.count})`);
    t.check(found.hidden.count === 0 && !found.hidden.titles.includes(words.hidden) && !found.hidden.slugs.includes(hidden.slug), `a once-public, now hidden listing's word returns nothing (${found.hidden.count})`);
    t.check(found.pending.count === 0 && !found.pending.titles.includes(words.pending), `a pending listing's word returns nothing (${found.pending.count})`);
  },
});

cases.push({
  id: "EASE-006",
  run: async (t) => {
    const buyer = t.account({ kind: "buyer" });
    const text = a.word("zk");
    const page = await t.page({ as: buyer.email });
    await t.goto(page, `/listados?q=${text}`);
    await a.settled(page);
    const trigger = page.getByRole("button", { name: "Crear alerta", exact: true }).first();
    await trigger.click();
    await page.getByText("Crear alerta para esta búsqueda").first().waitFor();
    await page.getByRole("radio", { name: /Al instante/ }).first().check();
    await page.locator("[id^='alerta-'][id$='-panel']").getByRole("button", { name: "Crear alerta", exact: true }).click();
    await page.getByText(/Alerta creada/).first().waitFor({ timeout: 15_000 });
    await t.shot(page, "alert");
    const alerts = t.sql(`select id, frequency, search_filters from public.saved_search_alerts where user_id = ${t.literal(buyer.id)}`);
    t.check(alerts.length === 1 && alerts[0].search_filters?.query === text && alerts[0].frequency === "immediate",
      `the alert saves the text search (${JSON.stringify(alerts.map((row) => ({ frequency: row.frequency, filters: row.search_filters })))})`);
    const seller = t.account({ kind: "particular" });
    const match = t.listing(seller, { title: `Guitarra Ibanez ${text}`, brand: "Ibanez", model: "RG", price: 1800 });
    const other = t.listing(seller, { title: `Guitarra Ibanez ${a.word("zm")}`, brand: "Ibanez", model: "RG", price: 1900 });
    const notes = await a.until(() => t.notifications(buyer.id).filter((n) => n.event_type === "listing_alert_match"), { timeout: 15_000 });
    const mails = t.emails(`recipient_user_id = ${t.literal(buyer.id)} and event_type = 'search_alert_immediate'`);
    t.check(notes.length === 1 && JSON.stringify(notes[0]).includes(match.title) && !JSON.stringify(notes).includes(other.title),
      `a new listing with the word notifies once (${notes.map((n) => n.message || n.title).join(" | ")}); one without it does not`);
    t.check(mails.length === 1, `one immediate alert e-mail is queued (${mails.length})`);
    await t.goto(page, "/mi-cuenta/alertas");
    t.check((await page.locator("main").innerText()).includes(text), "Alertas lists the alert with its text");
  },
});

// ------------------------------------------------------------------ FIND 01 / FIND 02: the header search keeps the filters
async function searchInsideFilters(t) {
  const page = await t.page();
  await t.goto(page, "/listados?category=guitars&location=Lima");
  await a.settled(page);
  const box = await a.headerSearch(page, "fender", { submit: false });
  await page.locator("[role=listbox] [role=option]").first().waitFor({ timeout: 10_000 }).catch(() => {});
  const options = (await page.locator("[role=listbox] [role=option]").allInnerTexts()).map((text) => text.replace(/\s+/g, " ").trim());
  const before = page.url();
  await box.press("Enter");
  await page.waitForURL((url) => url.href !== before, { timeout: 30_000 });
  await a.settled(page);
  return { page, box, options };
}

cases.push({
  id: "EASE-007",
  live: true,
  run: async (t) => {
    const { page, options } = await searchInsideFilters(t);
    t.check(options.some((text) => text.includes("Buscar “fender” en todo el catálogo")), `the list offers the way out (${a.short(options, 4)})`);
    const p = a.params(page.url());
    t.check(p.category === "guitars" && p.location === "Lima" && p.q === "fender", `the search keeps both filters (${a.pathOf(page.url())})`);
    const scope = await page.getByText(/^Buscando “fender” en /).first().innerText();
    t.check(/^Buscando “fender” en Guitarras · Lima\. Buscar en todo el catálogo$/.test(scope.replace(/\s+/g, " ").trim()), `the page says where it searched: "${scope.replace(/\s+/g, " ").trim()}"`);
    await t.shot(page, "scoped");
    await page.getByRole("link", { name: "Buscar en todo el catálogo" }).click();
    await page.waitForURL((url) => !url.searchParams.has("category"), { timeout: 30_000 });
    await a.settled(page);
    const out = a.params(page.url());
    t.check(out.q === "fender" && !out.category && !out.location, `"Buscar en todo el catálogo" drops them (${a.pathOf(page.url())})`);
    // The same way out from the list.
    await t.goto(page, "/listados?category=guitars&location=Lima");
    await a.settled(page);
    await a.headerSearch(page, "fender", { submit: false });
    await page.getByRole("option", { name: /Buscar “fender” en todo el catálogo/ }).click();
    await page.waitForURL((url) => !url.searchParams.has("category"), { timeout: 30_000 });
    t.check(a.pathOf(page.url()) === "/listados?q=fender", `the list's option opens ${a.pathOf(page.url())}`);
  },
});

cases.push({
  id: "EASE-008",
  live: true,
  run: async (t) => {
    const { page } = await searchInsideFilters(t);
    const h1 = (await page.locator("h1").first().innerText()).trim();
    const count = await a.resultCount(page);
    const title = await page.title();
    t.check(h1 === "“fender” en Guitarras · Lima", `the h1 reads ${h1}`);
    t.check(title === `“fender” en Guitarras · Lima (${count.toLocaleString("en-US")}) | Laria`, `the tab reads "${title}" (${count} resultados)`);
  },
});

// ------------------------------------------------------------------ FIND 03: suggestions with counts
cases.push({
  id: "EASE-009",
  live: true,
  run: async (t) => {
    // Locally, a brand only this check uses, with two models: its brand and model suggestions have exact counts (brands and
    // models are shared for two minutes per typed text, and a new text is read fresh).
    let unique = null;
    if (!t.live) {
      unique = `Zq${a.word("").slice(0, 7)}`;
      const seller = t.account({ kind: "particular" });
      t.listing(seller, { title: `Guitarra ${unique} Alfa uno`, brand: unique, model: "Alfa" });
      t.listing(seller, { title: `Guitarra ${unique} Alfa dos`, brand: unique, model: "Alfa" });
      t.listing(seller, { title: `Guitarra ${unique} Beta`, brand: unique, model: "Beta" });
    }
    const page = await t.page();
    await t.goto(page, "/listados");
    await a.settled(page);
    const data = await a.facets(page);
    const box = page.locator("#global-marketplace-search");
    const options = () => page.locator("[role=listbox] [role=option]").evaluateAll((items) => items.map((item) => ({ id: item.id, text: item.innerText.replace(/\s+/g, " ").trim(), selected: item.getAttribute("aria-selected") })));
    await box.click();
    await box.fill("y");
    await page.waitForTimeout(1_200);
    t.check((await box.getAttribute("aria-expanded")) !== "true", "one letter opens nothing");
    const lists = {};
    const prefix = unique ? unique.slice(0, 5).toLowerCase() : null;
    for (const text of ["ya", "yam", "guit", ...(prefix ? [prefix] : [])]) {
      await box.fill(text);
      await a.until(async () => (await box.getAttribute("aria-expanded")) === "true" && (await options()).length > 0, { timeout: 8_000 });
      await page.waitForTimeout(600);
      lists[text] = await options();
      t.note(`"${text}": ${lists[text].map((o) => o.text).join(" | ")}`);
      if (text === "guit") await t.shot(page, "guit");
    }
    const counted = (list) => list.filter((o) => /\d+ publicaci(ón|ones)$/.test(o.text));
    const yamaha = data.brands.find((brand) => brand.brand === "Yamaha");
    if (yamaha) {
      const option = lists.yam.find((o) => /^Yamaha · Marca/.test(o.text));
      const shown = option ? Number(/(\d+) publicaci/.exec(option.text)?.[1]) : null;
      t.check(option && Math.abs(shown - yamaha.count) <= Math.max(3, Math.ceil(yamaha.count * 0.1)), `"yam" offers ${option?.text} (the filter says ${yamaha.count}; suggestions are cached a few minutes)`);
      t.check(lists.ya.some((o) => /^Yamaha · Marca/.test(o.text)), "two letters already offer Yamaha");
    } else {
      t.note("no Yamaha listings; the brand part was not checked");
    }
    const guitars = data.category.guitars || 0;
    const category = lists.guit.find((o) => /^Guitarras · Categoría/.test(o.text));
    const types = lists.guit.filter((o) => /^.+ · Guitarras [\d,]+/.test(o.text));
    // Suggestions are cached for up to two minutes (lib/catalog-suggest-data.ts revalidateSeconds 120) while other runs add listings.
    const near = (shown, now) => Math.abs(shown - now) <= Math.max(3, Math.ceil(now * 0.1));
    const guitCount = Number(/([\d,]+) publicaci/.exec(category?.text || "")?.[1]?.replace(/,/g, ""));
    if (t.live) t.check(category && near(guitCount, guitars), `"guit" offers ${category?.text} (the filter says ${guitars})`);
    else t.check(category && guitCount > 0, `"guit" offers ${category?.text} (the filter says ${guitars} now: type counts are shared for a few minutes while other runs add guitars)`);
    if (unique) {
      const list = lists[prefix];
      const find = (start) => list.find((o) => o.text.startsWith(start));
      const brand = find(`${unique} · Marca`);
      const alfa = find(`${unique} Alfa · Modelo`);
      const beta = find(`${unique} Beta · Modelo`);
      t.check(/ 3 publicaciones$/.test(brand?.text || "") && / 2 publicaciones$/.test(alfa?.text || "") && / 1 publicación$/.test(beta?.text || ""),
        `"${prefix}" offers the brand and its models with exact counts: ${[brand, alfa, beta].map((o) => o?.text ?? "missing").join(" | ")}`);
    }
    t.check(types.length > 0, `"guit" offers types: ${types.map((o) => o.text).join(" | ")}`);
    t.check([...lists.ya, ...lists.yam, ...lists.guit].filter((o) => !/^Buscar/.test(o.text)).every((o) => counted([o]).length === 1 && !/\b0 publicaciones/.test(o.text)),
      "every suggestion carries a count above zero");
    // Arrows, Enter and Escape.
    await box.press("ArrowDown");
    let state = await options();
    const first = await box.getAttribute("aria-activedescendant");
    t.check(first === state[0].id && state[0].selected === "true", `ArrowDown selects the first option (${state[0].text})`);
    await box.press("ArrowDown");
    state = await options();
    t.check((await box.getAttribute("aria-activedescendant")) === state[1].id && state[1].selected === "true", `ArrowDown again selects the second (${state[1].text})`);
    await box.press("ArrowUp");
    t.check((await box.getAttribute("aria-activedescendant")) === state[0].id, "ArrowUp goes back");
    await box.press("Escape");
    t.check((await box.getAttribute("aria-expanded")) !== "true", "Escape closes the list");
    await box.fill("");
    await box.pressSequentially("guit", { delay: 60 });
    await a.until(async () => (await box.getAttribute("aria-expanded")) === "true" && (await options()).length > 0, { timeout: 8_000 });
    await page.waitForTimeout(500);
    await box.press("ArrowDown");
    const chosen = (await options())[0];
    const before = page.url();
    await box.press("Enter");
    // A category opens its landing (/instrumentos/guitarras); types, brands and models open the filtered catalog.
    await page.waitForURL((url) => url.href !== before, { timeout: 30_000 });
    await a.settled(page);
    const landed = a.pathOf(page.url());
    t.check(/^Guitarras · Categoría/.test(chosen.text) ? landed === "/instrumentos/guitarras" : /^\/listados\?/.test(landed),
      `Enter opens the chosen suggestion (${chosen.text} → ${landed})`);
  },
});

// ------------------------------------------------------------------ FIND 04: zero results rescue the search
cases.push({
  id: "EASE-010",
  live: true,
  run: async (t) => {
    let city = null;
    if (!t.live) {
      city = "Tacna";
      const seller = t.account({ kind: "particular", city, region: "Tacna" });
      t.listing(seller, { title: `Pedal Boss DS-1 ${t.tag().slice(-4)}`, category: "pedals", type: "pedals", brand: "Boss", model: "DS-1", price: 280, city, region: "Tacna" });
    }
    const page = await t.page();
    await t.goto(page, "/listados");
    const all = await a.facets(page);
    const withGuitars = await a.facets(page, "category=guitars");
    const guitarCities = new Set((withGuitars?.locations || []).filter((l) => l.count > 0).map((l) => l.city));
    const empty = (all?.locations || []).filter((l) => l.count > 0 && !guitarCities.has(l.city)).sort((x, y) => y.count - x.count);
    if (!city) city = empty[0]?.city;
    if (!city) t.skip("every place with listings has guitars; no empty combination to open");
    const placeCount = t.live ? (all.locations.find((l) => l.city === city) || {}).count
      : t.sql(`select count(*)::int as n from public.listings where status = 'approved' and city = ${t.literal(city)}`)[0].n;
    await t.goto(page, `/listados?category=guitars&location=${encodeURIComponent(city)}`);
    await a.settled(page);
    const text = (await page.locator("#resultados").innerText()).replace(/\s+/g, " ");
    t.check(/No encontramos resultados/.test(text) && /Prueba sin uno de tus filtros:/.test(text), "no results says so and offers ways out");
    const ways = await page.locator("#resultados a", { hasText: /^Sin “/ }).evaluateAll((links) => links.map((l) => ({ text: l.innerText.trim(), href: l.getAttribute("href") })));
    const withoutGuitars = ways.find((w) => w.text.startsWith("Sin “Guitarras” hay"));
    const withoutCity = ways.find((w) => w.text.startsWith(`Sin “${city}” hay`));
    t.check(withoutGuitars && Number(/hay ([\d,]+)/.exec(withoutGuitars.text)[1].replace(/,/g, "")) === placeCount, `${withoutGuitars?.text} (${city} has ${placeCount})`);
    // The counts are cached for a minute; locally other runs keep adding guitars meanwhile.
    t.check(withoutCity && Math.abs(Number(/hay ([\d,]+)/.exec(withoutCity.text)[1].replace(/,/g, "")) - withGuitars.total) <= Math.max(2, Math.ceil(withGuitars.total * 0.05)), `${withoutCity?.text} (Guitarras has ${withGuitars.total})`);
    const closest = await page.locator("section[aria-labelledby='mas-parecido']");
    const heading = await closest.locator("h2").innerText().catch(() => "");
    const closestCards = await a.resultCards(page, "section[aria-labelledby='mas-parecido']");
    t.check(/Lo más parecido|Lo más nuevo en Laria/.test(heading) && closestCards.length >= 1 && closestCards.length <= 4, `"${heading}" shows ${closestCards.length} listings`);
    t.check(/¿Lo quieres igual\? Te avisamos cuando aparezca\./.test(text), "the alert line shows");
    const alert = page.locator("#resultados").getByRole("link", { name: "Crear alerta" }).or(page.locator("#resultados").getByRole("button", { name: "Crear alerta" }));
    t.check((await alert.count()) > 0, "with the alert control (a sign-in link for visitors)");
    await t.shot(page, "rescue", { fullPage: true });
    await page.locator("#resultados a", { hasText: /^Sin “Guitarras” hay/ }).click();
    await page.waitForURL((url) => !url.searchParams.has("category"), { timeout: 30_000 });
    await a.settled(page);
    const p = a.params(page.url());
    t.check(p.location === city && !p.category && (await a.resultCount(page)) === placeCount, `"Sin “Guitarras”" opens ${a.pathOf(page.url())} with ${placeCount} results`);
  },
});

// ------------------------------------------------------------------ FIND 05: places from listings, by zone
cases.push({
  id: "EASE-011",
  live: true,
  run: async (t) => {
    const page = await t.page();
    await t.goto(page, "/listados");
    await a.settled(page);
    const data = await a.facets(page);
    const cities = (data?.locations || []).filter((l) => l.count > 0);
    const block = page.locator("section[aria-label='Filtros'] > div", { has: page.locator("h2", { hasText: /^Ubicación$/ }) });
    const shown = await block.evaluate((node) => {
      const zones = [];
      for (const zone of node.querySelectorAll(":scope > div > div")) {
        const rows = [...zone.querySelectorAll("li > :is(a, span)")].map((row) => ({ id: row.id, text: row.innerText.replace(/\s+/g, " ").trim() }));
        zones.push({ label: zone.querySelector("h3")?.textContent.trim(), rows });
      }
      return zones;
    });
    const cityRows = shown.flatMap((zone) => zone.rows.filter((row) => !row.id.startsWith("filtro-zona-")).map((row) => ({ zone: zone.label, city: row.text.replace(/\s[\d,]+(\sresultados)?$/, ""), count: Number(/([\d,]+)(\sresultados)?$/.exec(row.text)?.[1].replace(/,/g, "")) })));
    t.check(a.sameSet(cityRows.map((r) => r.city), cities.map((c) => c.city)), `Ubicación lists the places with listings: ${cityRows.map((r) => `${r.city} ${r.count}`).join(", ")} (facets: ${cities.map((c) => `${c.city} ${c.count}`).join(", ")})`);
    t.check(cityRows.every((r) => r.count === cities.find((c) => c.city === r.city)?.count && r.count > 0), "each with its count");
    const zoneProblems = [];
    for (const zone of shown) {
      const all = zone.rows.find((row) => row.id.startsWith("filtro-zona-"));
      const own = zone.rows.filter((row) => !row.id.startsWith("filtro-zona-"));
      const sum = cityRows.filter((r) => r.zone === zone.label).reduce((total, r) => total + r.count, 0);
      if (own.length > 1 && !(all && /^Todo /.test(all.text) && Number(/([\d,]+)(\sresultados)?$/.exec(all.text)?.[1].replace(/,/g, "")) === sum)) zoneProblems.push(`${zone.label}: ${all?.text ?? "no Todo row"} (sum ${sum})`);
      if (own.length === 1 && all) zoneProblems.push(`${zone.label}: a Todo row for one place`);
    }
    t.check(shown.length > 0 && shown.every((zone) => zone.label), `places are grouped by zone (${shown.map((zone) => `${zone.label}: ${zone.rows.map((r) => r.text).join(", ")}`).join(" | ")})`);
    t.check(!zoneProblems.length, `zones of two places or more start with "Todo …" and their sum${zoneProblems.length ? `; ${zoneProblems.join("; ")}` : ""}`);
    await block.scrollIntoViewIfNeeded();
    await t.shot(page, "ubicacion");
    // The phone sheet lists the same places.
    const phone = await t.page({ phone: true });
    await t.goto(phone, "/listados");
    await a.settled(phone);
    await phone.getByRole("button", { name: /^Filtrar/ }).click();
    const dialog = phone.getByRole("dialog", { name: "Filtros" });
    await dialog.waitFor();
    await dialog.getByRole("button", { name: /^Ubicación/ }).click();
    await phone.waitForTimeout(800);
    const panelId = await dialog.getByRole("button", { name: /^Ubicación/ }).getAttribute("aria-controls");
    const section = phone.locator(`[id='${panelId}']`);
    const labels = (await section.locator("label").allInnerTexts()).map((text) => text.replace(/\s+/g, " ").replace(/\sresultados?$/, "").trim()).filter(Boolean);
    const sheetCities = labels.filter((text) => !/^Todo /.test(text)).map((text) => ({ city: text.replace(/\s[\d,]+$/, ""), count: Number(/([\d,]+)$/.exec(text)?.[1].replace(/,/g, "")) }));
    const sheetZones = labels.filter((text) => /^Todo /.test(text));
    const deskZones = shown.flatMap((zone) => zone.rows.filter((row) => row.id.startsWith("filtro-zona-")).map((row) => row.text.replace(/\sresultados$/, "")));
    t.check(a.sameSet(sheetCities.map((c) => c.city), cities.map((c) => c.city)) && sheetCities.every((c) => c.count === cities.find((x) => x.city === c.city)?.count),
      `the phone sheet lists the same places with counts (${sheetCities.map((c) => `${c.city} ${c.count}`).join(", ")})`);
    t.check(a.sameSet(sheetZones, deskZones), `and each zone's "Todo …" above them (${sheetZones.join(", ")}; the sheet has no zone headings)`);
    await section.scrollIntoViewIfNeeded();
    await t.shot(phone, "sheet");
  },
});

cases.push({
  id: "EASE-012",
  live: true,
  run: async (t) => {
    const page = await t.page();
    if (!t.live) {
      const owner = t.account({ kind: "store_owner" });
      const shop = t.store(owner, { verified: true, district: "Barranco", name: `Barranco Sonido ${t.tag().slice(-4)}` });
      const unique = a.word("zb");
      const listing = t.listing(owner, { storeRow: shop, title: `Fender Telecaster ${unique}`, model: "Telecaster", price: 3200 });
      await t.goto(page, `/listados?q=${unique}`);
      await a.settled(page);
      const [card] = await a.resultCards(page);
      t.check(card?.slug === listing.slug && /Barranco, Lima · Tienda verificada/.test(card.text), `the store listing's card reads "${card?.text}"`);
      await t.shot(page, "card");
      await t.goto(page, `/listados?q=${encodeURIComponent(t.sql(`select title from public.listings where store_id = ${t.literal(t.demo.storeId)} and status = 'approved' limit 1`)[0]?.title || "Yamaha")}`);
      await a.settled(page);
      const demo = (await a.resultCards(page)).find((c) => /Tienda verificada/.test(c.text));
      t.check(demo && /Miraflores, Lima/.test(demo.text), `a demo store card reads "${demo?.text}"`);
      return;
    }
    await t.goto(page, "/listados?seller_type=store");
    await a.settled(page);
    const cards = (await a.resultCards(page)).slice(0, 6);
    let compared = 0;
    for (const card of cards) {
      const listing = await t.page();
      await t.goto(listing, `/instrumentos/${card.slug}`);
      // The seller card's place line ("Miraflores, Lima"): the first element whose own text is "<district>, <city>".
      const place = await listing.locator("#vendedor").evaluate((root) => {
        for (const el of root.querySelectorAll("p, span, div, li")) {
          const text = el.innerText.replace(/\s+/g, " ").trim();
          if ([...el.children].every((child) => !child.children.length) && /^[\p{L} .'-]+, [\p{L} .'-]+$/u.test(text)) return text;
        }
        return null;
      }).catch(() => null);
      await listing.context().close();
      if (!place || place.split(", ")[0] === place.split(", ")[1]) continue;
      compared += 1;
      t.check(card.text.includes(place), `${card.slug}: the card shows the store's district and city (${place}): "${card.text}"`);
      if (compared >= 2) break;
    }
    if (!compared) t.skip("no store on the first page shows a district");
  },
});

// ------------------------------------------------------------------ FIND 06: no link leads to an empty page
cases.push({
  id: "EASE-013",
  live: true,
  timeout: 420_000,
  run: async (t) => {
    const page = await t.page();
    await t.goto(page, "/listados");
    const all = await a.facets(page);
    const counts = all.category || {};
    const perCategory = {};
    const facetsOf = async (key) => (perCategory[key] ??= (counts[key] || 0) > 0 ? await a.facets(page, `category=${key}`) : null);
    const buttons = await page.locator("button[aria-controls^='categoria-']").evaluateAll((items) => items.map((b) => ({ key: b.getAttribute("aria-controls").replace(/^categoria-/, ""), label: b.innerText.trim() })));
    const landing = {};
    const emptyTypes = [];
    const emptyBrands = [];
    let typeLinks = 0;
    let brandLinks = 0;
    for (const button of buttons) {
      const key = button.key.replace(/-/g, "_");
      await page.locator(`button[aria-controls='categoria-${button.key}']`).click();
      const panel = page.locator(`#categoria-${button.key}`);
      await panel.waitFor();
      const links = await panel.locator("a").evaluateAll((items) => items.map((l) => ({ text: l.innerText.trim(), href: l.getAttribute("href") })));
      landing[key] = links.find((l) => l.text === "Ver todos")?.href;
      const per = await facetsOf(key);
      for (const link of links) {
        const p = a.params(link.href);
        if (link.text === "Ver todos" || link.text === "Ver todas las marcas" || p.category !== key && link.href !== landing[key]) continue;
        if (p.brand) {
          brandLinks += 1;
          const n = per?.brands?.find((b) => b.brand.toLowerCase() === p.brand.toLowerCase())?.count || 0;
          if (n === 0) emptyBrands.push(`${button.label} › ${link.text}`);
        } else if (p.instrument_type && Object.keys(p).length === 2) {
          typeLinks += 1;
          const n = per?.instrument_type?.[p.instrument_type] || 0;
          if (n === 0) emptyTypes.push(`${button.label} › ${link.text} (${link.href})`);
        } else if (link.href === landing[key] && link.text !== "Ver todos") {
          typeLinks += 1;
          if (!(counts[key] > 0)) emptyTypes.push(`${button.label} › ${link.text} (${link.href})`);
        }
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
    }
    await page.locator("button[aria-controls='categoria-guitars']").click();
    await t.shot(page, "menu-guitars");
    await page.keyboard.press("Escape");

    // The home's "Categorías" panel (it replaces the strip on the home): every category and type link it offers.
    await t.goto(page, "/");
    await page.getByRole("button", { name: "Categorías", exact: true }).click();
    await page.locator("#menu-categorias").waitFor();
    const homeLinks = await page.locator("#menu-categorias a").evaluateAll((items) => items.map((l) => ({ text: l.innerText.trim(), href: l.getAttribute("href") })));
    const homeEmpty = [];
    for (const link of homeLinks) {
      const p = a.params(link.href);
      const landingKey = Object.keys(landing).find((key) => landing[key] === link.href);
      if (landingKey) {
        if (!(counts[landingKey] > 0)) homeEmpty.push(`${link.text} (${link.href})`);
      } else if (p.category && p.instrument_type) {
        const per = await facetsOf(p.category);
        if (!(per?.instrument_type?.[p.instrument_type] > 0)) homeEmpty.push(`${link.text} (${link.href})`);
      }
    }
    await t.shot(page, "home-menu");
    await page.keyboard.press("Escape");
    t.note(`home Categorías panel: ${homeLinks.length} links`);
    const emptyCategories = Object.keys(landing).filter((key) => !(counts[key] > 0));
    t.check(brandLinks > 0 && emptyBrands.length === 0, `the menus' ${brandLinks} brand links each have listings${emptyBrands.length ? `; empty: ${emptyBrands.join(", ")}` : ""}`);
    t.check(emptyTypes.length === 0, `the menus' ${typeLinks} type links each have listings${emptyTypes.length ? `; empty: ${emptyTypes.join(", ")}` : ""}`);
    t.check(homeEmpty.length === 0, `the home's Categorías panel links each have listings${homeEmpty.length ? `; empty: ${homeEmpty.join(", ")}` : ""}`);

    // The home hides empty categories.
    const chips = await page.locator("nav[aria-labelledby='categorias-titulo'] a").evaluateAll((items) => items.map((l) => ({ text: l.innerText.trim(), href: l.getAttribute("href") })));
    const chipKeys = chips.map((chip) => Object.keys(landing).find((key) => landing[key] === chip.href)).filter(Boolean);
    const withListings = Object.keys(landing).filter((key) => counts[key] > 0);
    if (!emptyCategories.length) t.note("no empty category on this catalog; the hiding was not shown");
    t.check(chipKeys.every((key) => counts[key] > 0) && withListings.every((key) => chipKeys.includes(key)),
      `the home's category chips are the ${withListings.length} categories with listings (${chips.map((c) => c.text).join(", ")}; empty: ${emptyCategories.join(", ") || "none"})`);
    await page.locator("nav[aria-labelledby='categorias-titulo']").screenshot({ path: `${t.OUT}/EASE-013-home-chips.png` }).catch(() => {});

    // Landings: type chips, "Otras categorías", brands and the "Explora" type links.
    const landingProblems = [];
    for (const key of withListings) {
      await t.goto(page, landing[key]);
      const per = await a.facets(page, `category=${key}`);
      const typeChips = await page.locator("ul[aria-label='Tipos'] a").evaluateAll((items) => items.map((l) => ({ text: l.innerText.replace(/\s+/g, " ").trim(), href: l.getAttribute("href") })));
      for (const chip of typeChips) {
        const p = a.params(chip.href);
        const n = p.instrument_type ? per.instrument_type?.[p.instrument_type] || 0 : counts[key];
        if (!(n > 0)) landingProblems.push(`${landing[key]} Tipos › ${chip.text}`);
      }
      const others = await page.locator("section[aria-labelledby='otras-categorias'] a").evaluateAll((items) => items.map((l) => ({ text: l.innerText.trim(), href: l.getAttribute("href") })));
      for (const other of others) {
        const otherKey = Object.keys(landing).find((k) => landing[k] === other.href);
        if (!(counts[otherKey] > 0)) landingProblems.push(`${landing[key]} Otras categorías › ${other.text}`);
      }
      const brands = await page.locator("ul[aria-label^='Marcas de'] a").evaluateAll((items) => items.map((l) => ({ text: l.innerText.replace(/\s+/g, " ").trim(), href: l.getAttribute("href") })));
      for (const brand of brands) {
        const name = a.params(brand.href).brand;
        const n = per.brands?.find((b) => b.brand.toLowerCase() === name?.toLowerCase())?.count || 0;
        if (!(n > 0)) landingProblems.push(`${landing[key]} Marcas › ${brand.text}`);
      }
      const explore = await page.locator("section[aria-labelledby='explora'] h3 a").evaluateAll((items) => items.map((l) => ({ text: l.innerText.trim(), href: l.getAttribute("href") })));
      for (const link of explore) {
        const p = a.params(link.href);
        if (p.instrument_type && !(per.instrument_type?.[p.instrument_type] > 0)) landingProblems.push(`${landing[key]} Explora › ${link.text}`);
      }
      t.note(`${landing[key]}: ${typeChips.length} type chips, ${others.length} other categories, ${brands.length} brands, ${explore.length} Explora type links`);
    }
    t.check(!landingProblems.length, `landing type chips, other categories, brands and type links each have listings${landingProblems.length ? `; empty: ${landingProblems.join(", ")}` : ""}`);
  },
});

// ------------------------------------------------------------------ FIND 07: counts on filters and on the sheet's button
cases.push({
  id: "EASE-014",
  live: true,
  run: async (t) => {
    let scope = "/listados";
    if (!t.live) {
      const w = a.word("zf");
      const seller = t.account({ kind: "particular" });
      const made = [["Nuevo", 1], ["Usado - con detalles", 2], ["Usado - buen estado", 4]];
      for (const [condition, n] of made) for (let i = 0; i < n; i += 1) t.listing(seller, { title: `Guitarra Yamaha Pacifica ${w} ${i}${condition.length}`, brand: "Yamaha", model: "Pacifica 112V", condition, price: 1100 + i * 50 });
      scope = `/listados?q=${w}`;
    }
    const query = scope.includes("?") ? scope.split("?")[1] : "";
    const page = await t.page({ phone: true });
    await t.goto(page, scope);
    await a.settled(page);
    const total = await a.resultCount(page);
    const data = await a.facets(page, query);
    await page.getByRole("button", { name: /^Filtrar/ }).click();
    const dialog = page.getByRole("dialog", { name: "Filtros" });
    await dialog.waitFor();
    const apply = dialog.getByRole("button", { name: /^(Ver [\d,]+ resultados?|Ver resultados|Sin resultados)$/ }).last();
    const label = async () => (await apply.innerText()).trim();
    const fmt = (n) => n.toLocaleString("en-US");
    // Locally the scope is this check's own listings, so every number is exact. Live, the counts are shared for a minute
    // while the page counts fresh, so a listing published meanwhile may show in one and not yet in the other.
    const near = (n, expected) => (t.live ? Math.abs(n - expected) <= Math.max(3, Math.ceil(expected * 0.1)) : n === expected);
    const number = (text) => Number(/^Ver ([\d,]+) resultados?$/.exec(text)?.[1].replace(/,/g, ""));
    await a.until(async () => /^Ver [\d,]+ resultados?$/.test(await label()), { timeout: 10_000 });
    t.check(near(number(await label()), total), `the sheet's button reads "${await label()}" for ${total} results`);
    // The conditions as the sheet shows them, with their counts.
    const boxes = await dialog.getByRole("checkbox").evaluateAll((items) => items.map((box) => box.closest("label")?.innerText.replace(/\s+/g, " ").replace(/\sresultados?$/, "").trim()));
    const shown = boxes.filter((text) => text && /^(Nuevo|Usado · )/.test(text)).map((text) => ({ label: text.replace(/\s[\d,]+$/, ""), count: Number(/\s([\d,]+)$/.exec(text)?.[1].replace(/,/g, "")) }));
    const fromFacets = (label) => Object.entries(data.condition || {}).find(([value]) => (value === "Nuevo" ? "Nuevo" : value.replace("Usado - ", "Usado · ")) === label)?.[1];
    t.check(shown.length >= 2 && shown.every((c) => Number.isInteger(c.count) && (t.live || c.count === fromFacets(c.label))),
      `each condition shows its count (${shown.map((c) => `${c.label} ${c.count}`).join(" | ")}${t.live ? "" : `; facets: ${shown.map((c) => fromFacets(c.label)).join(", ")}`})`);
    const [first, second] = shown.filter((c) => c.count > 0).sort((x, y) => x.count - y.count);
    if (!second) t.skip("needs two conditions with listings");
    await dialog.getByRole("checkbox", { name: new RegExp(`^${first.label}`) }).check();
    const one = await a.until(async () => (near(number(await label()), first.count) ? label() : null), { timeout: 10_000 });
    t.check(one, `ticking ${first.label} updates the button to "${await label()}" (${first.count})`);
    await dialog.getByRole("checkbox", { name: new RegExp(`^${second.label}`) }).check();
    const sum = first.count + second.count;
    const two = await a.until(async () => (near(number(await label()), sum) ? label() : null), { timeout: 10_000 });
    t.check(two, `ticking ${second.label} too reads "${await label()}" (${sum})`);
    await t.shot(page, "sheet");
    await apply.click();
    await page.waitForURL((url) => url.searchParams.has("condition"), { timeout: 30_000 });
    await a.settled(page);
    const button = number(two || "");
    t.check(near(await a.resultCount(page), button), `the button's number is what the page shows (${await a.resultCount(page)}; the button said ${button})`);
    // Desktop rows show their counts; an option without results is not a link.
    const desk = await t.page();
    await t.goto(desk, scope);
    await a.settled(desk);
    const rows = await desk.locator("section[aria-label='Filtros'] [id^='filtro-condition-']").evaluateAll((items) => items.map((row) => ({ tag: row.tagName, text: row.innerText.replace(/\s+/g, " ").trim() })));
    const options = rows.filter((row) => /^(A|SPAN|LABEL)$/.test(row.tag) && row.text !== "Condición");
    t.check(options.length > 0 && options.every((row) => /[\d,]+( resultados?)?$/.test(row.text)), `desktop rows show counts (${options.map((r) => r.text).join(" | ")})`);
    const zero = Object.entries(data.category || {}).length ? await desk.locator("section[aria-label='Filtros'] span[aria-disabled='true'][id^='filtro-category-']").count() : 0;
    const emptyCategories = ["guitars", "basses", "keyboards", "percussion", "winds", "strings", "pedals", "amplifiers", "microphones", "audio"].filter((key) => !(data.category[key] > 0));
    t.check(zero === emptyCategories.length, `${zero} empty category rows are dimmed, not links (${emptyCategories.join(", ") || "none"})`);
  },
});

module.exports = cases;
