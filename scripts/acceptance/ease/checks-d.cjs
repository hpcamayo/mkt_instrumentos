// Effortless Laria acceptance, group D: stores (EASE-500..532), the Libro de Reclamaciones (EASE-540..549) and
// Inventario (EASE-600..627). Run with scripts/acceptance/ease/run.cjs. Cases marked live only read public pages,
// signed out, and find their data on the page.
"use strict";
const fs = require("node:fs");
const d = require("./d-helpers.cjs");

const L = (value) => (value === null || value === undefined ? "null" : `'${String(value).replace(/'/g, "''")}'`);
const CATEGORY_ORDER = ["guitars", "basses", "keyboards", "percussion", "winds", "strings", "pedals", "amplifiers", "microphones", "audio"];
const TYPE_FOR = { guitars: "electric_guitar", basses: "bass", keyboards: "keyboards", pedals: "pedals", amplifiers: "amplifiers", microphones: "microphones" };

const cases = [];

// ------------------------------------------------------------------ stores directory (find-13)

cases.push({
  id: "EASE-520",
  live: true,
  run: async (t) => {
    let pendingSlug = null;
    let unverified = null;
    if (!t.live) {
      // Precondition: active verified, active unverified and pending stores. The verified ones are the seeds'.
      const ownerU = t.account({ kind: "store_owner" });
      unverified = t.store(ownerU, { verified: false, name: `Zona Sonora ${t.tag().slice(-4)}`, city: "Cusco", district: "Wanchaq" });
      t.listing(ownerU, { storeRow: unverified, title: `Bajo de tienda sin verificar ${t.tag().slice(-4)}`, category: "basses", type: "bass" });
      const ownerP = t.account({ kind: "store_owner" });
      pendingSlug = t.store(ownerP, { status: "pending", verified: false, name: `Tienda en revisión ${t.tag().slice(-4)}`, city: "Piura" }).slug;
    }
    const page = await t.page();
    const response = await t.goto(page, "/tiendas");
    t.check(response.status() === 200, `/tiendas answers 200 (${response.status()})`);
    const cards = await d.directoryCards(page);
    t.check(cards.length > 0, `the directory lists ${cards.length} stores`);
    const bad = cards.filter((card) => !card.name || !(card.img || /^[A-ZÁÉÍÓÚÑ0-9]{1,2}$/.test(card.initials))
      || !/Tienda verificada|Tienda/.test(card.text) || !card.metas.some((meta) => /\d+ publicaci(ón|ones)$/.test(meta)));
    t.check(!bad.length, `every card has a logo or initials, the name, Tienda verificada or Tienda, and N publicaciones${bad.length ? `; not: ${bad.map((c) => c.text).join(" | ")}` : ""}`);
    const verified = cards.map((card) => /Tienda verificada/.test(card.text));
    const firstStore = verified.indexOf(false);
    t.check(firstStore < 0 || verified.slice(firstStore).every((v) => !v), "verified stores come first");
    const verifiedNames = cards.filter((_, i) => verified[i]).map((card) => card.name);
    const otherNames = cards.filter((_, i) => !verified[i]).map((card) => card.name);
    t.check(d.sortedByName(verifiedNames) && d.sortedByName(otherNames), `then by name (${verifiedNames.join(", ")} | ${otherNames.join(", ")})`);
    const withPlace = cards.filter((card) => card.metas.length >= 2);
    t.check(withPlace.length === cards.length, `each card shows the place (${withPlace.length} of ${cards.length})`);
    const starred = cards.filter((card) => /★/.test(card.text));
    t.check(starred.every((card) => /\d,\d ★|\d\.\d ★/.test(card.text) && /reseña/.test(card.text)), `a rating shows only with its reviews (${starred.length} with a rating)`);
    if (!t.live) {
      // The same stores, in the same order, as the database's active stores (Admin's list).
      const rows = d.sqlAsRows(null, "select slug, is_verified, listing_count, review_count from public.get_public_store_directory()");
      const active = t.sql("select slug from public.stores where status = 'active'").map((row) => row.slug).sort();
      const slugs = cards.map((card) => card.href.replace("/tiendas/", ""));
      t.check(JSON.stringify([...slugs].sort()) === JSON.stringify(active), `every active store is listed (${slugs.length} on the page, ${active.length} active in the database)`);
      t.check(JSON.stringify(slugs) === JSON.stringify(rows.map((row) => row.slug)), "the order is verified first, then by name, as the directory function returns it");
      t.check(!slugs.includes(pendingSlug), `the pending store ${pendingSlug} is absent`);
      const mine = cards.find((card) => card.href === `/tiendas/${unverified.slug}`);
      t.check(mine && /Tienda\b/.test(mine.text) && !/Tienda verificada/.test(mine.text) && /1 publicación/.test(mine.text) && /Wanchaq, Cusco/.test(mine.text),
        `the active unverified store shows Tienda, Wanchaq, Cusco and 1 publicación (${mine?.text})`);
      const counts = rows.every((row) => {
        const card = cards.find((c) => c.href === `/tiendas/${row.slug}`);
        const label = `${row.listing_count} ${Number(row.listing_count) === 1 ? "publicación" : "publicaciones"}`;
        return card && card.text.includes(label) && (Number(row.review_count) > 0) === /★/.test(card.text);
      });
      t.check(counts, "each card's N publicaciones and rating match the database (rating only with visible reviews)");
    }
    await t.shot(page, "directory");
  },
});

cases.push({
  id: "EASE-521",
  live: true,
  run: async (t) => {
    if (!t.live) {
      // Stores in two cities or more (the seeds have Lima and Huancayo; EASE-520 adds Cusco).
      const owner = t.account({ kind: "store_owner" });
      t.store(owner, { verified: true, name: `Arequipa Música ${t.tag().slice(-4)}`, city: "Arequipa", district: "Yanahuara" });
    }
    const page = await t.page({ phone: true });
    await t.goto(page, "/tiendas");
    const nav = page.getByRole("navigation", { name: "Ciudades" });
    if (t.live && (await d.directoryCards(page)).length < 2) t.skip("live: city filtering requires stores in at least two cities; fewer than two stores are public");
    t.check(await nav.isVisible(), "the city chips show");
    const chips = await nav.locator("a").evaluateAll((links) => links.map((a) => ({
      href: a.getAttribute("href"), text: a.innerText.replace(/\s+/g, " ").trim(), current: a.getAttribute("aria-current"), check: Boolean(a.querySelector("svg")),
    })));
    const cards = await d.directoryCards(page);
    const [all, ...cities] = chips;
    const allCount = Number(/^Todas (\d+)$/.exec(all?.text || "")?.[1]);
    t.check(allCount === cards.length && all.current === "page" && all.check, `Todas ${allCount} is chosen (check and aria-current) and counts the ${cards.length} stores`);
    const parsed = cities.map((chip) => ({ ...chip, city: chip.text.replace(/ \d+$/, ""), count: Number(/ (\d+)$/.exec(chip.text)?.[1]) }));
    t.check(parsed.length >= 2 && parsed.reduce((sum, chip) => sum + chip.count, 0) === allCount, `${parsed.length} city chips whose counts add up to ${allCount}: ${parsed.map((c) => c.text).join(", ")}`);
    if (!t.live) {
      const byCity = t.sql("select city, count(*)::int as n from public.stores where status = 'active' group by city order by 2 desc, 1");
      const same = byCity.length === parsed.length && byCity.every((row) => parsed.some((chip) => chip.city === row.city && chip.count === row.n));
      t.check(same, `every city with an active store has a chip with its count (${byCity.map((row) => `${row.city} ${row.n}`).join(", ")})`);
    }
    const target = parsed.find((chip) => chip.count < allCount) ?? parsed[0];
    await nav.getByRole("link", { name: target.text }).click();
    await page.waitForURL((url) => url.searchParams.get("ciudad") === target.city, { timeout: 20_000 });
    await page.waitForLoadState("load");
    const filtered = await d.directoryCards(page);
    t.check(filtered.length === target.count && filtered.every((card) => card.metas.some((meta) => meta.includes(target.city))),
      `/tiendas?ciudad=${target.city} shows only its ${filtered.length} stores (chip says ${target.count})`);
    const after = await nav.locator("a").evaluateAll((links) => links.map((a) => ({ text: a.innerText.replace(/\s+/g, " ").trim(), current: a.getAttribute("aria-current"), check: Boolean(a.querySelector("svg")) })));
    const chosen = after.find((chip) => chip.text === target.text);
    t.check(chosen?.current === "page" && chosen.check && after[0].current === null && !after[0].check, `the ${target.city} chip has the check and aria-current; Todas no longer does`);
    t.check(new RegExp(`${target.count} tiendas? en ${target.city}`).test(await page.locator("#tiendas-estado").innerText()), "the count line names the city");
    await t.shot(page, "city");
    await nav.getByRole("link", { name: /^Todas/ }).click();
    await page.waitForURL((url) => url.pathname === "/tiendas" && !url.searchParams.has("ciudad"), { timeout: 20_000 });
    await page.waitForLoadState("load");
    t.check((await d.directoryCards(page)).length === allCount, "Todas clears the city and lists every store again");
  },
});

cases.push({
  id: "EASE-522",
  live: true,
  run: async (t) => {
    if (!t.live) {
      // Verified stores with more than one page (24) of listings.
      const [{ n }] = t.sql(`select count(*)::int as n from public.listings l join public.stores s on s.id = l.store_id
        where l.status = 'approved' and s.status = 'active' and s.is_verified`);
      if (n < 30) {
        const owner = t.account({ kind: "store_owner" });
        const store = t.store(owner, { verified: true, name: `Pagina Dos Música ${t.tag().slice(-4)}` });
        for (let i = 0; i < 30 - n; i += 1) t.listing(owner, { storeRow: store, title: `Guitarra de vitrina ${i + 1} ${t.tag().slice(-4)}`, photos: 1 });
      }
    }
    const page = await t.page();
    await t.goto(page, "/tiendas");
    const tabs = page.getByRole("navigation", { name: "Vista de tiendas" });
    const storesTab = tabs.getByRole("link", { name: "Tiendas", exact: true });
    const listingsTab = tabs.getByRole("link", { name: "Publicaciones de tiendas verificadas" });
    t.check(await storesTab.getAttribute("href") === "/tiendas" && await listingsTab.getAttribute("href") === "/tiendas?vista=publicaciones",
      "the two tabs are links to /tiendas and /tiendas?vista=publicaciones");
    t.check(await storesTab.getAttribute("aria-current") === "page" && await listingsTab.getAttribute("aria-current") === null, "aria-current=page on Tiendas");
    const boxes = [await storesTab.boundingBox(), await listingsTab.boundingBox()];
    t.check(boxes.every((box) => box && box.height >= 44 && box.width >= 44), `targets of 44 px or more (${boxes.map((b) => `${Math.round(b.width)}×${Math.round(b.height)}`).join(", ")})`);
    // Keyboard: focus moves to the second tab with Tab, Enter follows it.
    await storesTab.focus();
    await page.keyboard.press("Tab");
    t.check(await listingsTab.evaluate((node) => node === document.activeElement), "Tab moves from Tiendas to the second tab");
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => url.searchParams.get("vista") === "publicaciones", { timeout: 20_000 });
    await page.waitForLoadState("load");
    t.check(await listingsTab.getAttribute("aria-current") === "page" && await storesTab.getAttribute("aria-current") === null, "Enter opens the listings tab, now marked aria-current=page");
    const summary = await page.locator("main p.t-meta").filter({ hasText: /publicaci(ón|ones) · Más recientes/ }).first().innerText();
    const total = Number(summary.replace(/\D+/g, " ").trim().split(" ")[0]);
    const cards = page.locator("main a[href^='/instrumentos/']");
    const slugs = [...new Set(await cards.evaluateAll((links) => links.map((a) => a.getAttribute("href").split("?")[0])))];
    t.check(slugs.length === Math.min(24, total), `${slugs.length} listings on page 1 of ${total} (24 a page)`);
    const catalog = page.getByRole("link", { name: "Filtrar por categoría, precio o condición" });
    const catalogHref = await catalog.getAttribute("href");
    t.check(/^\/listados\?.*verified/.test(catalogHref || ""), `a link to the catalog's verified-store filter (${catalogHref})`);
    if (!t.live) {
      const rows = t.sql(`select l.slug from public.listings l join public.stores s on s.id = l.store_id
        where l.slug in (${slugs.map((s) => L(s.replace("/instrumentos/", ""))).join(",")}) and s.is_verified and s.status = 'active' and l.status = 'approved'`);
      t.check(rows.length === slugs.length, `every listing is a verified store's (${rows.length} of ${slugs.length})`);
    }
    await t.shot(page, "listings-tab");
    if (total > 24) {
      const pager = page.getByRole("navigation", { name: /Paginación|Páginas/i });
      const two = pager.getByRole("link", { name: /^(2|Página 2)$/ }).first();
      t.check(await two.count() > 0, "numbered pagination shows page 2");
      await two.click();
      await page.waitForURL((url) => url.searchParams.get("page") === "2" && url.searchParams.get("vista") === "publicaciones", { timeout: 20_000 });
      await page.waitForLoadState("load");
      const second = [...new Set(await cards.evaluateAll((links) => links.map((a) => a.getAttribute("href").split("?")[0])))];
      t.check(second.length === Math.min(24, total - 24) && second.every((slug) => !slugs.includes(slug)), `page 2 shows the next ${second.length} listings`);
    } else {
      t.note(`only ${total} listings: one page, no pagination to follow`);
    }
    // Pointer back to the stores tab.
    await storesTab.click();
    await page.waitForURL((url) => url.pathname === "/tiendas" && !url.search, { timeout: 20_000 });
    t.check(await storesTab.getAttribute("aria-current") === "page", "a click on Tiendas goes back to /tiendas");
  },
});

cases.push({
  id: "EASE-523",
  live: true,
  run: async (t) => {
    const page = await t.page();
    await t.goto(page, "/");
    const headerLink = page.locator("header a[href='/tiendas']").filter({ hasText: "Tiendas verificadas" });
    t.check(await headerLink.first().isVisible(), "the home header links Tiendas verificadas to /tiendas");
    const footerLink = page.locator("footer a[href='/tiendas']").filter({ hasText: "Tiendas verificadas" });
    t.check(await footerLink.count() > 0, "the footer links Tiendas verificadas to /tiendas");
    const verTodas = page.locator("section[aria-labelledby='tiendas-titulo'] a[href='/tiendas']").filter({ hasText: "Ver todas" });
    t.check(await verTodas.count() === 1, "the home's Tiendas verificadas section has Ver todas to /tiendas");
    await page.getByRole("button", { name: "Categorías" }).first().click();
    const panelLink = page.locator("#menu-categorias a[href='/tiendas']").filter({ hasText: "Tiendas verificadas" });
    t.check(await panelLink.first().isVisible(), "the home Categorías panel links Tiendas verificadas to /tiendas");
    await page.keyboard.press("Escape");
    await t.goto(page, "/tiendas");
    const strip = page.locator("a[href='/tiendas'][aria-current='page']").filter({ hasText: "Tiendas verificadas" });
    t.check(await strip.count() > 0, "on /tiendas the strip marks Tiendas verificadas (aria-current=page)");
    const first = (await d.directoryCards(page))[0];
    await t.goto(page, first.href);
    const crumbs = await page.getByRole("navigation", { name: /migas|Ruta|breadcrumb/i }).first().locator("li").allInnerTexts().catch(() => []);
    const trail = crumbs.map((text) => text.replace(/\s+/g, " ").replace(/[/›>]/g, "").trim()).filter(Boolean);
    t.check(trail.length === 3 && trail[0] === "Inicio" && trail[1] === "Tiendas" && trail[2] === first.name, `the store breadcrumb reads ${trail.join(" / ")}`);
    t.check(await page.locator("nav a[href='/tiendas']").filter({ hasText: /^Tiendas$/ }).count() > 0, "its Tiendas crumb links to /tiendas");
    await t.shot(page, "store-breadcrumb");
    if (!t.live) {
      const admin = await t.page({ as: t.demo.admin });
      await t.goto(admin, "/admin");
      const toggle = admin.getByRole("button", { name: "Explorar categorías" }).first();
      await toggle.click();
      t.check(await admin.locator("a[href='/tiendas']").filter({ hasText: "Tiendas verificadas" }).first().isVisible(), "Admin's Explorar categorías accordion links to /tiendas");
    }
  },
});

cases.push({
  id: "EASE-524",
  live: true,
  run: async (t) => {
    const page = await t.page();
    const html = async (route) => {
      const response = await t.goto(page, route);
      return { status: response.status(), ...d.headTags(await response.text()) };
    };
    const plain = await html("/tiendas");
    t.check(plain.status === 200 && /^index/.test(plain.robots || "index") && /\/tiendas$/.test(plain.canonical || ""), `/tiendas: robots ${plain.robots}, canonical ${plain.canonical}`);
    // A city from the page's own chips.
    const city = await page.getByRole("navigation", { name: "Ciudades" }).locator("a").nth(1).getAttribute("href").catch(() => null);
    const variants = [city || "/tiendas?ciudad=Lima", "/tiendas?vista=publicaciones", "/tiendas?vista=publicaciones&page=2"];
    for (const route of variants) {
      const tags = await html(route);
      t.check(tags.robots === "noindex, follow" && tags.canonical === null, `${route}: robots ${tags.robots}, canonical ${tags.canonical ?? "none"}`);
    }
    const sitemap = await page.request.get(t.url("/sitemap.xml"));
    const xml = await sitemap.text();
    t.check(sitemap.status() === 200 && /<loc>[^<]*\/tiendas<\/loc>/.test(xml), "/sitemap.xml lists /tiendas");
    t.check(!/<loc>[^<]*\/tiendas\?/.test(xml), "and none of its filtered URLs");
  },
});

// ------------------------------------------------------------------ the store page's own filters (find-14)

// A store with listings in two categories and several brands and prices, one out of stock.
function filterStore(t) {
  const { owner, store } = d.inventoryStore({ verified: true, name: `Filtros Música ${t.tag().slice(-4)}` });
  const made = [];
  const add = (category, brand, price, n) => {
    for (let i = 0; i < n; i += 1) {
      made.push(t.listing(owner, { storeRow: store, category, type: TYPE_FOR[category], brand, model: `M${i}`, title: `${brand} ${category} ${i + 1} ${t.tag().slice(-4)}`, price: price + i, photos: 1, publishedDaysAgo: i % 5 }));
    }
  };
  add("guitars", "Fender", 1500, 20);
  add("guitars", "Ibanez", 900, 6);
  add("pedals", "Boss", 300, 3);
  // The cheapest Boss pedal is out of stock: its SKU is at zero.
  const cheapest = made[made.length - 3];
  d.sku(owner, { merchant_sku: "AGO-1", product_name: "Pedal agotado", listing_id: cheapest.id, unit_price_pen: 300 }, 0);
  return { owner, store, made, outOfStock: cheapest };
}

cases.push({
  id: "EASE-525",
  live: true,
  run: async (t) => {
    let slug;
    if (!t.live) {
      slug = filterStore(t).store.slug;
    } else {
      // Find a store page with category chips from the directory.
      const probe = await t.page();
      await t.goto(probe, "/tiendas");
      const cards = (await d.directoryCards(probe)).sort((a, b) => Number(/(\d+) publicaci/.exec(b.text)?.[1] || 0) - Number(/(\d+) publicaci/.exec(a.text)?.[1] || 0));
      for (const card of cards.slice(0, 4)) {
        await t.goto(probe, card.href);
        if (await probe.getByRole("navigation", { name: "Categorías de la tienda" }).count()) { slug = card.href.replace("/tiendas/", ""); break; }
      }
      if (!slug) t.skip("no store on the site has listings in two categories");
    }
    const page = await t.page();
    await t.goto(page, `/tiendas/${slug}`);
    const nav = page.getByRole("navigation", { name: "Categorías de la tienda" });
    t.check(await nav.isVisible(), "the store page shows its category chips");
    const chips = await nav.locator("a").evaluateAll((links) => links.map((a) => ({
      href: a.getAttribute("href"), text: a.innerText.replace(/\s+/g, " ").trim(), current: a.getAttribute("aria-current"),
    })));
    const [all, ...rest] = chips;
    const categories = rest.map((chip) => ({ ...chip, value: new URL(chip.href, t.base).searchParams.get("category"), count: Number(/ (\d+)$/.exec(chip.text)?.[1]) }));
    const order = categories.map((chip) => CATEGORY_ORDER.indexOf(chip.value));
    t.check(order.every((n, i) => n >= 0 && (i === 0 || order[i - 1] < n)), `chips in taxonomy order: ${categories.map((c) => c.text).join(", ")}`);
    const total = Number(/^Todas (\d+)$/.exec(all.text)?.[1]);
    t.check(categories.reduce((sum, c) => sum + c.count, 0) === total, `the chips' counts add up to Todas ${total}`);
    if (!t.live) {
      const rows = t.sql(`select l.category, count(*)::int as n from public.listings l join public.stores s on s.id = l.store_id
        where s.slug = ${L(slug)} and l.status = 'approved' group by 1`);
      t.check(rows.length === categories.length && rows.every((row) => categories.some((c) => c.value === row.category && c.count === row.n)),
        `only the store's categories, with real counts (${rows.map((r) => `${r.category} ${r.n}`).join(", ")})`);
    }
    const heading = async () => Number((await page.locator("#publicaciones-titulo").innerText()).replace(/\D+/g, ""));
    const grid = () => page.locator("#publicaciones a[href^='/instrumentos/']").evaluateAll((links) => [...new Set(links.map((a) => a.getAttribute("href").split("?")[0]))]);
    t.check((await grid()).length === Math.min(24, total), `the unfiltered grid shows ${Math.min(24, total)} (24 a page)`);
    const big = categories.reduce((a, b) => (b.count > a.count ? b : a));
    await nav.getByRole("link", { name: big.text }).click();
    await page.waitForURL((url) => url.searchParams.get("category") === big.value, { timeout: 20_000 });
    await page.waitForLoadState("load");
    const shown = await grid();
    t.check(await heading() === big.count && shown.length === Math.min(24, big.count), `choosing ${big.text} narrows the grid to ${shown.length} of ${big.count}, in the URL (?category=${big.value})`);
    const chosen = nav.getByRole("link", { name: new RegExp(`^${big.text.replace(/ \d+$/, "")}`) });
    t.check(await chosen.getAttribute("aria-current") === "true", "the chosen chip is marked");
    await t.shot(page, "category");
    if (big.count > 24) {
      const pager = page.getByRole("navigation", { name: /Paginación|Páginas/i });
      await pager.getByRole("link", { name: /^(2|Página 2)$/ }).first().click();
      await page.waitForURL((url) => url.searchParams.get("page") === "2" && url.searchParams.get("category") === big.value, { timeout: 20_000 });
      await page.waitForLoadState("load");
      t.check((await grid()).length === big.count - 24, `page 2 keeps the category and shows the other ${big.count - 24}`);
    } else {
      t.note(`the biggest category has ${big.count} listings: one page`);
    }
  },
});

cases.push({
  id: "EASE-526",
  live: true,
  run: async (t) => {
    let slug;
    let brand = "Boss";
    let outOfStock = null;
    if (!t.live) {
      const made = filterStore(t);
      slug = made.store.slug;
      outOfStock = made.outOfStock.slug;
    } else {
      const probe = await t.page();
      await t.goto(probe, "/tiendas");
      const card = (await d.directoryCards(probe)).sort((a, b) => Number(/(\d+) publicaci/.exec(b.text)?.[1] || 0) - Number(/(\d+) publicaci/.exec(a.text)?.[1] || 0))[0];
      if (!card) t.skip("no store on the site");
      slug = card.href.replace("/tiendas/", "");
      await t.goto(probe, card.href);
      const titles = await probe.locator("#publicaciones h3").allInnerTexts();
      brand = titles[0]?.split(/\s+/)[0];
      if (!brand) t.skip("the store has no listings");
    }
    const base = `/tiendas/${slug}`;
    for (const javaScript of [true, false]) {
      const label = javaScript ? "with JavaScript" : "without JavaScript";
      const page = await t.page({ javaScript });
      await t.goto(page, base);
      const box = page.locator("#tienda-marca");
      await box.fill(brand);
      await page.locator("#tienda-marca-aplicar").click();
      await page.waitForURL((url) => url.searchParams.get("brand") === brand, { timeout: 20_000 });
      await page.waitForLoadState("load");
      const titles = await page.locator("#publicaciones h3").allInnerTexts();
      t.check(titles.length > 0 && titles.every((title) => title.toLowerCase().includes(brand.toLowerCase()) || !t.live), `${label}: the brand box finds ${titles.length} ${brand} listings in the store`);
      const applied = page.getByRole("link", { name: new RegExp(`Quitar filtro: Marca: ${brand}`, "i") });
      t.check(await applied.count() === 1 && await page.getByRole("link", { name: "Limpiar todo" }).count() === 1, `${label}: the brand shows as a removable chip with Limpiar todo`);
      const { robots } = d.headTags(await page.content());
      t.check(robots === "noindex, follow", `${label}: the filtered URL is ${robots}`);
      // Sort by price: the desktop menu.
      const sortButton = page.locator("#orden-boton");
      await sortButton.click();
      const option = page.getByRole("link", { name: "Menor precio" });
      const opened = await option.first().isVisible().catch(() => false);
      t.check(opened, `${label}: the sort menu opens${opened ? "" : " (Ordenar: Más recientes does nothing; no sort links in the page)"}`);
      if (!opened) {
        // What the server does with a sort in the URL, which no control on the page offers without JavaScript.
        await t.goto(page, `${base}?brand=${encodeURIComponent(brand)}&sort=price_asc`);
        t.note(`${label}: ?sort=price_asc typed in the address bar is applied by the server (${(await page.locator("#publicaciones h3").allInnerTexts()).length} listings)`);
      }
      if (opened) {
        await option.first().click();
        await page.waitForURL((url) => url.searchParams.get("sort") === "price_asc", { timeout: 20_000 });
        await page.waitForLoadState("load");
        t.check(new URL(page.url()).searchParams.get("brand") === brand, `${label}: sorting keeps the brand (${page.url().replace(t.base, "")})`);
        if (!t.live) {
          const order = t.sql(`select l.slug, l.price_pen, l.stock_state from public.listings l join public.stores s on s.id = l.store_id
            where s.slug = ${L(slug)} and l.status = 'approved' and l.brand ilike ${L(`%${brand}%`)}`);
          const hrefs = await page.locator("#publicaciones a[href^='/instrumentos/']").evaluateAll((links) => [...new Set(links.map((a) => a.getAttribute("href").split("?")[0].replace("/instrumentos/", "")))]);
          const rows = hrefs.map((s) => order.find((row) => row.slug === s));
          const inStock = rows.filter((row) => row.stock_state !== "out_of_stock");
          const lastIsOut = rows.length && rows[rows.length - 1].slug === outOfStock;
          t.check(inStock.every((row, i) => i === 0 || inStock[i - 1].price_pen <= row.price_pen), `${label}: in-stock listings by lowest price (${rows.map((r) => r.price_pen).join(", ")})`);
          t.check(lastIsOut, `${label}: the out-of-stock listing stays last though it is cheaper than others`);
        }
      }
      if (!javaScript) await t.shot(page, "no-js-filtered");
      // Remove the chips: Limpiar todo.
      await page.getByRole("link", { name: "Limpiar todo" }).click();
      await page.waitForURL((url) => !url.searchParams.has("brand"), { timeout: 20_000 });
      t.check(!new URL(page.url()).searchParams.has("brand"), `${label}: Limpiar todo removes the brand (${page.url().replace(t.base, "")})`);
      // A brand the store does not have.
      await t.goto(page, `${base}?brand=zzqx`);
      t.check(await page.getByText("No encontramos publicaciones con esos filtros").isVisible() && await page.getByRole("link", { name: "Ver todas sus publicaciones" }).isVisible(),
        `${label}: no results shows Ver todas sus publicaciones`);
    }
    // Phones: the sort is a sheet (and without JavaScript the button does nothing either).
    const phoneNoJs = await t.page({ phone: true, javaScript: false });
    await t.goto(phoneNoJs, base);
    await phoneNoJs.locator("#orden-boton-movil").click();
    t.check(await phoneNoJs.getByRole("link", { name: "Menor precio", exact: true }).isVisible(), "on a phone without JavaScript, sort links remain available");
    await t.shot(phoneNoJs, "phone-no-js-sort");
    const phone = await t.page({ phone: true });
    await t.goto(phone, base);
    await phone.locator("#orden-boton-movil").click();
    const sheet = phone.getByRole("dialog", { name: "Ordenar" });
    t.check(await sheet.isVisible(), "on a phone, Ordenar opens a sheet");
    await sheet.getByRole("link", { name: "Mayor precio" }).click();
    await phone.waitForURL((url) => url.searchParams.get("sort") === "price_desc", { timeout: 20_000 });
    t.check(true, "the sheet's choice applies at once (?sort=price_desc)");
    await t.shot(phone, "phone-sorted");
  },
});

// ------------------------------------------------------------------ where the store is, and when it opens (list-12)

cases.push({
  id: "EASE-527",
  run: async (t) => {
    const owner = t.account({ kind: "store_owner" });
    const address = `Jr. Ica ${4000 + Math.floor(Math.random() * 999)}`;
    const store = t.store(owner, { verified: true, name: `Visita Música ${t.tag().slice(-4)}`, address, district: "Cercado de Lima", city: "Lima" });
    const listing = t.listing(owner, { storeRow: store, title: `Guitarra para probar en tienda ${t.tag().slice(-4)}` });
    const own = await t.page({ as: owner.email });
    await t.goto(own, "/mi-cuenta/tienda");
    const show = own.getByLabel("Mostrar mi dirección en la página de la tienda");
    t.check(!(await show.isChecked()), "Mostrar mi dirección starts unticked");
    await show.check();
    await own.getByLabel("Horario de atención").fill("Lun a sáb de 10:00 a 19:00\nDomingos cerrado");
    await own.getByRole("button", { name: "Guardar datos de la tienda" }).click();
    await own.getByText(/Guardamos|guardados|actualizad/i).first().waitFor({ timeout: 20_000 }).catch(() => {});
    const [row] = await d.until(() => {
      const rows = t.sql(`select show_address, opening_hours, public_address from public.stores where id = ${L(store.id)}`);
      return rows[0]?.show_address ? rows : null;
    });
    t.check(row?.show_address && row.public_address === address && row.opening_hours === "Lun a sáb de 10:00 a 19:00\nDomingos cerrado",
      `the owner's save stores show_address, the hours and the public address (${JSON.stringify(row)})`);
    await t.shot(own, "mi-tienda");
    const visitor = await t.page();
    await t.goto(visitor, `/tiendas/${store.slug}`);
    const maps = visitor.getByRole("link", { name: /Cómo llegar/ });
    const links = await maps.evaluateAll((nodes) => nodes.map((a) => ({ href: a.href, target: a.target, rel: a.rel })));
    t.check(links.length === 2, `the store page has Cómo llegar in the header and in Sobre la tienda (${links.length})`);
    t.check(links.length > 0 && links.every((link) => link.href.startsWith("https://www.google.com/maps/search/?api=1&query=")
      && new URL(link.href).searchParams.get("query").includes(address) && link.target === "_blank" && link.rel === "noopener noreferrer"),
    `each opens a Google Maps search for the address in a new tab with rel=noopener noreferrer (${links[0]?.href})`);
    const header = visitor.locator("section").filter({ has: visitor.locator("h1") }).first();
    const headerText = await header.innerText();
    t.check(headerText.includes(address) && await header.getByRole("link", { name: /Cómo llegar/ }).count() === 1
      && headerText.includes("Lun a sáb de 10:00 a 19:00\nDomingos cerrado"), "the header shows the address, Cómo llegar and the hours with their line break");
    const about = visitor.locator("#sobre-la-tienda");
    const aboutText = await about.innerText();
    t.check(aboutText.includes(address) && aboutText.includes("Lun a sáb de 10:00 a 19:00\nDomingos cerrado") && await about.getByRole("link", { name: /Cómo llegar/ }).count() === 1,
      "Sobre la tienda shows the address with Cómo llegar and the opening hours");
    await t.shot(visitor, "store-page", { fullPage: true });
    await t.goto(visitor, listing.path);
    const card = visitor.locator("#vendedor");
    const cardText = await card.innerText();
    const cardMaps = card.getByRole("link", { name: /Cómo llegar/ });
    t.check(cardText.includes(address), "the listing's seller card shows the store's address");
    t.check(await cardMaps.count() === 1 && await cardMaps.getAttribute("target") === "_blank" && await cardMaps.getAttribute("rel") === "noopener noreferrer",
      "with Cómo llegar in a new tab (noopener noreferrer)");
    t.check(cardText.includes("Lun a sáb de 10:00 a 19:00"), "and the opening hours");
    await card.scrollIntoViewIfNeeded();
    await t.shot(visitor, "listing-seller-card");
  },
});

cases.push({
  id: "EASE-528",
  run: async (t) => {
    const owner = t.account({ kind: "store_owner" });
    const address = `Jr. Reservado ${5000 + Math.floor(Math.random() * 999)}`;
    const store = t.store(owner, { verified: true, name: `Discreta Música ${t.tag().slice(-4)}`, address, showAddress: false });
    const listing = t.listing(owner, { storeRow: store, title: `Teclado de tienda discreta ${t.tag().slice(-4)}`, category: "keyboards", type: "keyboards" });
    // Every active store that has not agreed to show its street.
    const hidden = t.sql("select slug, address from public.stores where status = 'active' and not show_address and address is not null and length(address) > 5")
      .map((row) => row.address);
    t.check(hidden.includes(address), `${hidden.length} active stores keep their address private, the new one included`);
    const page = await t.page();
    const leaks = [];
    const [other] = t.sql(`select s.slug, (select l.slug from public.listings l where l.store_id = s.id and l.status = 'approved' order by l.published_at desc limit 1) as listing
      from public.stores s where s.status = 'active' and not s.show_address and s.id <> ${L(store.id)}
      and exists (select 1 from public.listings l where l.store_id = s.id and l.status = 'approved') order by s.created_at limit 1`);
    const routes = [`/tiendas/${store.slug}`, listing.path, "/tiendas", "/", ...(other ? [`/tiendas/${other.slug}`, `/instrumentos/${other.listing}`] : [])];
    for (const route of routes) {
      const response = await t.goto(page, route);
      const source = await response.text();
      const rendered = await page.content();
      const found = hidden.filter((value) => source.includes(value) || rendered.includes(value));
      const mapsLink = /google\.com\/maps|Cómo llegar/.test(/^\/(tiendas|instrumentos)\/[^/]+$/.test(route) ? source + rendered : "");
      t.check(response.status() === 200 && !found.length && !mapsLink, `${route}: no private address in the HTML or the page data${found.length ? ` (found ${found.join(", ")})` : ""}${mapsLink ? ", but a map link" : ""}`);
      if (found.length) leaks.push(route);
    }
    // The public read cannot reach the column either.
    const anon = d.sqlAsRows(null, `select public_address from public.stores where id = ${L(store.id)}`);
    t.check(anon.length === 1 && anon[0].public_address === null, "an anonymous read of the store returns no public_address while show_address is off");
    let addressRead = "";
    try {
      d.sqlAsRows(null, `select address from public.stores where id = ${L(store.id)}`);
      addressRead = "allowed";
    } catch (error) {
      if (error instanceof t.LocalOnly || error instanceof t.LiveUnsafe) throw error;
      addressRead = /permission denied/.test(String(error.message)) ? "denied" : String(error.message).slice(0, 120);
    }
    t.check(addressRead === "denied", `the raw address column is closed to anonymous reads (${addressRead})`);
  },
});

// ------------------------------------------------------------------ the owner's preview (shop-04)

cases.push({
  id: "EASE-530",
  run: async (t) => {
    const owner = t.account({ kind: "store_owner" });
    const store = t.store(owner, { status: "pending", verified: false, name: `Vista Previa Música ${t.tag().slice(-4)}` });
    const listing = t.listing(owner, { storeRow: store, title: `Amplificador de la vista previa ${t.tag().slice(-4)}`, category: "amplifiers", type: "amplifiers" });
    const eventCount = () => Number(t.sql(`select count(*)::int as n from public.marketplace_events
      where store_id = ${L(store.id)} or listing_id = ${L(listing.id)}`)[0].n);
    const before = eventCount();
    const page = await t.page({ as: owner.email });
    const posts = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/api/events") posts.push(...(JSON.parse(request.postData() || "{}").events || []).map((event) => event.type));
    });
    const response = await t.goto(page, `/tiendas/${store.slug}`);
    t.check(response.status() === 200, `the owner opens /tiendas/${store.slug} while it is in review (${response.status()})`);
    const notice = page.getByRole("status").filter({ hasText: "Vista previa: solo tú ves esta página" });
    t.check(await notice.isVisible() && /Será pública cuando Laria apruebe tu tienda\./.test(await notice.innerText()), "the notice says Vista previa and when the page becomes public");
    const edit = notice.getByRole("link", { name: "Editar perfil" });
    t.check(await edit.getAttribute("href") === "/mi-cuenta/tienda", "with Editar perfil to /mi-cuenta/tienda");
    t.check(await page.getByRole("link", { name: listing.title }).count() > 0, "the preview shows the owner's listing");
    const inert = page.locator("span[aria-disabled='true']").filter({ hasText: "Contactar por WhatsApp" });
    t.check(await inert.count() === 1 && await page.locator("main a[href*='wa.me'], main a[href*='whatsapp']").count() === 0, "the contact button is inert (no WhatsApp link)");
    t.check(await page.getByText("En la vista previa este botón no abre WhatsApp").isVisible(), "and says it does not open WhatsApp in the preview");
    t.check(await page.locator("[data-report]").count() === 0 && await page.getByRole("button", { name: /Reportar/ }).count() === 0
      && await page.getByRole("link", { name: /Reportar/ }).count() === 0, "there is no report link");
    const { robots } = d.headTags(await response.text());
    t.check(/noindex/.test(robots || ""), `the preview is ${robots}`);
    await t.shot(page, "pending-preview", { fullPage: true });
    await page.reload({ waitUntil: "load" });
    await t.sleep(3000);
    t.check(eventCount() === before && !posts.includes("store_view"), `opening the preview twice sent no store visit and recorded nothing (events sent: ${posts.join(", ") || "none"})`);
    for (const [status, text] of [["rejected", "Laria no aprobó tu solicitud"], ["hidden", "Laria ocultó tu tienda"]]) {
      t.exec(`select set_config('app.allow_store_admin_fields', 'true', true); update public.stores set status = ${L(status)}${status === "rejected" ? ", rejection_reason = 'El RUC no coincide con la razón social.'" : ""} where id = ${L(store.id)}`);
      const again = await t.goto(page, `/tiendas/${store.slug}`);
      const shown = page.getByRole("status").filter({ hasText: "Vista previa: solo tú ves esta página" });
      t.check(again.status() === 200 && await shown.isVisible() && (await shown.innerText()).includes(text)
        && /noindex/.test(d.headTags(await again.text()).robots || ""), `a ${status} store: the owner still sees the noindex preview, which says “${text}…”`);
      await t.shot(page, `${status}-preview`);
    }
    await t.sleep(2000);
    t.check(eventCount() === before && !posts.includes("store_view"), `no visit was sent or recorded for the rejected or hidden preview either (events sent: ${posts.join(", ") || "none"})`);
    // Control: once the store is public, a visitor's opening is recorded, so the zero above is not a broken recorder.
    t.exec(`select set_config('app.allow_store_admin_fields', 'true', true); update public.stores set status = 'active', rejection_reason = null where id = ${L(store.id)}`);
    const visitor = await t.page();
    await t.goto(visitor, `/tiendas/${store.slug}`);
    const after = await d.until(() => eventCount() > before, { timeout: 15_000 });
    t.check(after, "control: a visitor's opening of the store once it is active is recorded");
  },
});

cases.push({
  id: "EASE-531",
  run: async (t) => {
    const owner = t.account({ kind: "store_owner" });
    const store = t.store(owner, { status: "pending", verified: false, name: `Oculta Música ${t.tag().slice(-4)}` });
    const particular = t.account({ kind: "particular" });
    const otherOwner = t.account({ kind: "store_owner" });
    t.store(otherOwner, { verified: true, name: `Otra Tienda ${t.tag().slice(-4)}` });
    const viewers = [["signed out", null], ["a Particular", particular.email], ["another store owner", otherOwner.email]];
    const pages = [];
    for (const [label, email] of viewers) pages.push([label, await t.page(email ? { as: email } : {})]);
    for (const status of ["pending", "rejected", "hidden"]) {
      t.exec(`select set_config('app.allow_store_admin_fields', 'true', true); update public.stores set status = ${L(status)} where id = ${L(store.id)}`);
      for (const [label, page] of pages) {
        const response = await t.goto(page, `/tiendas/${store.slug}`);
        const text = await page.locator("main").innerText();
        t.check(response.status() === 404 && !text.includes(store.name), `${status}, ${label}: 404 and the store's name is not shown`);
      }
    }
    await t.shot(pages[0][1], "not-found");
    const sitemap = await pages[0][1].request.get(t.url("/sitemap.xml"));
    const xml = await sitemap.text();
    const listed = [...xml.matchAll(/\/tiendas\/([^<]+)<\/loc>/g)].map((match) => match[1]);
    const statuses = t.sql(`select slug, status from public.stores where slug in (${listed.map(L).join(",") || "''"})`);
    t.check(!xml.includes(store.slug) && statuses.length === listed.length && statuses.every((row) => row.status === "active"),
      `the sitemap leaves the slug out and lists active stores only (${listed.length} store URLs)`);
  },
});

cases.push({
  id: "EASE-532",
  run: async (t) => {
    const owner = t.account({ kind: "store_owner" });
    const store = t.store(owner, { verified: true, name: `Mi Propia Tienda ${t.tag().slice(-4)}` });
    t.listing(owner, { storeRow: store, title: `Bajo de la tienda propia ${t.tag().slice(-4)}`, category: "basses", type: "bass" });
    const own = await t.page({ as: owner.email });
    await t.goto(own, `/tiendas/${store.slug}`);
    const note = own.getByRole("note").filter({ hasText: "Esta es tu tienda" });
    t.check(await note.isVisible() && /Así ven tu página los compradores\./.test(await note.innerText()), "the owner sees Esta es tu tienda. Así ven tu página los compradores.");
    t.check(await note.getByRole("link", { name: "Editar perfil" }).getAttribute("href") === "/mi-cuenta/tienda", "with Editar perfil to /mi-cuenta/tienda");
    await t.shot(own, "owner");
    await note.getByRole("link", { name: "Editar perfil" }).click();
    await own.waitForURL((url) => url.pathname === "/mi-cuenta/tienda", { timeout: 20_000 });
    t.check(true, "Editar perfil opens Mi tienda");
    const visitor = await t.page();
    await t.goto(visitor, `/tiendas/${store.slug}`);
    t.check(await visitor.getByText("Esta es tu tienda").count() === 0 && await visitor.getByText("Vista previa").count() === 0, "a signed-out visitor sees no notice");
    const buyer = t.account({ kind: "buyer" });
    const other = await t.page({ as: buyer.email });
    await t.goto(other, `/tiendas/${store.slug}`);
    t.check(await other.getByText("Esta es tu tienda").count() === 0, "another signed-in person sees no notice");
  },
});

// ------------------------------------------------------------------ Libro de Reclamaciones (trust-05)

const SHEET = {
  consumerName: "María Quispe Torres", documentNumber: "45678912", address: "Av. Arequipa 1234, Lince, Lima, Lima", phone: "987654321",
  itemDescription: "Servicio de publicación en Laria", detail: "Mi publicación fue ocultada sin una explicación clara.", request: "Que revisen la decisión y me expliquen el motivo.",
};

async function fillSheet(page, values = {}) {
  const v = { ...SHEET, ...values };
  await page.getByLabel("Nombre completo").fill(v.consumerName);
  await page.getByLabel("Número de documento").fill(v.documentNumber);
  await page.getByLabel("Domicilio", { exact: true }).fill(v.address);
  await page.getByLabel("Teléfono").fill(v.phone);
  await page.getByLabel("Correo electrónico").fill(v.email);
  await page.getByLabel(v.itemType === "producto" ? "Producto" : "Servicio", { exact: true }).check();
  if (v.amount) await page.getByLabel("Monto reclamado en soles").fill(v.amount);
  if (values.itemDescription !== undefined || !(await page.getByLabel("Descripción").inputValue())) await page.getByLabel("Descripción").fill(v.itemDescription);
  await page.getByLabel(/^Reclamo/).check();
  await page.getByLabel("Detalle").fill(v.detail);
  await page.getByLabel("Pedido").fill(v.request);
  await page.getByLabel("Declaro que los datos de esta hoja son verdaderos.").check();
}

const sheetEmail = (t, label) => `lr-${label}-${t.tag()}@example.invalid`;

cases.push({
  id: "EASE-540",
  live: true,
  run: async (t) => {
    const LINK = "a[href='/libro-de-reclamaciones']";
    const shown = (locator) => locator.evaluateAll((links) => links.filter((a) => a.offsetParent !== null && a.textContent.trim() === "Libro de Reclamaciones").length);
    for (const phone of [true, false]) {
      const label = phone ? "390 px" : "1280 px";
      const page = await t.page(phone ? { phone: true } : { width: 1280, height: 900 });
      await t.goto(page, "/");
      const list = phone ? "footer nav[aria-label='Pie de página']" : "footer nav[aria-label='Ayuda y legal']";
      t.check(await shown(page.locator(`${list} ${LINK}`)) === 1, `${label}: the home's full footer (${phone ? "phone list" : "Ayuda y legal column"}) links Libro de Reclamaciones`);
      await page.locator("footer").scrollIntoViewIfNeeded();
      await t.shot(page, `home-footer-${phone ? "390" : "1280"}`);
      await t.goto(page, "/listados");
      const slim = page.locator(`footer nav[aria-label='Ayuda y legal'] ${LINK}`);
      t.check(await shown(slim) === 1, `${label}: the slim footer (catalog) links it too`);
      await slim.click();
      await page.waitForURL((url) => url.pathname === "/libro-de-reclamaciones", { timeout: 20_000 });
      const provider = page.locator("section[aria-labelledby='libro-proveedor']");
      const text = (await provider.innerText()).replace(/\s+/g, " ");
      const pending = text.match(/\[[^\]]*por confirmar\]/g) || [];
      t.check(/Razón social/.test(text) && /RUC/.test(text) && /Domicilio/.test(text) && pending.length === 3,
        `${label}: the page shows the provider block with razón social, RUC and domicilio marked as pending: ${pending.join(" ")}`);
      await t.shot(page, `page-${phone ? "390" : "1280"}`);
    }
  },
});

cases.push({
  id: "EASE-541",
  live: true,
  run: async (t) => {
    const page = await t.page();
    await t.goto(page, "/libro-de-reclamaciones");
    const titles = await page.locator("form[aria-describedby='libro-ayuda'] h2").allInnerTexts();
    const expected = ["1. Identificación del consumidor reclamante", "2. Identificación del bien contratado", "3. Detalle de la reclamación y pedido del consumidor", "4. Información importante"];
    t.check(JSON.stringify(titles.map((x) => x.trim())) === JSON.stringify(expected), `the four sections in order: ${titles.join(" | ")}`);
    const form = (await page.locator("form[aria-describedby='libro-ayuda']").innerText()).replace(/\s+/g, " ");
    t.check(form.includes("Disconformidad relacionada a los productos o servicios."), "reclamo shows its definition");
    t.check(form.includes("Disconformidad no relacionada a los productos o servicios; o malestar o descontento respecto a la atención al público."), "queja shows its definition");
    t.check(form.includes("plazo no mayor a quince (15) días hábiles improrrogables"), "the notes state the 15 días hábiles answer term");
    t.check(form.includes("no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI"), "and that filing does not preclude other channels nor Indecopi");
    t.check(!(await page.getByLabel("Declaro que los datos de esta hoja son verdaderos.").isChecked()), "the declaration starts unticked");
    await t.shot(page, "form", { fullPage: true });
  },
});

cases.push({
  id: "EASE-542",
  run: async (t) => {
    const page = await t.page();
    await t.goto(page, "/libro-de-reclamaciones");
    const email = sheetEmail(t, "a");
    await fillSheet(page, { email, amount: "1500,50", itemType: "producto" });
    await page.getByRole("button", { name: "Enviar hoja de reclamación" }).click();
    const heading = page.locator("#hoja-titulo");
    await heading.waitFor({ timeout: 20_000 });
    const first = /LR-(\d{4})-(\d{6})/.exec(await heading.innerText());
    const year = new Intl.DateTimeFormat("es-PE", { year: "numeric", timeZone: "America/Lima" }).format(new Date());
    t.check(first && first[1] === year, `the page shows Hoja de reclamación N.° ${first?.[0]} (year ${year})`);
    const sheet = (await page.locator("#hoja-libro").innerText()).replace(/\s+/g, " ");
    const now = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Lima" }).format(new Date());
    t.check(sheet.includes(now) && /\d{1,2}:\d{2}/.test(sheet) && sheet.includes("(hora de Lima)"), `with the Lima date and time (${/Fecha de registro: [^(]*/.exec(sheet)?.[0]})`);
    const copied = [SHEET.consumerName, `DNI ${SHEET.documentNumber}`, SHEET.address, SHEET.phone, email, "Producto", "1,500.50", SHEET.itemDescription, SHEET.detail, SHEET.request];
    const missing = copied.filter((value) => !sheet.replace("1 500,50", "1,500.50").replace("1500.50", "1,500.50").includes(value));
    t.check(!missing.length, `and a copy of every field${missing.length ? `; missing ${missing.join(", ")}` : ""}`);
    await t.shot(page, "filed", { fullPage: true });
    // A sheet the database refuses (an empty detail), then another valid one: the numbers stay consecutive.
    let refused = "";
    try {
      d.sqlAsRows(null, `select * from public.submit_complaints_book_entry('Rosa Torres', 'dni', '45678913', 'Jr. Lima 1, Lima', '987654322',
        ${L(sheetEmail(t, "r"))}, false, null, 'servicio', null, 'Servicio', null, 'reclamo', 'corto', 'Revisar', true)`);
      refused = "accepted";
    } catch (error) {
      if (error instanceof t.LocalOnly || error instanceof t.LiveUnsafe) throw error;
      refused = /COMPLAINT_INVALID/.test(String(error.message)) ? "COMPLAINT_INVALID" : String(error.message).slice(0, 160);
    }
    t.check(refused === "COMPLAINT_INVALID", `the database refuses an invalid sheet (${refused})`);
    await page.getByRole("button", { name: "Registrar otra hoja" }).click();
    await fillSheet(page, { email: sheetEmail(t, "b") });
    await page.getByRole("button", { name: "Enviar hoja de reclamación" }).click();
    await heading.waitFor({ timeout: 20_000 });
    const second = /LR-(\d{4})-(\d{6})/.exec(await heading.innerText());
    t.check(second && Number(second[2]) === Number(first[2]) + 1, `the next sheet is ${second?.[0]}: consecutive, no gap after the refused one`);
    const numbers = t.sql(`select sheet_sequence from public.complaints_book_entries where sheet_year = ${Number(year)} order by 1`).map((row) => row.sheet_sequence);
    t.check(numbers.every((n, i) => n === i + 1), `the year's numbers run 1..${numbers.length} with no gaps`);
  },
});

cases.push({
  id: "EASE-543",
  run: async (t) => {
    const user = t.account({ kind: "particular" });
    const page = await t.page({ as: user.email });
    await t.goto(page, "/libro-de-reclamaciones");
    const email = sheetEmail(t, "u");
    await fillSheet(page, { email });
    await page.getByRole("button", { name: "Enviar hoja de reclamación" }).click();
    await page.locator("#hoja-titulo").waitFor({ timeout: 20_000 });
    const number = /LR-\d{4}-\d{6}/.exec(await page.locator("#hoja-titulo").innerText())?.[0];
    const [row] = t.sql(`select user_id, email from public.complaints_book_entries where sheet_number = ${L(number)}`);
    t.check(row && row.user_id === user.id && row.email === email, `${number} is stored with the signed-in user's id`);
    let read = "";
    try {
      d.sqlAsRows(user.id, "select id from public.complaints_book_entries");
      read = "allowed";
    } catch (error) {
      if (error instanceof t.LocalOnly || error instanceof t.LiveUnsafe) throw error;
      read = /permission denied/.test(String(error.message)) ? "permission denied" : String(error.message).slice(0, 120);
    }
    t.check(read === "permission denied", `the user still cannot read the table (${read})`);
  },
});

cases.push({
  id: "EASE-544",
  run: async (t) => {
    const user = t.account({ kind: "particular" });
    const tries = [
      ["anon", null, "select count(*) from public.complaints_book_entries", /permission denied/],
      ["anon", null, "insert into public.complaints_book_entries (sheet_year) values (2026)", /permission denied/],
      ["anon", null, "select count(*) from laria_private.complaints_book_counters", /permission denied/],
      ["anon", null, "select public.get_admin_complaints_book_page()", /permission denied for function/],
      ["anon", null, "select public.answer_complaints_book_entry(gen_random_uuid(), 'Respuesta de prueba')", /permission denied for function/],
      ["a signed-in user", user.id, "select count(*) from public.complaints_book_entries", /permission denied/],
      ["a signed-in user", user.id, "insert into public.complaints_book_entries (sheet_year) values (2026)", /permission denied/],
      ["a signed-in user", user.id, "update public.complaints_book_entries set status = 'answered'", /permission denied/],
      ["a signed-in user", user.id, "select count(*) from laria_private.complaints_book_counters", /permission denied/],
      ["a signed-in user", user.id, "select public.get_admin_complaints_book_page()", /ADMIN_REQUIRED/],
      ["a signed-in user", user.id, "select public.answer_complaints_book_entry(gen_random_uuid(), 'Respuesta de prueba')", /ADMIN_REQUIRED/],
    ];
    for (const [who, id, statement, expected] of tries) {
      const result = d.statementAs(id, statement);
      t.check(!result.ok && expected.test(result.error), `${who}: ${statement.slice(0, 70)} → ${result.error ?? "allowed"}`);
    }
  },
});

cases.push({
  id: "EASE-545",
  run: async (t) => {
    const page = await t.page();
    await t.goto(page, "/libro-de-reclamaciones");
    await page.getByLabel("Soy menor de edad").check();
    await page.getByRole("button", { name: "Enviar hoja de reclamación" }).click();
    const summary = page.locator("[role='alert'][aria-labelledby='libro-errores']");
    await summary.waitFor({ timeout: 10_000 });
    const items = await summary.locator("li").allInnerTexts();
    const expected = ["Nombre completo", "Número de documento", "Domicilio", "Teléfono", "Correo", "padre, madre o apoderado", "producto o un servicio",
      "Descripción", "reclamo o una queja", "Detalle", "Pedido", "Declaración"];
    const text = items.join(" | ");
    const missing = expected.filter((label) => !new RegExp(label, "i").test(text));
    t.check(items.length === expected.length && !missing.length, `an empty sheet lists each field to fix (${items.length}): ${text}${missing.length ? `; missing ${missing.join(", ")}` : ""}`);
    await t.shot(page, "empty-errors");
    // Malformed values: the document by type, the phone, the e-mail, the amount and a length limit.
    await page.getByLabel("Soy menor de edad").uncheck();
    await fillSheet(page, { email: "sin-arroba", documentNumber: "1234", phone: "abc", amount: "1.2.3" });
    await page.getByLabel("Detalle").fill("corto");
    await page.getByRole("button", { name: "Enviar hoja de reclamación" }).click();
    await page.waitForTimeout(500);
    const errors = (await summary.innerText()).replace(/\s+/g, " ");
    t.check(/Número de documento: Revisa el número: 8 dígitos/.test(errors) && /Teléfono: Escribe un teléfono de 6 a 20 dígitos/.test(errors)
      && /Correo electrónico: Escribe un correo válido/.test(errors) && /Monto reclamado en soles[^:]*: Escribe el monto en soles/.test(errors)
      && /Detalle: Usa al menos 10 caracteres/.test(errors) && !/Nombre completo|Declaración|reclamo o una queja/.test(errors),
    `only the malformed values are named: ${errors}`);
    await t.shot(page, "malformed-errors");
    const limits = await page.locator("textarea[name='detail'], textarea[name='request'], input[name='consumerName']").evaluateAll((nodes) => nodes.map((node) => `${node.name} ${node.maxLength}`));
    await page.getByLabel("Detalle").fill("x".repeat(3001));
    const typed = await page.locator("textarea[name='detail']").evaluate((node) => node.value.length);
    t.check(typed === 3000 && limits.includes("detail 3000") && limits.includes("request 2000") && limits.includes("consumerName 160"),
      `the upper limits are the fields' own (${limits.join(", ")}): the detail box stops at ${typed}`);
    await page.getByLabel("Detalle").fill(SHEET.detail);
    // The RUC needs 11 digits; a guardian is asked only for a minor.
    await page.getByLabel("Tipo de documento").selectOption("ruc");
    await page.getByLabel("Número de documento").fill("45678912");
    await page.getByRole("button", { name: "Enviar hoja de reclamación" }).click();
    await page.waitForTimeout(500);
    t.check(/11 dígitos/.test(await summary.innerText()), "a RUC with 8 digits asks for 11");
    const before = Number(t.sql("select coalesce(max(sheet_sequence), 0)::int as n from public.complaints_book_entries")[0].n);
    // The database refuses the same cases and takes no number.
    const refusals = [];
    const calls = {
      declaration: "'María Q', 'dni', '45678912', 'Av. Lima 1, Lima', '987654321', 'x@example.invalid', false, null, 'servicio', null, 'Servicio', null, 'reclamo', 'Detalle suficientemente largo para la hoja.', 'Revisar el caso', false",
      phone: "'María Q', 'dni', '45678912', 'Av. Lima 1, Lima', 'abc', 'x@example.invalid', false, null, 'servicio', null, 'Servicio', null, 'reclamo', 'Detalle suficientemente largo para la hoja.', 'Revisar el caso', true",
      minor: "'María Q', 'dni', '45678912', 'Av. Lima 1, Lima', '987654321', 'x@example.invalid', true, null, 'servicio', null, 'Servicio', null, 'reclamo', 'Detalle suficientemente largo para la hoja.', 'Revisar el caso', true",
      amount: "'María Q', 'dni', '45678912', 'Av. Lima 1, Lima', '987654321', 'x@example.invalid', false, null, 'servicio', -1, 'Servicio', null, 'reclamo', 'Detalle suficientemente largo para la hoja.', 'Revisar el caso', true",
    };
    for (const [name, args] of Object.entries(calls)) {
      try {
        d.sqlAsRows(null, `select * from public.submit_complaints_book_entry(${args})`);
        refusals.push(`${name}: accepted`);
      } catch (error) {
        if (error instanceof t.LocalOnly || error instanceof t.LiveUnsafe) throw error;
        refusals.push(`${name}: ${/COMPLAINT_[A-Z_]+/.exec(String(error.message))?.[0] ?? String(error.message).slice(0, 80)}`);
      }
    }
    t.check(refusals[0] === "declaration: COMPLAINT_DECLARATION_REQUIRED" && refusals.slice(1).every((line) => /COMPLAINT_INVALID$/.test(line)), `the RPC refuses them: ${refusals.join("; ")}`);
    const after = Number(t.sql("select coalesce(max(sheet_sequence), 0)::int as n from public.complaints_book_entries")[0].n);
    t.check(after === before, "and consumes no number");
  },
});

cases.push({
  id: "EASE-546",
  run: async (t) => {
    const page = await t.page();
    await t.goto(page, "/libro-de-reclamaciones");
    await fillSheet(page, { email: sheetEmail(t, "p") });
    await page.getByRole("button", { name: "Enviar hoja de reclamación" }).click();
    await page.locator("#hoja-titulo").waitFor({ timeout: 20_000 });
    const notice = (await page.getByText(/Guarda o imprime esta hoja/).first().innerText()).replace(/\s+/g, " ");
    t.check(/Guarda o imprime esta hoja/.test(notice) && !/enviamos una copia|te enviaremos una copia/i.test(await page.locator("main").innerText()), `the page says “${notice}” and promises no e-mail copy`);
    const print = page.getByRole("button", { name: "Imprimir o guardar como PDF" });
    t.check(await print.isVisible(), "Imprimir o guardar como PDF is offered");
    // window.print() is called (stubbed: a headless browser has no print dialog).
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; });
    await print.click();
    t.check(await page.evaluate(() => window.__printed) === 1, "the button calls the browser's print");
    await page.emulateMedia({ media: "print" });
    const visible = await page.evaluate(() => {
      const shown = (selector) => [...document.querySelectorAll(selector)].some((node) => {
        const style = getComputedStyle(node);
        return style.visibility !== "hidden" && style.display !== "none" && node.getBoundingClientRect().height > 0;
      });
      return {
        sheet: shown("#hoja-libro h2"), header: shown("header a, header button"), footer: shown("footer a"),
        legal: shown("nav[aria-label] a"), buttons: shown("#hoja-libro [data-print-hidden] button"),
      };
    });
    t.check(visible.sheet && !visible.header && !visible.footer && !visible.legal && !visible.buttons,
      `print media shows only the sheet (header ${visible.header}, footer ${visible.footer}, navigation ${visible.legal}, buttons ${visible.buttons})`);
    await t.shot(page, "print-media", { fullPage: true });
    t.skip("the print dialog and its preview in Chrome and Safari are not run (headless browser; print stylesheet checked with print media)");
  },
});

cases.push({
  id: "EASE-547",
  live: true,
  run: async (t) => {
    let listing;
    if (!t.live) {
      const seller = t.account({ kind: "particular" });
      listing = t.listing(seller, { title: `Guitarra para el libro ${t.tag().slice(-4)}` });
    } else {
      const probe = await t.page();
      await t.goto(probe, "/listados");
      const href = await probe.locator("main a[href^='/instrumentos/']").first().getAttribute("href").catch(() => null);
      if (!href) t.skip("no listing on the catalog page");
      const title = (await probe.locator(`main a[href='${href}']`).first().innerText()).split("\n")[0].trim();
      listing = { slug: href.replace("/instrumentos/", "").split("?")[0], title: null, path: href, probeTitle: title };
      await t.goto(probe, href);
      listing.title = (await probe.locator("h1").first().innerText()).trim();
    }
    const page = await t.page();
    await t.goto(page, `/libro-de-reclamaciones?publicacion=${listing.slug}`);
    const description = page.getByLabel("Descripción");
    const prefilled = await description.inputValue();
    t.check(prefilled === `Publicación «${listing.title}» en Laria (/instrumentos/${listing.slug}).`, `a listing's slug prefills the description: ${prefilled}`);
    await description.fill(`${prefilled} Cambiado a mano.`);
    t.check((await description.inputValue()).endsWith("Cambiado a mano."), "the description stays editable");
    t.check(await page.locator("input[name='listingSlug']").inputValue() === listing.slug, "the form carries the slug");
    for (const slug of ["no-existe-esta-publicacion-9z9z", "No Valido<script>"]) {
      await t.goto(page, `/libro-de-reclamaciones?publicacion=${encodeURIComponent(slug)}`);
      t.check(await page.getByLabel("Descripción").inputValue() === "" && await page.locator("input[name='listingSlug']").inputValue() === "",
        `${slug}: nothing prefilled and no slug in the form`);
    }
    if (!t.live) {
      // Filed from an unknown slug: nothing is stored; from the listing: the slug is.
      await fillSheet(page, { email: sheetEmail(t, "s") });
      await page.getByRole("button", { name: "Enviar hoja de reclamación" }).click();
      await page.locator("#hoja-titulo").waitFor({ timeout: 20_000 });
      const number = /LR-\d{4}-\d{6}/.exec(await page.locator("#hoja-titulo").innerText())?.[0];
      const [row] = t.sql(`select listing_slug from public.complaints_book_entries where sheet_number = ${L(number)}`);
      t.check(row && row.listing_slug === null, `${number} from a malformed slug stores no slug`);
      await t.goto(page, `/libro-de-reclamaciones?publicacion=${listing.slug}`);
      await fillSheet(page, { email: sheetEmail(t, "l") });
      await page.getByRole("button", { name: "Enviar hoja de reclamación" }).click();
      await page.locator("#hoja-titulo").waitFor({ timeout: 20_000 });
      const linked = /LR-\d{4}-\d{6}/.exec(await page.locator("#hoja-titulo").innerText())?.[0];
      const [withSlug] = t.sql(`select listing_slug, item_description from public.complaints_book_entries where sheet_number = ${L(linked)}`);
      t.check(withSlug?.listing_slug === listing.slug, `${linked} from the listing stores its slug`);
      await t.shot(page, "from-listing");
    }
  },
});

cases.push({
  id: "EASE-548",
  run: async (t) => {
    const [admin] = t.sql(`select id from auth.users where email = ${L(t.DEMO.admin)}`);
    // Two sheets filed now, as a visitor would, so the newest are known.
    const filed = [];
    for (const label of ["x", "y"]) {
      const [row] = d.sqlAsRows(null, `select * from public.submit_complaints_book_entry('Luis Ramos Díaz', 'dni', '41234567', 'Av. Brasil 900, Jesús María, Lima',
        '987111222', ${L(sheetEmail(t, label))}, false, null, 'servicio', null, 'Servicio de publicación en Laria', null, 'queja',
        'No recibí respuesta a mi consulta sobre la revisión.', 'Que me respondan.', true)`);
      filed.push(row.sheet_number);
    }
    const page = (status, number, size) => t.sqlAs(admin.id, `select public.get_admin_complaints_book_page(${L(status)}, ${number}, ${size}) as p`, { admin: true })[0].p;
    const total = Number(t.sql("select count(*)::int as n from public.complaints_book_entries")[0].n);
    const first = page(null, 1, 50);
    t.check(first.total === total && first.items.length === Math.min(50, total) && first.page_size === 50, `page 1 of 50: total ${first.total} of ${total}, ${first.items.length} items`);
    t.check(first.items[0].sheet_number === filed[1] && first.items[1].sheet_number === filed[0], `newest first (${first.items[0].sheet_number}, ${first.items[1].sheet_number})`);
    const sorted = first.items.every((item, i, all) => i === 0 || all[i - 1].created_at >= item.created_at);
    t.check(sorted, "the whole page is ordered by filing time, newest first");
    const small = page(null, 2, 1);
    t.check(small.items.length === 1 && small.items[0].sheet_number === filed[0], "page 2 of size 1 is the second newest");
    let tooBig = "";
    try {
      page(null, 1, 51);
      tooBig = "accepted";
    } catch (error) {
      if (error instanceof t.LocalOnly || error instanceof t.LiveUnsafe) throw error;
      tooBig = /ADMIN_PAGINATION_INVALID/.test(String(error.message)) ? "ADMIN_PAGINATION_INVALID" : String(error.message).slice(-160);
    }
    t.check(tooBig === "ADMIN_PAGINATION_INVALID", `a page of 51 is refused (${tooBig})`);
    const [entry] = t.sql(`select id from public.complaints_book_entries where sheet_number = ${L(filed[1])}`);
    const [answer] = t.sqlAs(admin.id, `select public.answer_complaints_book_entry(${L(entry.id)}, 'Revisamos tu consulta y te escribimos al correo.') as a`, { admin: true });
    const [stored] = t.sql(`select status, answer_text, answered_at, answered_by from public.complaints_book_entries where id = ${L(entry.id)}`);
    t.check(answer.a.status === "answered" && stored.status === "answered" && stored.answer_text === "Revisamos tu consulta y te escribimos al correo."
      && stored.answered_at && stored.answered_by === admin.id, `the answer is recorded with its text, date and admin (${stored.answered_at})`);
    const again = d.statementAs(admin.id, `select public.answer_complaints_book_entry(${L(entry.id)}, 'Otra respuesta')`, { admin: true });
    t.check(!again.ok && /COMPLAINT_NOT_ANSWERABLE/.test(again.error), `a second answer is refused (${again.error})`);
    const answered = page("answered", 1, 50);
    const received = page("received", 1, 50);
    t.check(answered.items.some((item) => item.sheet_number === filed[1]) && answered.items.every((item) => item.status === "answered")
      && received.items.every((item) => item.status === "received") && answered.total + received.total === total,
    `the filter splits answered (${answered.total}) and received (${received.total})`);
  },
});

cases.push({
  id: "EASE-549",
  run: async (t) => {
    t.skip("legal review pending");
  },
});

// ------------------------------------------------------------------ Inventario (Effortless Laria, inventory batch)

const INV = "/mi-cuenta/tienda/inventario";
const tableText = async (page) => (await page.locator("table").first().innerText().catch(() => "")).replace(/\s+/g, " ");
const skuCode = (prefix) => `${prefix}-${require("./harness.cjs").tag().slice(-6).toUpperCase()}`;
async function selectPage(page) {
  await page.getByRole("checkbox", { name: "Seleccionar todos los de esta página" }).filter({ visible: true }).first().check();
}
const bar = (page) => page.getByRole("region", { name: "Acciones para los SKU seleccionados" });
const undoButton = (page) => page.getByRole("button", { name: "Deshacer", exact: true });
// A summary tile's number: the <dd> after the <dt> with that label.
const tileValue = (page, label) => page.evaluate((name) => {
  const dt = [...document.querySelectorAll("dt")].find((node) => node.textContent.trim() === name);
  return dt ? dt.nextElementSibling?.textContent.trim() ?? null : null;
}, label);
const count = (query) => Number(require("./harness.cjs").sql(query)[0]?.n ?? 0);

cases.push({
  id: "EASE-600",
  run: async (t) => {
    const { owner, store } = d.inventoryStore({ name: `Busqueda Música ${t.tag().slice(-4)}` });
    const listing = t.listing(owner, { storeRow: store, title: `Pedal Boss DS-1 Distorsión ${t.tag().slice(-4)}`, category: "pedals", type: "pedals", brand: "Boss", model: "DS-1", price: 289 });
    const code = `75${String(Date.now()).slice(-11)}`;
    const mine = d.sku(owner, { merchant_sku: skuCode("PED"), product_name: "Pedal para la prueba", listing_id: listing.id, external_reference: code }, 4);
    const strings = d.sku(owner, { merchant_sku: skuCode("CUE"), product_name: "Cuerdas 10-46" }, 3);
    const rival = d.inventoryStore({ name: `Otra Busqueda ${t.tag().slice(-4)}` });
    const rivalListing = t.listing(rival.owner, { storeRow: rival.store, title: "Boss DS-1 Distortion de otra tienda", category: "pedals", type: "pedals", brand: "Boss", model: "DS-1" });
    const theirs = d.sku(rival.owner, { merchant_sku: skuCode("RIV"), product_name: "Boss DS-1 Distortion", listing_id: rivalListing.id, external_reference: code }, 2);
    const page = await t.page({ as: owner.email });
    for (const q of ["boss", "BOSS", "distorsion", "DS-1 boss", "ds-1 BOSS distorsión", code]) {
      await t.goto(page, `${INV}?q=${encodeURIComponent(q)}`);
      const text = await tableText(page);
      t.check(text.includes(mine.merchant_sku) && !text.includes(strings.merchant_sku) && !text.includes(theirs.merchant_sku),
        `“${q}” finds ${mine.merchant_sku} and nothing else (not the other store's ${theirs.merchant_sku})`);
    }
    await t.goto(page, `${INV}?q=${encodeURIComponent("boss cuerdas")}`);
    const none = await tableText(page);
    t.check(!none.includes(mine.merchant_sku) && !none.includes(strings.merchant_sku), "“boss cuerdas”: every word must appear, so nothing matches");
    await t.goto(page, `${INV}?q=${encodeURIComponent("10-46")}`);
    t.check((await tableText(page)).includes(strings.merchant_sku), "“10-46” finds the strings by their name");
    await t.goto(page, `${INV}?q=${encodeURIComponent("DS-1 boss")}`);
    await t.shot(page, "search");
  },
});

cases.push({
  id: "EASE-601",
  run: async (t) => {
    const { owner } = d.inventoryStore({ name: `Teclea Música ${t.tag().slice(-4)}` });
    const boss = d.sku(owner, { merchant_sku: skuCode("BOSS"), product_name: "Boss SD-1 Super OverDrive" }, 2);
    const strings = d.sku(owner, { merchant_sku: skuCode("CUE"), product_name: "Cuerdas Ernie Ball 10-46" }, 6);
    const page = await t.page({ as: owner.email });
    await t.goto(page, "/mi-cuenta/tienda");
    await t.goto(page, `${INV}?q=cuerdas`);
    t.check((await tableText(page)).includes(strings.merchant_sku), "the previous search “cuerdas” shows the strings");
    const before = await page.evaluate(() => history.length);
    const box = page.locator("[data-inventory-search]");
    await box.fill("");
    await box.pressSequentially("boss", { delay: 120 });
    const followed = await page.waitForURL((url) => url.searchParams.get("q") === "boss", { timeout: 5_000 }).then(() => true).catch(() => false);
    await t.sleep(1000);
    const text = await tableText(page);
    t.check(followed && text.includes(boss.merchant_sku) && !text.includes(strings.merchant_sku), "after a short pause the table shows the matches without pressing Buscar");
    const after = await page.evaluate(() => history.length);
    t.note(`history entries added while typing: ${after - before}`);
    await t.shot(page, "typed");
    await page.goBack({ waitUntil: "load" });
    await t.sleep(800);
    const back = new URL(page.url());
    t.check(back.pathname === INV && back.searchParams.get("q") === "cuerdas", `Back returns to the previous search “cuerdas” (it went to ${back.pathname}${back.search})`);
    await t.shot(page, "after-back");
  },
});

cases.push({
  id: "EASE-602",
  run: async (t) => {
    const { owner, store } = d.inventoryStore({ name: `Revision Música ${t.tag().slice(-4)}` });
    const make = (status, extra = {}) => t.listing(owner, { storeRow: store, status, title: `Guitarra ${status} ${t.tag().slice(-4)}`, extra });
    const pending = make("pending");
    const changed = make("approved");
    const rejected = make("rejected", { rejection_reason: "Las fotos no muestran el instrumento." });
    const plain = make("approved");
    t.exec(`insert into public.listing_revisions (listing_id, owner_user_id, store_id, status, changed_fields, title)
      values (${L(changed.id)}, ${L(owner.id)}, ${L(store.id)}, 'pending', array['title'], ${L(`${changed.title} (nuevo título)`)})`);
    const skus = {};
    for (const [name, row] of Object.entries({ pending, changed, rejected, plain })) skus[name] = d.sku(owner, { merchant_sku: skuCode(name.slice(0, 3).toUpperCase()), product_name: row.title, listing_id: row.id }, 2).merchant_sku;
    const page = await t.page({ as: owner.email });
    await t.goto(page, INV);
    const review = page.getByRole("link", { name: /^En revisión: \d+\. Ver en la tabla$/ });
    const reviewCount = Number(/: (\d+)\./.exec(await review.getAttribute("aria-label"))[1]);
    await review.click();
    await page.waitForURL((url) => url.searchParams.get("publicacion") === "in_review", { timeout: 20_000 });
    await t.sleep(500);
    let text = await tableText(page);
    t.check(reviewCount === 2 && text.includes(skus.pending) && text.includes(skus.changed) && !text.includes(skus.rejected) && !text.includes(skus.plain),
      `En revisión counts ${reviewCount} and opens the new publication and the one with a change in review, nothing else`);
    await t.shot(page, "in-review");
    await t.goto(page, INV);
    const rejectedTile = page.getByRole("link", { name: /^Rechazadas: \d+\. Ver en la tabla$/ });
    t.check(await rejectedTile.count() === 1 && /: 1\./.test(await rejectedTile.getAttribute("aria-label")), "Rechazadas shows 1");
    await rejectedTile.click();
    await page.waitForURL((url) => url.searchParams.get("publicacion") === "rejected", { timeout: 20_000 });
    await t.sleep(500);
    text = await tableText(page);
    t.check(text.includes(skus.rejected) && !text.includes(skus.pending) && !text.includes(skus.changed), "and opens the rejected one");
    const clean = d.inventoryStore({ name: `Sin Rechazos ${t.tag().slice(-4)}` });
    d.sku(clean.owner, { merchant_sku: skuCode("OK"), product_name: "Sin rechazos" }, 1);
    const other = await t.page({ as: clean.owner.email });
    await t.goto(other, INV);
    t.check(await other.getByRole("link", { name: /^Rechazadas:/ }).count() === 0 && await other.locator("dt", { hasText: "Rechazadas" }).count() === 0,
      "a store with nothing rejected has no Rechazadas tile");
  },
});

cases.push({
  id: "EASE-603",
  run: async (t) => {
    const { owner, store } = d.inventoryStore({ name: `Catalogo Música ${t.tag().slice(-4)}` });
    const listing = t.listing(owner, { storeRow: store, title: `Bajo vinculado ${t.tag().slice(-4)}`, category: "basses", type: "bass" });
    const linked = d.sku(owner, { merchant_sku: skuCode("VIN"), product_name: "Bajo con publicación", listing_id: listing.id }, 1);
    const loose = d.sku(owner, { merchant_sku: skuCode("SUE"), product_name: "Correa suelta" }, 5);
    const page = await t.page({ as: owner.email });
    await t.goto(page, INV);
    await page.getByRole("button", { name: /^Filtrar/ }).first().click();
    const sheet = page.getByRole("dialog", { name: "Filtrar inventario" });
    await sheet.waitFor({ timeout: 10_000 });
    const legends = await sheet.locator("legend").allInnerTexts();
    t.check(!legends.some((legend) => /Catálogo/i.test(legend)) && await sheet.getByText(/Catálogo/).count() === 0, `the filter sheet has no Catálogo filter (${legends.join(", ")})`);
    await t.shot(page, "filters");
    await t.goto(page, `${INV}?catalogo=matched`);
    const text = await tableText(page);
    t.check(text.includes(linked.merchant_sku) && text.includes(loose.merchant_sku), "an old catalogo=matched link shows every SKU");
    await t.goto(page, `${INV}/${loose.id}`);
    t.check(!/cat[aá]logo/i.test(await d.mainText(page)), "the page of an unlinked SKU does not mention the catalog");
    const [catalog] = t.sql(`select to_regclass('public.catalog_products') is not null as present`);
    const [product] = catalog?.present ? t.sql(`select id from public.catalog_products limit 1`) : [];
    if (product) {
      t.exec(`update public.store_inventory_items set catalog_product_id = ${L(product.id)} where id = ${L(linked.id)}`);
      await t.goto(page, `${INV}/${linked.id}`);
      t.check((await d.mainText(page)).includes("Catálogo: vinculado"), "a SKU linked to the catalog says so");
    } else t.note("no catalog product in the local database to link; the linked-SKU line is checked in the source only");
  },
});

cases.push({
  id: "EASE-604",
  run: async (t) => {
    const { owner } = d.inventoryStore({ name: `Pasos Música ${t.tag().slice(-4)}` });
    const three = d.sku(owner, { merchant_sku: skuCode("TRES"), product_name: "Afinador de pinza" }, 3);
    const zero = d.sku(owner, { merchant_sku: skuCode("CERO"), product_name: "Capo agotado" }, 0);
    const page = await t.page({ as: owner.email });
    await t.goto(page, `${INV}?q=${three.merchant_sku}`);
    const available = () => Number(d.item(three.id).quantity_available);
    await page.getByRole("button", { name: `Registrar venta de 1 unidad de ${three.merchant_sku}` }).click();
    const sold = page.getByText(`Venta de 1 unidad registrada en ${three.merchant_sku} (tienda física). Quedan 2 disponibles.`);
    t.check(await sold.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false) && available() === 2, "−1 records a sale at once: 2 available");
    await t.shot(page, "sold");
    await undoButton(page).click();
    t.check(await d.until(() => available() === 3, { timeout: 10_000 }) && await page.getByText(`Deshecho. ${three.merchant_sku} volvió a como estaba.`).isVisible(), "Deshacer within 10 s puts it back to 3");
    await page.getByRole("button", { name: `Reponer 1 unidad de ${three.merchant_sku}` }).click();
    await page.getByText(`1 unidad repuesta en ${three.merchant_sku}. Hay 4 disponibles.`).waitFor({ timeout: 10_000 });
    t.check(available() === 4, "+1 adds one: 4 available");
    await t.goto(page, `${INV}?q=${zero.merchant_sku}`);
    t.check(await page.getByRole("button", { name: `Registrar venta de 1 unidad de ${zero.merchant_sku}` }).isDisabled(), "−1 is disabled at zero");
    // The notice takes focus when it appears, which pauses its 10 s countdown; once the owner moves on it runs out.
    await t.goto(page, `${INV}?q=${three.merchant_sku}`);
    await page.getByRole("button", { name: `Registrar venta de 1 unidad de ${three.merchant_sku}` }).click();
    await undoButton(page).waitFor({ timeout: 10_000 });
    await t.sleep(1500);
    const paused = /en pausa/.test(await page.locator("main").innerText());
    await page.locator("h1").first().click();
    await t.sleep(11_500);
    t.check(await undoButton(page).count() === 0, "once focus leaves the notice, Deshacer goes away after 10 s");
    t.note(`while the notice keeps the focus it gets on arrival, the countdown reads “en pausa” (${paused ? "seen" : "not seen"}), so Deshacer stays until the owner moves on`);
  },
});

cases.push({
  id: "EASE-605",
  run: async (t) => {
    const { owner } = d.inventoryStore({ name: `Deshacer Música ${t.tag().slice(-4)}` });
    const item = d.sku(owner, { merchant_sku: skuCode("DES"), product_name: "Pedal de volumen" }, 5);
    const kept = d.sku(owner, { merchant_sku: skuCode("VEN"), product_name: "Cable de 3 m" }, 5);
    d.move(owner, kept.id, "sale", 1, "tienda_fisica");
    const page = await t.page({ as: owner.email });
    await t.goto(page, `${INV}?q=${item.merchant_sku}`);
    await page.getByRole("button", { name: `Registrar venta de 1 unidad de ${item.merchant_sku}` }).click();
    await undoButton(page).click();
    await d.until(() => Number(d.item(item.id).quantity_available) === 5, { timeout: 10_000 });
    const [sale] = t.sql(`select id from public.store_stock_movements where item_id = ${L(item.id)} and movement_type = 'sale' order by created_at desc limit 1`);
    await t.goto(page, `${INV}/${item.id}`);
    const historyText = (await page.locator("section[aria-labelledby='historial-titulo']").innerText()).replace(/\s+/g, " ");
    t.check(/Venta/.test(historyText) && /Deshecho/.test(historyText), `the history shows the sale marked Deshecho: ${historyText.slice(0, 220)}`);
    t.check(await page.getByRole("button", { name: `Deshacer este movimiento de ${item.merchant_sku}` }).count() === 0, "the undone sale offers no second Deshacer");
    await t.shot(page, "history");
    await t.goto(page, INV);
    const sales = await tileValue(page, "Ventas registradas por la tienda");
    t.check(sales === "1", `the sales tile counts the 1 unit sold, not the corrected sale (${sales})`);
    const again = d.statementAs(owner.id, `select public.undo_stock_movements(array[${L(sale.id)}]::uuid[], ${L(d.key("undo"))})`);
    t.check(!again.ok, `a second undo is refused (${again.error})`);
  },
});

cases.push({
  id: "EASE-607",
  timeout: 300_000,
  run: async (t) => {
    const { owner } = d.inventoryStore({ name: `Lote Música ${t.tag().slice(-4)}` });
    const prefix = `LOT${t.tag().slice(-4).toUpperCase()}`;
    const items = Array.from({ length: 10 }, (_, n) => d.sku(owner, { merchant_sku: `${prefix}-${String(n + 1).padStart(2, "0")}`, product_name: `Púa lote ${n + 1}`, unit_price_pen: 100 + n }, 5));
    // An eleventh SKU in the same search, left unticked, so the list keeps a row after Archivar.
    const spare = d.sku(owner, { merchant_sku: `${prefix}-99`, product_name: "Púa que no se toca", unit_price_pen: 50 }, 5);
    const ids = items.map((row) => L(row.id)).join(",");
    const snapshot = () => JSON.stringify(t.sql(`select id, unit_price_pen, low_stock_threshold, category, inventory_status, quantity_on_hand from public.store_inventory_items where id in (${ids}) order by merchant_sku`));
    const spareRow = () => JSON.stringify(t.sql(`select unit_price_pen, low_stock_threshold, category, inventory_status, quantity_on_hand from public.store_inventory_items where id = ${L(spare.id)}`));
    const initial = snapshot();
    const spareInitial = spareRow();
    const page = await t.page({ as: owner.email });
    const runBulk = async (label, fill, submit, changed) => {
      await t.goto(page, `${INV}?q=${prefix}`);
      await selectPage(page);
      await page.getByRole("checkbox", { name: `Seleccionar ${spare.merchant_sku}` }).uncheck();
      await bar(page).getByText("10 SKU seleccionados").waitFor({ timeout: 10_000 });
      await bar(page).getByRole("button", { name: label, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ timeout: 10_000 });
      await fill(dialog);
      await submit(dialog);
      const offered = await undoButton(page).waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
      await t.sleep(1500);
      const after = snapshot();
      t.check(offered && after !== initial && changed(JSON.parse(after)) && spareRow() === spareInitial, `${label}: applied to the 10 SKU (not the unticked one) with Deshacer`);
      if (!await undoButton(page).count()) return t.check(false, `${label}: Deshacer is still on screen after the list refreshes`);
      await undoButton(page).click();
      t.check(await d.until(() => snapshot() === initial, { timeout: 15_000 }), `${label}: Deshacer restores every SKU of the batch`);
    };
    await runBulk("Umbral de stock bajo", (dialog) => dialog.getByLabel("Avisar con stock bajo desde").fill("4"),
      (dialog) => dialog.getByRole("button", { name: "Aplicar a 10 SKU" }).click(), (rows) => rows.every((row) => row.low_stock_threshold === 4));
    await runBulk("Cambiar precios", (dialog) => dialog.getByLabel("Porcentaje (negativo para bajar)").fill("10"),
      async (dialog) => { await dialog.getByRole("button", { name: "Revisar cambios" }).click(); await dialog.getByRole("button", { name: "Aplicar a 10 SKU" }).click(); },
      (rows) => rows.every((row, n) => Number(row.unit_price_pen) > 100 + n));
    await runBulk("Categoría", (dialog) => dialog.getByLabel("Categoría del SKU").selectOption("pedals"),
      (dialog) => dialog.getByRole("button", { name: "Aplicar a 10 SKU" }).click(), (rows) => rows.every((row) => row.category === "pedals"));
    await runBulk("Ajustar stock", async (dialog) => {
      for (const input of await dialog.locator("input[name^='q-']").all()) await input.fill("2");
    }, (dialog) => dialog.getByRole("button", { name: "Guardar movimientos" }).click(), (rows) => rows.every((row) => row.quantity_on_hand === 7));
    await runBulk("Archivar", () => {}, (dialog) => dialog.getByRole("button", { name: "Archivar 10 SKU" }).click(), (rows) => rows.every((row) => row.inventory_status === "archived"));
    await t.shot(page, "after-undo");
    // Archivar on every SKU of the list on screen: the list empties after the refresh.
    const lone = `VAC${t.tag().slice(-4).toUpperCase()}`;
    const pair = [1, 2].map((n) => d.sku(owner, { merchant_sku: `${lone}-${n}`, product_name: `Correa ${n}` }, 1));
    await t.goto(page, `${INV}?q=${lone}`);
    await selectPage(page);
    await bar(page).getByRole("button", { name: "Archivar", exact: true }).click();
    await page.getByRole("dialog", { name: "Archivar SKU" }).getByRole("button", { name: "Archivar 2 SKU" }).click();
    await undoButton(page).waitFor({ timeout: 15_000 }).catch(() => {});
    await d.until(() => pair.every((row) => d.item(row.id).inventory_status === "archived"), { timeout: 10_000 });
    await t.sleep(2500);
    const stillOffered = await undoButton(page).count();
    await t.shot(page, "emptied-list");
    t.check(stillOffered > 0, `when Archivar empties the list on screen, Deshacer stays (page shows: ${(await d.mainText(page)).includes("Ningún SKU coincide con la búsqueda") ? "“Ningún SKU coincide con la búsqueda” and no notice" : "the list"})`);
  },
});

cases.push({
  id: "EASE-610",
  run: async (t) => {
    const { owner } = d.inventoryStore({ name: `Sin Piloto ${t.tag().slice(-4)}` });
    const page = await t.page({ as: owner.email });
    const response = await t.goto(page, "/mi-cuenta/tienda/solicitudes");
    t.check(response.status() === 404, `with the payments pilot off /mi-cuenta/tienda/solicitudes answers ${response.status()}`);
    await t.goto(page, "/mi-cuenta/tienda");
    t.check(await page.locator("a[href='/mi-cuenta/tienda/solicitudes']").count() === 0 && await page.getByRole("link", { name: /^Solicitudes/ }).count() === 0, "the account menu has no Solicitudes entry");
    await t.shot(page, "menu");
    // Ctrl+K's "Ir a" list is fixed: note whether it still offers the page.
    await t.goto(page, INV);
    await page.locator("h1").first().click();
    await page.keyboard.press("Control+k");
    const go = page.getByRole("dialog", { name: "Ir a" });
    if (await go.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false)) {
      await go.getByLabel("Sección o SKU").fill("solicitudes");
      await t.sleep(400);
      const offered = (await go.getByRole("listbox").innerText().catch(() => "")).replace(/\s+/g, " ");
      t.note(`Ctrl+K “Ir a” with “solicitudes” offers: ${offered || "nothing"}`);
    }
  },
});

cases.push({
  id: "EASE-612",
  run: async (t) => {
    const { owner, store } = d.inventoryStore({ name: `Umbral Música ${t.tag().slice(-4)}` });
    const bare = d.sku(owner, { merchant_sku: skuCode("SIN"), product_name: "Sin aviso" }, 4);
    const own = d.sku(owner, { merchant_sku: skuCode("PRO"), product_name: "Con aviso propio", low_stock_threshold: 7 }, 9);
    const page = await t.page({ as: owner.email });
    const save = async (value, apply) => {
      await t.goto(page, INV);
      await page.getByRole("button", { name: "Ajustes de stock" }).click();
      const dialog = page.getByRole("dialog", { name: "Ajustes de stock" });
      await dialog.getByLabel("Aviso de stock bajo por defecto").fill(String(value));
      const option = dialog.getByLabel("Usarlo también en los SKU que hoy no tienen aviso");
      if (apply) await option.check(); else await option.uncheck();
      await dialog.getByRole("button", { name: "Guardar ajustes" }).click();
      await dialog.waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
      await t.sleep(800);
    };
    await save(2, false);
    t.check(d.item(bare.id).low_stock_threshold === null && d.item(own.id).low_stock_threshold === 7, "a default of 2 without the option leaves existing SKU as they are");
    await t.goto(page, INV);
    await page.getByRole("button", { name: "Nuevo SKU" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Nuevo SKU" });
    const code = skuCode("NUE");
    await sheet.locator("input[name='product_name']").fill("Pedal nuevo con el aviso de la tienda");
    await sheet.locator("input[name='merchant_sku']").fill(code);
    await sheet.locator("input[name='opening']").fill("3");
    t.check(await sheet.locator("input[name='low_stock_threshold']").inputValue() === "", "the new SKU's own threshold starts empty, meaning the store's default");
    await sheet.getByRole("button", { name: "Crear SKU", exact: true }).click();
    const created = await d.until(() => d.itemBySku(store.id, code), { timeout: 10_000 });
    t.check(created && created.low_stock_threshold === 2, `a new SKU starts with the default (${created?.low_stock_threshold})`);
    await save(2, true);
    t.check(d.item(bare.id).low_stock_threshold === 2 && d.item(own.id).low_stock_threshold === 7, "with the option, SKU without a threshold get 2 and the one with its own keeps 7");
    await t.shot(page, "after");
  },
});

cases.push({
  id: "EASE-617",
  run: async (t) => {
    const { owner, store } = d.inventoryStore({ name: `Duplicar Música ${t.tag().slice(-4)}` });
    const created = d.sku(owner, { merchant_sku: skuCode("ORI"), product_name: "Cuerdas Elixir Nanoweb", variant_label: "10-46", unit_price_pen: 79, low_stock_threshold: 3, external_reference: `78${String(Date.now()).slice(-10)}` }, 12);
    // The category is set the way the new-SKU sheet sets it, after creating the SKU.
    t.sqlAs(owner.id, `select public.set_inventory_item_category(${L(created.id)}, 'guitars', ${Number(created.version)}) as r`);
    const source = d.item(created.id);
    const page = await t.page({ as: owner.email });
    await t.goto(page, `${INV}/${source.id}`);
    await page.getByRole("button", { name: "Duplicar SKU" }).click();
    const sheet = page.getByRole("dialog", { name: "Duplicar SKU" });
    await sheet.waitFor({ timeout: 10_000 });
    const value = (selector) => sheet.locator(selector).inputValue();
    const values = {
      name: await value("input[name='product_name']"), sku: await value("input[name='merchant_sku']"), variant: await value("input[name='variant_label']"),
      stock: await value("input[name='opening']"), price: await value("input[name='unit_price_pen']"), threshold: await value("input[name='low_stock_threshold']"),
      reference: await value("input[name='external_reference']"), category: await value("select[name='category']"),
    };
    t.check(values.name === source.product_name && values.variant === "10-46" && /79/.test(values.price) && values.threshold === "3" && values.category === "guitars",
      `Duplicar prefills name, variant, price, threshold and category (${JSON.stringify(values)})`);
    t.check(values.sku === "" && values.stock === "0" && values.reference === "", "but not the SKU code, the stock or the barcode");
    await t.shot(page, "duplicate");
    const copy = skuCode("COP");
    await sheet.locator("input[name='merchant_sku']").fill(copy);
    await sheet.locator("input[name='variant_label']").fill("11-49");
    await sheet.getByRole("button", { name: "Crear SKU", exact: true }).click();
    const made = await d.until(() => d.itemBySku(store.id, copy), { timeout: 10_000 });
    t.check(made && made.product_name === source.product_name && Number(made.unit_price_pen) === 79 && made.quantity_on_hand === 0 && made.variant_label === "11-49", "the copy is created with the same data and no stock");
    await t.goto(page, INV);
    await page.getByRole("button", { name: "Nuevo SKU" }).first().click();
    const fresh = page.getByRole("dialog", { name: "Nuevo SKU" });
    await fresh.locator("input[name='product_name']").fill("Cuerdas D'Addario EXL");
    await fresh.getByLabel("Tiene variantes (calibres, colores, tallas)").check();
    const base = `CUE${t.tag().slice(-4).toUpperCase()}`;
    await fresh.locator("input[name='merchant_sku']").fill(base);
    await fresh.getByLabel("Variantes", { exact: true }).fill("10-46, 9-42\n11-49");
    await fresh.locator("input[name='opening']").fill("5");
    await t.shot(page, "variants");
    await fresh.getByRole("button", { name: "Crear 3 SKU" }).click();
    const variants = await d.until(() => {
      const rows = t.sql(`select merchant_sku, variant_label, quantity_on_hand from public.store_inventory_items where store_id = ${L(store.id)} and merchant_sku like ${L(`${base}-%`)} order by merchant_sku`);
      return rows.length === 3 ? rows : null;
    }, { timeout: 15_000 });
    t.check(variants && variants.every((row) => row.quantity_on_hand === 5) && ["10-46", "11-49", "9-42"].every((label) => variants.some((row) => row.variant_label === label && row.merchant_sku === `${base}-${label}`)),
      `variants create one SKU per line with a suffix: ${(variants || []).map((row) => row.merchant_sku).join(", ")}`);
  },
});

function manySkus(owner, prefix, total) {
  const made = [];
  for (let n = 1; n <= total; n += 1) made.push(d.sku(owner, { merchant_sku: `${prefix}-${String(n).padStart(3, "0")}`, product_name: `Artículo ${String(n).padStart(3, "0")} de la serie` }, 2));
  return made;
}

cases.push({
  id: "EASE-618",
  timeout: 300_000,
  run: async (t) => {
    const { owner, store } = d.inventoryStore({ name: `Coinciden Música ${t.tag().slice(-4)}` });
    const prefix = `COI${t.tag().slice(-4).toUpperCase()}`;
    const listing = t.listing(owner, { storeRow: store, title: `Teclado publicado ${t.tag().slice(-4)}`, category: "keyboards", type: "keyboards" });
    manySkus(owner, prefix, 54);
    const blocked = d.sku(owner, { merchant_sku: `${prefix}-PUB`, product_name: "Artículo publicado de la serie", listing_id: listing.id }, 2);
    const archivedCount = () => count(`select count(*)::int as n from public.store_inventory_items where store_id = ${L(store.id)} and inventory_status = 'archived'`);
    const page = await t.page({ as: owner.email });
    await t.goto(page, `${INV}?q=${prefix}`);
    await selectPage(page);
    const banner = page.getByRole("status").filter({ hasText: "SKU de esta página" });
    t.check(/Seleccionaste los 50 SKU de esta página/.test(await banner.innerText()), "selecting the page selects its 50 SKU");
    await banner.getByRole("button", { name: "Seleccionar los 55 que coinciden" }).click();
    await page.getByText("Seleccionaste los 55 SKU que coinciden.").waitFor({ timeout: 10_000 });
    await t.shot(page, "matching");
    t.check(/55 SKU seleccionados/.test(await bar(page).innerText()), "the banner and the bar count the 55 matches");
    const [download] = await Promise.all([page.waitForEvent("download"), bar(page).getByRole("link", { name: "Exportar CSV" }).click()]);
    const lines = fs.readFileSync(await download.path(), "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
    t.check(lines.length === 56 && lines.slice(1).every((line) => line.startsWith(prefix)), `the export reaches all 55 (${lines.length - 1} rows)`);
    await bar(page).getByRole("button", { name: "Archivar", exact: true }).click();
    await page.getByRole("dialog", { name: "Archivar SKU" }).getByRole("button", { name: "Archivar 55 SKU" }).click();
    await undoButton(page).waitFor({ timeout: 20_000 });
    const notice = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    const sentence = /\d+ SKU archivados\.[^.]*\./.exec(notice)?.[0] ?? notice.slice(0, 200);
    t.check(archivedCount() === 54, `the action reached every match: ${archivedCount()} archived`);
    t.check(/publicación publicada o en revisión/.test(sentence), `the notice gives the reason the others did not change: “${sentence}”`);
    t.check(sentence.includes(blocked.merchant_sku), `the skipped SKU is listed by name (${blocked.merchant_sku}) in “${sentence}”`);
    await t.shot(page, "archived");
    await undoButton(page).click();
    t.check(await d.until(() => archivedCount() === 0, { timeout: 20_000 }), "Deshacer brings all 54 back");
  },
});

cases.push({
  id: "EASE-621",
  run: async (t) => {
    const { owner, store } = d.inventoryStore({ name: `Vistas Música ${t.tag().slice(-4)}` });
    d.sku(owner, { merchant_sku: skuCode("BAJ"), product_name: "Stock bajo", low_stock_threshold: 3 }, 1);
    d.sku(owner, { merchant_sku: skuCode("ALT"), product_name: "Stock alto", low_stock_threshold: 3 }, 9);
    const views = () => t.sql(`select name, filters from public.store_inventory_views where store_id = ${L(store.id)} order by created_at`);
    const page = await t.page({ as: owner.email });
    await t.goto(page, INV);
    const nav = page.getByRole("navigation", { name: "Vistas guardadas" });
    const builtIn = await nav.getByRole("link").allInnerTexts();
    t.check(builtIn.length === 4, `four built-in views: ${builtIn.join(" | ")}`);
    const name = `Bajos sin publicar ${t.tag().slice(-3)}`;
    const saveView = async (url) => {
      await t.goto(page, url);
      await nav.getByRole("button", { name: "Guardar vista" }).click();
      const dialog = page.getByRole("dialog", { name: "Guardar esta vista" });
      await dialog.getByLabel("Nombre de la vista").fill(name);
      await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
      await dialog.waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
      await t.sleep(600);
    };
    await saveView(`${INV}?stock=low&publicacion=none`);
    await t.goto(page, INV);
    const saved = nav.getByRole("link", { name });
    t.check(await saved.count() === 1, `the view “${name}” is listed after the four`);
    await t.shot(page, "saved");
    await saved.click();
    await page.waitForURL((url) => url.searchParams.get("stock") === "low", { timeout: 10_000 }).catch(() => {});
    const reopened = new URL(page.url()).searchParams;
    t.check(reopened.get("stock") === "low" && reopened.get("publicacion") === "none", `reopening it applies its filters (${new URL(page.url()).search})`);
    await saveView(`${INV}?stock=out&publicacion=none`);
    const afterSameName = views();
    t.check(afterSameName.length === 1 && afterSameName[0].filters.stock === "out", `the same name replaces the view, one per name (${JSON.stringify(afterSameName)})`);
    await t.goto(page, INV);
    await nav.getByRole("button", { name: `Borrar la vista ${name}` }).click();
    t.check(await d.until(() => views().length === 0, { timeout: 10_000 }), "the view can be deleted");
    // Up to 12 of the store's own, saved as the owner.
    for (let n = 1; n <= 12; n += 1) t.sqlAs(owner.id, `select public.save_inventory_view(${L(`Vista ${n}`)}, '{"stock":"low"}'::jsonb) as r`);
    const thirteenth = d.statementAs(owner.id, `select public.save_inventory_view('Vista 13', '{"stock":"low"}'::jsonb)`);
    t.check(views().length === 12 && !thirteenth.ok, `twelve views are kept and a 13th is refused (${thirteenth.error})`);
    await t.goto(page, INV);
    t.check((await nav.getByRole("link").count()) === 16, "the chips show the four built-in views plus the twelve");
  },
});

cases.push({
  id: "EASE-622",
  run: async (t) => {
    const { owner } = d.inventoryStore({ name: `Atajos Música ${t.tag().slice(-4)}` });
    const item = d.sku(owner, { merchant_sku: skuCode("ATA"), product_name: "Atril plegable" }, 4);
    const page = await t.page({ as: owner.email, width: 1366 });
    await t.goto(page, INV);
    const searchBox = page.locator("[data-inventory-search]");
    const searchFocused = () => page.evaluate(() => Boolean(document.activeElement?.hasAttribute("data-inventory-search")));
    const closeDialog = async () => {
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
    };
    await page.locator("h1").first().click();
    await page.keyboard.press("/");
    t.check(await searchFocused(), "/ moves to the inventory search");
    await page.keyboard.type("n");
    t.check(await page.getByRole("dialog").count() === 0 && await searchBox.inputValue() === "n", "typing n in the search box only types");
    await searchBox.fill("");
    await page.locator("h1").first().click();
    await page.keyboard.press("n");
    const newSheet = page.getByRole("dialog", { name: "Nuevo SKU" });
    t.check(await newSheet.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false), "n opens Nuevo SKU");
    const nameBox = newSheet.locator("input[name='product_name']");
    await nameBox.click();
    await page.keyboard.type("v?ar/");
    t.check(await page.getByRole("dialog", { name: "Atajos de teclado" }).count() === 0 && await nameBox.inputValue() === "v?ar/", "typed in a field (the sheet's Nombre), v ? a r / are just letters");
    await newSheet.getByRole("button", { name: "Cancelar" }).click();
    await newSheet.waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
    await page.locator("h1").first().click();
    await page.keyboard.press("?");
    const help = page.getByRole("dialog", { name: "Atajos de teclado" });
    const helpOpen = await help.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
    const helpText = helpOpen ? (await help.innerText()).replace(/\s+/g, " ") : "";
    t.check(helpOpen && ["Buscar en tu inventario", "Nuevo SKU", "Registrar venta", "Reponer stock", "Ajustar (conteo)", "Ir a cualquier sección", "Ver estos atajos"].every((line) => helpText.includes(line)), "? lists the shortcuts");
    await t.shot(page, "help");
    await closeDialog();
    const row = page.locator("tbody tr").filter({ hasText: item.merchant_sku }).first();
    for (const [key, title] of [["v", "Registrar venta"], ["r", "Reponer stock"], ["a", "Conteo"]]) {
      await row.focus();
      await page.keyboard.press(key);
      const opened = await page.getByRole("dialog", { name: title }).waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
      t.check(opened, `${key} on the focused row opens ${title}`);
      await closeDialog();
    }
    await page.locator("h1").first().click();
    await page.keyboard.press("Control+k");
    const go = page.getByRole("dialog", { name: "Ir a" });
    t.check(await go.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false), "Ctrl+K opens Ir a");
    await go.getByLabel("Sección o SKU").fill("precios");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/inventario\/precios/, { timeout: 10_000 }).catch(() => {});
    t.check(page.url().includes("/inventario/precios"), "and Enter goes to the section");
    await t.goto(page, INV);
    const rowButtons = page.locator("tbody tr").filter({ hasText: item.merchant_sku });
    t.check(await page.getByRole("button", { name: "Nuevo SKU" }).first().isVisible() && await page.getByRole("button", { name: "Buscar", exact: true }).first().isVisible()
      && await page.getByRole("button", { name: "Atajos de teclado" }).isVisible()
      && await rowButtons.getByRole("button", { name: "Registrar venta", exact: true }).count() === 1
      && await rowButtons.getByRole("button", { name: "Reponer stock", exact: true }).count() === 1 && await rowButtons.getByRole("button", { name: "Ajustar", exact: true }).count() === 1,
    "every action also has a button");
  },
});

cases.push({
  id: "EASE-623",
  timeout: 300_000,
  run: async (t) => {
    const { owner } = d.inventoryStore({ name: `Paginas Música ${t.tag().slice(-4)}` });
    const prefix = `PAG${t.tag().slice(-4).toUpperCase()}`;
    manySkus(owner, prefix, 57);
    const page = await t.page({ as: owner.email, width: 1280 });
    await t.goto(page, `${INV}?q=${prefix}&orden=name`);
    const pages = page.getByRole("navigation", { name: "Páginas del inventario" });
    t.check(/1–50 de 57 SKU/.test((await pages.innerText()).replace(/\s+/g, " ")), "page 1 says 1–50 de 57 SKU");
    await pages.getByRole("link", { name: "Siguiente" }).click();
    await page.waitForURL((url) => url.search.length > `?q=${prefix}&orden=name`.length, { timeout: 15_000 });
    await t.sleep(600);
    const range = (await pages.innerText()).replace(/\s+/g, " ");
    t.check(/51–57 de 57 SKU/.test(range), `page 2 says ${range}`);
    const listUrl = page.url();
    await page.locator("tbody tr").first().getByRole("link", { name: "Editar" }).click();
    await page.waitForURL(/\/inventario\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const nav = page.getByRole("navigation", { name: "Otros SKU de la lista" });
    const position = (await nav.innerText()).replace(/\s+/g, " ");
    t.check(/^51 de 57/.test(position) && await nav.getByRole("link", { name: "Anterior" }).count() === 1 && await nav.getByRole("link", { name: "Siguiente" }).count() === 1,
      `the SKU page shows “${position}” with Anterior and Siguiente`);
    await t.shot(page, "sku");
    await nav.getByRole("link", { name: "Siguiente" }).click();
    await page.waitForFunction(() => /^52 de 57/.test(document.querySelector("nav[aria-label='Otros SKU de la lista']")?.innerText.trim() ?? ""), null, { timeout: 15_000 }).catch(() => {});
    t.check(/^52 de 57/.test((await nav.innerText()).trim()), "Siguiente opens the next SKU of the list (52 de 57)");
    await page.getByRole("navigation", { name: "Ruta de navegación" }).getByRole("link", { name: "Inventario" }).click();
    await page.waitForURL((url) => url.pathname === INV, { timeout: 15_000 });
    await t.sleep(600);
    const back = (await pages.innerText()).replace(/\s+/g, " ");
    t.check(/51–57 de 57 SKU/.test(back), `the breadcrumb returns to the same page (${back}; ${page.url() === listUrl ? "same URL" : page.url()})`);
    await t.shot(page, "page-2");
  },
});

cases.push({
  id: "EASE-624",
  run: async (t) => {
    const { owner, store } = d.inventoryStore({ name: `Categoria Música ${t.tag().slice(-4)}` });
    const loose = d.sku(owner, { merchant_sku: skuCode("CAT"), product_name: "Metrónomo digital" }, 3);
    const listing = t.listing(owner, { storeRow: store, title: `Guitarra con su categoría ${t.tag().slice(-4)}`, category: "guitars", type: "electric_guitar" });
    const linked = d.sku(owner, { merchant_sku: skuCode("LIG"), product_name: "Guitarra vinculada", listing_id: listing.id }, 1);
    const page = await t.page({ as: owner.email });
    await t.goto(page, `${INV}/${loose.id}`);
    await page.getByLabel("Categoría del SKU").selectOption("percussion");
    await page.getByText("Categoría guardada.").waitFor({ timeout: 10_000 }).catch(() => {});
    t.check(d.item(loose.id).category === "percussion", "the SKU page sets the category on change");
    await t.shot(page, "sku-category");
    const invalid = d.statementAs(owner.id, `select public.set_inventory_item_category(${L(loose.id)}, 'trompetas-raras', ${Number(d.item(loose.id).version)})`);
    t.check(!invalid.ok, `an invalid category is refused (${invalid.error})`);
    await t.goto(page, `${INV}?q=${encodeURIComponent(linked.merchant_sku)}`);
    await selectPage(page);
    await bar(page).getByRole("button", { name: "Categoría", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Cambiar categoría" });
    await dialog.getByLabel("Categoría del SKU").selectOption("pedals");
    await dialog.getByRole("button", { name: "Aplicar a 1 SKU" }).click();
    await undoButton(page).waitFor({ timeout: 10_000 });
    const [after] = t.sql(`select i.category as sku_category, l.category as listing_category from public.store_inventory_items i join public.listings l on l.id = i.listing_id where i.id = ${L(linked.id)}`);
    t.check(after.sku_category === "pedals" && after.listing_category === "guitars", `in bulk the SKU takes the category and its publication keeps its own (${JSON.stringify(after)})`);
  },
});

module.exports = cases;
