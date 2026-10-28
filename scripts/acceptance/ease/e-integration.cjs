// Group E: Effortless Laria integration (EASE-750 to EASE-766). Local checks make their own stores, listings and
// accounts; the purchase-request cases run on the pilot server (B). EASE-765 also reads a live deployment.
"use strict";
const h = require("./harness.cjs");
const e = require("./e-helpers.cjs");
const x = require("./e-local.cjs");
const replay = require("./e-replay.cjs");

const L = x.L;
const INTEG_TEST = "tests/ux-effortless-integration.test.cjs";
const norm = (text) => String(text || "").replace(/\s+/g, " ").trim();
const antes = (price) => new RegExp(`Antes\\s*S/\\s*${price}`);

// Links inside the section headed `title` (h2 or h3), in order.
async function sectionLinks(page, title) {
  return page.evaluate((name) => {
    const heading = [...document.querySelectorAll("h2, h3")].find((node) => node.textContent.trim() === name);
    const section = heading ? heading.closest("section") || heading.parentElement?.parentElement : null;
    if (!section) return null;
    return [...new Set([...section.querySelectorAll('a[href^="/instrumentos/"]')].map((a) => a.getAttribute("href").replace(/^\/instrumentos\//, "").replace(/[?#].*$/, "")))];
  }, title);
}

async function sectionText(page, title) {
  return page.evaluate((name) => {
    const heading = [...document.querySelectorAll("h2, h3")].find((node) => node.textContent.trim() === name);
    const section = heading ? heading.closest("section") || heading.parentElement?.parentElement : null;
    return section ? section.textContent.replace(/\s+/g, " ").trim() : null;
  }, title);
}

// A store with Inventario, an approved payment method (the pilot's) and a listing linked to a SKU with stock.
function pilotStore(t, { stock = 5, price = 1200 } = {}) {
  const { owner, store } = x.inventoryStore();
  const [admin] = h.sql(`select id from auth.users where email = ${L(h.DEMO.admin)}`);
  h.exec(`insert into public.store_payment_methods (store_id, method, status, reviewed_at, reviewed_by)
    values (${L(store.id)}, 'efectivo_al_recoger', 'approved', now(), ${L(admin.id)})`);
  const listing = t.listing(owner, { storeRow: store, title: `Teclado ${e.unique()} tienda`, category: "keyboards", type: "digital_piano", price });
  const item = x.sku(owner, { merchant_sku: `E${h.tag().slice(-8).toUpperCase()}`, product_name: listing.title, unit_price_pen: price, listing_id: listing.id }, stock);
  return { owner, store, listing, item };
}

module.exports = [
  {
    id: "EASE-750",
    timeout: 360_000,
    async run(t) {
      const { owner, store } = x.inventoryStore();
      const word = e.unique();
      const drop = t.listing(owner, { storeRow: store, title: `Guitarra ${word} baja`, price: 2000, publishedDaysAgo: 12 });
      const bounce = t.listing(owner, { storeRow: store, title: `Guitarra ${word} sube`, price: 2000, publishedDaysAgo: 12 });
      h.exec(`update public.listings set price_pen = 1800 where id = ${L(drop.id)}`);
      h.exec(`update public.listings set price_pen = 2400 where id = ${L(bounce.id)}`);
      h.exec(`update public.listings set price_pen = 1800 where id = ${L(bounce.id)}`);
      const rows = h.sql(`select id, previous_price_pen, public.recent_price_drop_at(l) is not null as listed from public.listings l where id in (${L(drop.id)}, ${L(bounce.id)})`);
      const a = rows.find((row) => row.id === drop.id);
      const b = rows.find((row) => row.id === bounce.id);
      t.check(a.listed && a.previous_price_pen === 2000, "a 10% drop after 12 days at S/ 2,000 is a price drop");
      t.check(!b.listed && b.previous_price_pen === null, "a raise followed by a drop is not");
      const page = await t.page();
      await t.goto(page, `/listados?q=${word}&sort=price_drop`);
      const order = await page.locator('main h2 a[href^="/instrumentos/"]').evaluateAll((links) => links.map((link) => link.getAttribute("href").replace(/^\/instrumentos\//, "")));
      t.check(order[0] === drop.slug, "Bajaron de precio puts the drop first");
      const cardA = await x.cardText(page, drop.slug);
      const cardB = await x.cardText(page, bounce.slug);
      t.check(antes("2,000").test(cardA || ""), `its catalog card shows Antes S/ 2,000 ("${(cardA || "").slice(0, 90)}")`);
      t.check(cardB !== null && !/Antes/.test(cardB), "the raised-then-lowered card shows no Antes");
      await t.shot(page, "catalog");
      await t.goto(page, `/tiendas/${store.slug}`);
      t.check(antes("2,000").test((await x.cardText(page, drop.slug)) || ""), "the store page's card shows Antes S/ 2,000");
      t.check(!/Antes/.test((await x.cardText(page, bounce.slug)) || "Antes"), "and none for the other");
      await t.shot(page, "store");
      for (const [item, shows] of [[drop, true], [bounce, false]]) {
        await t.goto(page, item.path);
        // The listing's own part of the page: the related rows below ("Más de esta tienda", "Publicaciones similares")
        // carry other listings' cards, the other test listing's among them.
        const text = norm(await page.locator("main").first().textContent()).split(/Más de esta tienda|Más de este vendedor|Publicaciones similares/)[0];
        t.check(shows ? antes("2,000").test(text) : !/Antes\s*S\//.test(text), `${item.title}'s page ${shows ? "shows Antes S/ 2,000" : "shows no Antes"}`);
      }
      let row = null;
      for (let round = 0; round < 8 && !(row || []).includes(drop.slug); round += 1) {
        await t.goto(page, "/");
        row = await sectionLinks(page, "Bajaron de precio");
        if (!(row || []).includes(drop.slug)) await h.sleep(20_000);
      }
      t.check((row || []).includes(drop.slug), "the home's Bajaron de precio row has the drop");
      t.check(!(row || []).includes(bounce.slug), "and not the raised-then-lowered one");
      t.check(antes("2,000").test((await x.cardText(page, drop.slug)) || ""), "with the same Antes S/ 2,000");
      await t.shot(page, "home");
    },
  },
  {
    id: "EASE-751",
    async run(t) {
      x.ciAsserts(t, "tests/ux-effortless-integration.sql", ["notification types missing", "e-mail types missing", "'listing_question_asked'",
        "'listing_alert_match'", "'listing_availability_checkin'", "'listing_review_reminder'", "'follow_weekly'", "'store_stock_summary'", "'search_alert_daily'"]);
    },
  },
  {
    id: "EASE-752",
    server: "pilot",
    timeout: 240_000,
    async run(t) {
      x.ciAsserts(t, INTEG_TEST, ["the quantity picker opens WhatsApp at once and keeps the safety sheet"]);
      const { listing } = pilotStore(t, { stock: 5, price: 1200 });
      const page = await t.page({ phone: true });
      const posts = [];
      page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/contact") posts.push(request.postData() || ""); });
      const started = new Date().toISOString();
      await t.goto(page, listing.path);
      const more = page.getByRole("button", { name: "Una unidad más" }).first();
      await more.click();
      await more.click();
      const amount = await page.locator('output[aria-label^="Cantidad"]').first().getAttribute("aria-label");
      t.check(amount === "Cantidad: 3", `3 units chosen (${amount})`);
      const link = x.control(page, "Solicitar compra");
      const href = await page.getByRole("link", { name: /Solicitar compra/ }).first().getAttribute("href");
      t.check(t.whatsappText(href).includes("Cantidad: 3"), "the link carries Cantidad: 3");
      await page.getByRole("link", { name: /Solicitar compra/ }).first().click();
      const sheet = x.safetySheet(page);
      await sheet.waitFor({ timeout: 8_000 }).catch(() => {});
      t.check(await sheet.count() === 1, "the safety sheet comes first for a purchase");
      await t.shot(page, "safety");
      const popup = await x.popupOf(page, () => x.control(sheet, "Continuar a WhatsApp").click());
      const text = t.whatsappText(popup.url());
      t.check(/wa\.me|whatsapp/.test(new URL(popup.url()).hostname) && text.includes("Cantidad: 3"), `WhatsApp opens with the quantity: "${text.replace(/\n/g, " | ")}"`);
      t.note('the message says "Cantidad: 3" (lib/payment-methods.ts buildPurchaseMessage), not the words "3 unidades"');
      await h.sleep(1_000);
      t.check(posts.length === 1, `the contact is recorded in the background (${posts.length} post)`);
      const events = h.sql(`select metadata from public.marketplace_events where listing_id = ${L(listing.id)} and event_type = 'whatsapp_contact' and created_at >= ${L(started)}::timestamptz`);
      t.check(events.length === 1 && events[0].metadata?.intent === "purchase", `one purchase contact (${JSON.stringify(events[0]?.metadata)})`);
      void link;
    },
  },
  {
    id: "EASE-753",
    server: "pilot",
    async run(t) {
      x.ciAsserts(t, INTEG_TEST, ["ready replies read the owner's own store row and type the hours once"]);
      const { owner, store } = pilotStore(t);
      h.exec(`update public.stores set opening_hours = 'Lun a sáb de 10 a. m. a 7 p. m.' where id = ${L(store.id)}`);
      const page = await t.page({ as: owner.email });
      await t.goto(page, "/mi-cuenta/tienda/solicitudes");
      let text = norm(await x.mainText(page));
      const opening = (text.match(/Nuestro horario: Lun a sáb de 10 a\. m\. a 7 p\. m\./g) || []).length;
      t.check(opening >= 1, `the ready replies use the opening hours (${opening} replies)`);
      t.check(!/Nuestro horario:[^.]*\.\s*Nuestro horario:/.test(text), "each reply says the hours once");
      await t.shot(page, "opening-hours");
      h.exec(`insert into public.store_inventory_preferences (store_id, pickup_hours) values (${L(store.id)}, 'Recojo de lun a vie de 3 a 6 p. m.')
        on conflict (store_id) do update set pickup_hours = excluded.pickup_hours`);
      await page.reload();
      text = norm(await x.mainText(page));
      const pickup = (text.match(/Nuestro horario: Recojo de lun a vie de 3 a 6 p\. m\./g) || []).length;
      t.check(pickup === opening && !/Nuestro horario: Lun a sáb/.test(text), `with pickup hours written, the replies use them instead (${pickup})`);
      await t.shot(page, "pickup-hours");
    },
  },
  {
    id: "EASE-754",
    async run(t) {
      x.ciAsserts(t, INTEG_TEST, ["the SKU page shows what a publication starts with, and one category field"]);
      const { owner } = x.inventoryStore();
      const item = x.sku(owner, { merchant_sku: `E${h.tag().slice(-8).toUpperCase()}`, product_name: "Guitarra para publicar", unit_price_pen: 1500 }, 3);
      const page = await t.page({ as: owner.email });
      await t.goto(page, `/mi-cuenta/tienda/inventario/${item.id}`);
      const datos = page.getByText("Datos para publicar", { exact: true }).first();
      const publicar = x.control(page, "Publicar este SKU");
      await datos.waitFor({ timeout: 15_000 }).catch(() => {});
      t.check(await datos.count() === 1 && await publicar.count() === 1, "an unpublished SKU shows Datos para publicar and Publicar este SKU");
      const above = await datos.evaluate((a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING), await publicar.elementHandle());
      t.check(above, "Datos para publicar comes above Publicar este SKU");
      const category = page.getByLabel("Categoría del SKU");
      t.check(await category.count() >= 1, "the category is edited in Categoría del SKU");
      t.check(await page.getByLabel("Categoría", { exact: true }).count() === 0, "and in no other Categoría field");
      await datos.click().catch(() => {});
      await t.shot(page, "sku");
    },
  },
  {
    id: "EASE-755",
    timeout: 300_000,
    async run(t) {
      x.ciAsserts(t, INTEG_TEST, ["Publicar seleccionados sends the rows the owner ticked, never a whole filter"]);
      const { owner, store } = x.inventoryStore();
      const skus = [1, 2, 3].map((n) => x.sku(owner, { merchant_sku: `E${h.tag().slice(-7).toUpperCase()}${n}`, product_name: `Pedal para publicar ${n}`, unit_price_pen: 300 + n }, 2));
      const page = await t.page({ as: owner.email });
      await t.goto(page, `/tiendas/${store.slug}`);
      t.check(await page.getByRole("button", { name: /^Seguir/ }).count() === 0, "the owner's store preview has no Seguir");
      const visitor = await t.page();
      await t.goto(visitor, `/tiendas/${store.slug}`);
      t.check(await visitor.getByRole("button", { name: /^Seguir/ }).or(visitor.getByRole("link", { name: /^Seguir/ })).count() > 0, "a visitor sees Seguir there");
      await t.goto(page, "/mi-cuenta/tienda/inventario");
      let sent = null;
      page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/store/imports/publish-selection") sent = JSON.parse(request.postData() || "{}"); });
      for (const item of skus.slice(0, 2)) await page.getByLabel(`Seleccionar ${item.merchant_sku}`).first().check();
      const button = page.getByRole("button", { name: /^Publicar seleccionados/ });
      t.check(/\(2\)/.test(await button.innerText()), `the bulk bar offers ${await button.innerText()}`);
      await t.shot(page, "bulk");
      await button.click();
      await x.until(() => sent, { timeout: 10_000 });
      t.check(sent && sent.itemIds?.length === 2 && skus.slice(0, 2).every((item) => sent.itemIds.includes(item.id)), `Publicar seleccionados sends only the two ticked rows (${JSON.stringify(sent)})`);
      await h.sleep(2_000);
      const used = h.sql(`select count(*)::int as n from public.listings where store_id = ${L(store.id)} and status in ('pending', 'approved')`)[0].n;
      h.exec(`update public.store_operation_settings set listing_allowance = ${Math.max(used, 1)} where store_id = ${L(store.id)}`);
      if (!used) t.listing(owner, { storeRow: store });
      await t.goto(page, "/mi-cuenta");
      const text = norm(await x.mainText(page));
      const quota = /Cupo de publicaciones: (\d+) de (\d+)/.exec(text);
      t.check(quota && quota[1] === quota[2], `the account home says "${quota ? quota[0] : "(no Cupo de publicaciones)"}"`);
      const pointer = page.locator('main a[href="/mi-cuenta/tienda"]');
      t.check(await pointer.count() > 0, "and points to Mi tienda at the limit");
      await t.shot(page, "account-home");
    },
  },
  {
    id: "EASE-756",
    timeout: 300_000,
    async run(t) {
      x.ciAsserts(t, INTEG_TEST, ["one Vistos recientemente, kept in lib/device-saves.ts and drawn from today's cards"]);
      const own = e.particularListings(t, { count: 3, prices: [700, 710, 720] });
      const [byCard, byLink, byBar] = own.listings;
      const page = await t.page();
      await t.goto(page, `/listados?q=${own.word}`);
      await page.locator(`main h2 a[href="/instrumentos/${byCard.slug}"]`).click();
      await page.waitForURL((url) => url.pathname === byCard.path);
      await page.evaluate((path) => {
        const link = document.createElement("a");
        link.href = path;
        link.textContent = "enlace";
        document.body.append(link);
        link.click();
      }, byLink.path);
      await page.waitForURL((url) => url.pathname === byLink.path);
      await t.goto(page, byBar.path);
      h.exec(`update public.listings set status = 'sold', sold_at = now() where id = ${L(byCard.id)}`);
      h.exec(`update public.listings set status = 'archived' where id = ${L(byLink.id)}`);
      h.exec(`update public.listings set price_pen = 650 where id = ${L(byBar.id)}`);
      const places = [["the home", "/"], ["the catalog", "/listados"], ["the not-found page", `/instrumentos/no-existe-${own.word}`], ["Favoritos", "/favoritos"]];
      for (const [name, route] of places) {
        await t.goto(page, route);
        await page.getByRole("heading", { name: "Vistos recientemente" }).first().waitFor({ timeout: 15_000 }).catch(() => {});
        await h.sleep(800);
        const links = (await sectionLinks(page, "Vistos recientemente")) || [];
        const mine = links.filter((slug) => own.listings.some((item) => item.slug === slug));
        t.check(mine.length === 2 && mine[0] === byBar.slug && mine[1] === byCard.slug, `${name}: newest first, the removed one gone (${mine.join(", ")})`);
        const text = (await sectionText(page, "Vistos recientemente")) || "";
        t.check(text.includes(byBar.title) && /S\/\s*650/.test(text), `${name}: with its title and today's price`);
        t.check(/Vendido/.test(text), `${name}: the sold one says Vendido`);
      }
      await t.shot(page, "favoritos");
      await t.goto(page, "/listados");
      await page.getByRole("heading", { name: "Vistos recientemente" }).first().waitFor({ timeout: 15_000 }).catch(() => {});
      const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Vistos recientemente" }) }).first();
      await section.getByRole("button", { name: /^Borrar/ }).first().click();
      await h.sleep(800);
      t.check(await page.getByRole("heading", { name: "Vistos recientemente" }).count() === 0, "Borrar empties it");
    },
  },
  {
    id: "EASE-757",
    timeout: 300_000,
    async run(t) {
      x.ciAsserts(t, INTEG_TEST, ["one previous visit, counted from every page change"]);
      const buyer = t.account({ kind: "buyer" });
      const seller = t.account({ kind: "particular" });
      const kept = t.listing(seller, { category: "winds", type: "winds", publishedDaysAgo: 3, title: `Saxo ${e.unique()} guardado` });
      const fresh = [1, 2].map((n) => t.listing(seller, { category: "winds", type: "winds", title: `Flauta ${e.unique()} ${n}` }));
      h.exec(`update public.listings set published_at = now() - interval '10 minutes' where id in (${fresh.map((item) => L(item.id)).join(", ")})`);
      h.exec(`insert into public.favorites (user_id, listing_id) values (${L(buyer.id)}, ${L(kept.id)})`);
      h.exec(`insert into public.saved_search_alerts (user_id, search_filters, search_hash, match_bucket, frequency)
        values (${L(buyer.id)}, '{"category":"winds"}', encode(sha256(convert_to(${L(buyer.id)}, 'UTF8')), 'hex'), 'category:winds', 'daily')`);
      const since = Date.now() - 40 * 60_000;
      const page = await t.page({ as: buyer.email });
      await page.context().clearCookies({ name: "laria_visita_anterior" }).catch(() => {});
      await page.context().addCookies([{ name: "laria_ultima_visita", value: String(since), url: t.base }]);
      const sinceIso = new Date(since).toISOString();
      const counts = h.sqlAs(buyer.id, `select public.get_new_listing_counts(${L(sinceIso)}::timestamptz, array['winds']) as c`)[0].c;
      const expected = Number((counts || {}).winds || 0);
      t.check(expected >= 2, `since the visit 40 minutes ago, ${expected} new listings in Vientos`);
      const homeCount = async () => {
        await page.getByRole("heading", { name: "Nuevo desde tu última visita" }).waitFor({ timeout: 15_000 }).catch(() => {});
        const text = (await sectionText(page, "Nuevo desde tu última visita")) || "";
        return /(\d+) publicaci(?:ones nuevas|ón nueva)/.exec(text)?.[1] || null;
      };
      await t.goto(page, "/");
      const before = await homeCount();
      const cookies = await page.context().cookies();
      t.check(cookies.find((c) => c.name === "laria_visita_anterior")?.value === String(since), "the page marks the new visit, keeping the previous one");
      await page.reload();
      const after = await homeCount();
      const pool = h.sql(`select count(*)::int as n from (select published_at from public.listings where status = 'approved' order by published_at desc limit 48) p where published_at > ${L(sinceIso)}::timestamptz`)[0].n;
      t.check(before && before === after, `the home counts the same before and after the visit is marked (${before} / ${after})`);
      t.check(before && Number(before) === Math.min(6, pool), `from the previous visit (${before}; ${pool} of the newest published since)`);
      await t.shot(page, "home");
      await t.goto(page, "/mi-cuenta/favoritos");
      const fav = /Nuevo desde tu última visita:\s*(\d+) en/.exec(norm(await x.mainText(page)));
      t.check(fav && Number(fav[1]) === expected, `Favoritos: "${fav ? fav[0] : "(none)"}" (expected ${expected})`);
      await t.goto(page, "/mi-cuenta/alertas");
      const alert = /(\d+) nuevas? desde tu última visita/.exec(norm(await x.mainText(page)));
      const rpc = h.sqlAs(buyer.id, `select public.get_account_search_alerts(${L(sinceIso)}::timestamptz) as a`)[0].a;
      const alertExpected = Array.isArray(rpc) ? rpc[0]?.new_count : null;
      t.check(alert && Number(alert[1]) === Number(alertExpected) && Number(alert[1]) >= 2, `Alertas: "${alert ? alert[0] : "(none)"}" (expected ${alertExpected})`);
      await t.shot(page, "alertas");
    },
  },
  {
    id: "EASE-758",
    timeout: 240_000,
    async run(t) {
      x.ciAsserts(t, INTEG_TEST, ["what a signed-in person follows shows above Para ti"]);
      const owner = t.account({ kind: "store_owner" });
      const store = t.store(owner, {});
      const word = e.unique();
      const fromStore = Array.from({ length: 9 }, (_, n) => t.listing(owner, { storeRow: store, title: `Amplificador ${word} ${n + 1}`, category: "amplifiers", type: "guitar_amp" }));
      const brand = `Marca${word}`;
      const seller = t.account({ kind: "particular" });
      const fromBrand = t.listing(seller, { brand, model: "Uno", title: `Pedal ${brand} Uno`, category: "pedals", type: "pedals" });
      const buyer = t.account({ kind: "buyer" });
      h.sqlAs(buyer.id, `select public.set_follow(${L(store.id)}, null, true) as r`);
      h.sqlAs(buyer.id, `select public.set_follow(null, ${L(brand)}, true) as r`);
      const page = await t.page({ as: buyer.email });
      await t.goto(page, "/");
      const section = page.locator('section[aria-labelledby="lo-que-sigues"]');
      await section.waitFor({ timeout: 20_000 }).catch(() => {});
      t.check(await section.count() === 1, "a buyer who follows sees Nuevo de lo que sigues");
      const above = await page.evaluate(() => {
        const follows = document.querySelector('section[aria-labelledby="lo-que-sigues"]');
        const forYou = document.getElementById("para-ti-titulo");
        return Boolean(follows && forYou && follows.compareDocumentPosition(forYou) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      t.check(above, "above Para ti");
      const cards = await section.locator('a[href^="/instrumentos/"]').evaluateAll((links) => [...new Set(links.map((a) => a.getAttribute("href")))]);
      t.check(cards.length === 8, `up to eight listings (${cards.length})`);
      const text = norm(await section.innerText());
      t.check(text.includes(store.name) && (text.includes(brand) || !cards.includes(fromBrand.path)), "each says which follow brought it");
      t.check(cards.every((href) => fromStore.some((item) => item.path === href) || href === fromBrand.path), "only what the buyer follows");
      await t.shot(page, "follows");
      const nobody = t.account({ kind: "buyer" });
      const plain = await t.page({ as: nobody.email });
      await t.goto(plain, "/");
      await h.sleep(2_500);
      t.check(await plain.locator('section[aria-labelledby="lo-que-sigues"]').count() === 0, "someone who follows nothing sees no section");
      const visitor = await t.page();
      await t.goto(visitor, "/");
      await h.sleep(2_500);
      t.check(await visitor.locator('section[aria-labelledby="lo-que-sigues"]').count() === 0, "a visitor sees no section");
    },
  },
  {
    id: "EASE-759",
    timeout: 240_000,
    async run(t) {
      x.ciAsserts(t, INTEG_TEST, ["every price reads 'S/ 1,250'", "PriceInput kept in a form's own state shows the grouping"]);
      const own = e.particularListings(t, { count: 1, prices: [900] });
      const listing = own.listings[0];
      const page = await t.page({ as: own.seller.email });
      await t.goto(page, "/mi-cuenta/publicaciones");
      await page.locator(`#precio-${listing.id}`).first().click();
      const field = page.getByLabel("Nuevo precio").first();
      await field.fill("");
      await field.pressSequentially("1250", { delay: 40 });
      const shown = await field.inputValue();
      const prefix = await field.evaluate((input) => input.parentElement.textContent.includes("S/"));
      t.check(shown === "1,250" && prefix, `Mis publicaciones' inline price shows S/ ${shown} while typing`);
      await t.shot(page, "inline");
      await page.getByRole("button", { name: "Guardar" }).first().click();
      const saved = await x.until(() => h.sql(`select price_pen from public.listings where id = ${L(listing.id)}`)[0].price_pen === 1250, { timeout: 10_000 });
      t.check(saved, "and saves 1250");
      const { owner } = x.inventoryStore();
      const item = x.sku(owner, { merchant_sku: `E${h.tag().slice(-8).toUpperCase()}`, product_name: "Bajo con precio", unit_price_pen: 900 }, 1);
      const shop = await t.page({ as: owner.email });
      await t.goto(shop, `/mi-cuenta/tienda/inventario/${item.id}`);
      const price = shop.getByLabel("Precio en soles").first();
      await price.fill("");
      await price.pressSequentially("1250", { delay: 40 });
      const skuShown = await price.inputValue();
      t.check(skuShown === "1,250" && await price.evaluate((input) => input.parentElement.textContent.includes("S/")), `a SKU's price shows S/ ${skuShown}`);
      await price.evaluate((input) => input.form.requestSubmit());
      const skuSaved = await x.until(() => h.sql(`select unit_price_pen from public.store_inventory_items where id = ${L(item.id)}`)[0].unit_price_pen === 1250, { timeout: 10_000 });
      t.check(skuSaved, "and saves 1250");
      await t.shot(shop, "sku");
    },
  },
  {
    id: "EASE-760",
    timeout: 240_000,
    async run(t) {
      x.ciAsserts(t, INTEG_TEST, ['name="brand" [^>]*autoCorrect="off" spellCheck=\\{false\\}', "names are not corrected"]);
      const seller = t.account({ kind: "particular" });
      const page = await t.page({ phone: true, as: seller.email });
      await t.goto(page, "/mi-cuenta/publicar");
      const form = page.locator("form").filter({ has: page.getByRole("navigation", { name: "Pasos para publicar" }) });
      await form.waitFor({ timeout: 30_000 });
      await form.getByRole("button", { name: "Guitarras", exact: true }).click();
      const photos = require("node:fs").readdirSync("/tmp/laria-prototype/storage/listing-photos/descubrir").filter((name) => name.endsWith(".jpg")).slice(0, 1)
        .map((name) => `/tmp/laria-prototype/storage/listing-photos/descubrir/${name}`);
      await page.locator("#venta-fotos").setInputFiles(photos);
      await x.until(async () => (await page.getByText(/Subiendo \d+%|Preparando…/).count()) === 0, { timeout: 60_000 });
      await form.getByRole("button", { name: "Continuar", exact: true }).click();
      const attrs = async (scope) => Promise.all(["Marca", "Modelo"].map((label) => scope.getByLabel(label, { exact: true }).first().evaluate((input) => ({
        autocorrect: input.getAttribute("autocorrect"), spellcheck: input.getAttribute("spellcheck"), autocapitalize: input.getAttribute("autocapitalize"),
      }))));
      const sell = await attrs(form);
      t.check(sell.every((a) => a.autocorrect === "off" && a.spellcheck === "false"), `the sell form's brand and model: ${JSON.stringify(sell)}`);
      await form.getByLabel("Marca", { exact: true }).fill("Ibanez");
      await form.getByLabel("Modelo", { exact: true }).fill("RG");
      t.check(await form.getByLabel("Marca", { exact: true }).inputValue() === "Ibanez" && await form.getByLabel("Modelo", { exact: true }).inputValue() === "RG", "Ibanez RG stays as typed");
      await t.shot(page, "sell");
      const listing = t.listing(seller, {});
      await t.goto(page, `/mi-cuenta/publicaciones/${listing.id}/editar`);
      const edit = await attrs(page.locator("main"));
      t.check(edit.every((a) => a.autocorrect === "off" && a.spellcheck === "false"), `the edit form's brand and model: ${JSON.stringify(edit)}`);
      t.note("the import row's fields rest on the CI assertion (complete-row-sheet.tsx)");
    },
  },
  {
    id: "EASE-761",
    timeout: 240_000,
    async run(t) {
      x.ciAsserts(t, INTEG_TEST, ['<PhoneInput name="whatsapp_phone" required', '<PasswordInput name="password" required']);
      const page = await t.page({ phone: true });
      await t.goto(page, "/registro/tienda");
      const phone = page.locator('input[name="phone"]').first();
      await phone.fill("987 654 321");
      const box = await phone.evaluate((input) => input.parentElement.textContent);
      const probe = page.getByRole("link", { name: "Probar en WhatsApp" }).first();
      t.check(/\+51/.test(box) && await probe.count() === 1 && /51987654321/.test(await probe.getAttribute("href")), "the store sign-up's WhatsApp shows +51 and Probar en WhatsApp");
      t.check(/987 654 321/.test(norm(await x.mainText(page))), "and the number buyers will see");
      const password = page.locator('input[name="password"]').first();
      const eye = page.getByRole("button", { name: "Mostrar contraseña" }).first();
      await password.fill("una-clave-larga-2026");
      t.check(await eye.count() === 1, "the store sign-up's password has the eye");
      await eye.click();
      t.check(await password.getAttribute("type") === "text", "which shows it");
      await t.shot(page, "signup");
      const { owner } = x.inventoryStore();
      const shop = await t.page({ phone: true, as: owner.email });
      await t.goto(shop, "/mi-cuenta/tienda");
      const editLink = shop.getByRole("link", { name: /Editar|Datos de la tienda/ }).first();
      let field = shop.getByLabel("WhatsApp para compradores").first();
      if (!(await field.count()) && await editLink.count()) {
        await editLink.click();
        field = shop.getByLabel("WhatsApp para compradores").first();
      }
      await field.waitFor({ timeout: 15_000 });
      await field.fill("987 654 321");
      const own = await field.evaluate((input) => input.parentElement.textContent);
      t.check(/\+51/.test(own) && await shop.getByRole("link", { name: "Probar en WhatsApp" }).count() > 0, "Mi tienda's WhatsApp para compradores shows +51 and Probar en WhatsApp");
      await t.shot(shop, "mi-tienda");
    },
  },
  {
    id: "EASE-762",
    async run(t) {
      x.ciAsserts(t, INTEG_TEST, ["a new account that only buys is not asked for WhatsApp", "Publicar asks the first time"]);
      const buyer = t.account({ kind: "buyer" });
      const page = await t.page({ as: buyer.email });
      await t.goto(page, "/mi-cuenta");
      t.check(!/Completa tu perfil Particular/.test(await x.mainText(page)), "a new account with a name and an e-mail sees no profile notice");
      await t.goto(page, "/mi-cuenta/publicar");
      const text = norm(await x.mainText(page));
      t.check(/WhatsApp/.test(text) && /Ciudad/.test(text), "Publicar asks for WhatsApp and city the first time");
      await t.shot(page, "publicar");
      const seller = t.account({ kind: "particular" });
      t.listing(seller, {});
      h.exec(`update public.profiles set phone = null where id = ${L(seller.id)}`);
      const other = await t.page({ as: seller.email });
      await t.goto(other, "/mi-cuenta");
      t.check(/Completa tu perfil Particular/.test(await x.mainText(other)), "someone with publications and no WhatsApp does");
      await t.shot(other, "notice");
    },
  },
  {
    id: "EASE-763",
    server: "pilot",
    async run(t) {
      x.ciAsserts(t, INTEG_TEST, ["the street address is not readable through the stores table"]);
      for (const column of ["ruc", "email", "address"]) {
        const result = x.attempt(null, `select ${column} from public.stores limit 1`);
        t.check(!result.ok && /permission denied/.test(result.error), `anon cannot read stores.${column} (${result.error || "read"})`);
      }
      const named = x.attempt(null, "select name, slug from public.stores where status = 'active' limit 1");
      t.check(named.ok && named.rows.length === 1, "the public columns still read");
      const { owner, store } = pilotStore(t);
      const page = await t.page({ as: owner.email });
      await t.goto(page, "/mi-cuenta/tienda/solicitudes");
      const text = norm(await x.mainText(page));
      t.check(text.includes(store.name) && !/No se pudo|No pudimos cargar/.test(text) && /Av\. Prueba 123/.test(text), "Solicitudes reads the owner's own row, address included");
      await t.goto(page, "/mi-cuenta/tienda");
      const own = norm(await x.mainText(page));
      t.check(own.includes(store.name) && own.includes(store.ruc), "the account pages read the owner's own row");
      await t.shot(page, "mi-tienda");
    },
  },
  {
    id: "EASE-764",
    timeout: 900_000,
    async run(t) {
      const result = await replay.run();
      t.note(result.log.slice(-1500));
      t.check(result.ok, `every migration replays in one database session (${result.applied} of ${result.migrations})${result.error ? `: ${result.error}` : ""}`);
      t.check(result.ok && result.leftovers.length === 0, `no session helpers left (${result.leftovers.join(", ") || "none"})`);
      t.check(result.cleaned, "the scratch cluster was stopped and removed");
    },
  },
  {
    id: "EASE-765",
    live: true,
    async run(t) {
      if (!t.live) x.ciAsserts(t, INTEG_TEST, ["pages with their own openGraph name the Laria card"]);
      const meta = (html, name) => {
        const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)="${name}"[^>]*>`))?.[0] || "";
        return tag.match(/content="([^"]*)"/)?.[1] || null;
      };
      let storeRoute = null;
      if (t.live) {
        const directory = await (await fetch(t.url("/tiendas"))).text();
        storeRoute = directory.match(/href="(\/tiendas\/[a-z0-9-]+)"/)?.[1] || null;
      } else {
        const owner = t.account({ kind: "store_owner" });
        storeRoute = `/tiendas/${t.store(owner, {}).slug}`;
      }
      const routes = ["/listados", "/tiendas", "/terminos", "/privacidad", "/articulos-prohibidos", "/consejos-de-seguridad", "/libro-de-reclamaciones", storeRoute].filter(Boolean);
      for (const route of routes) {
        await h.paceNavigation();
        const html = await (await fetch(t.url(route))).text();
        const image = meta(html, "og:image");
        const card = meta(html, "twitter:card");
        const laria = image && /opengraph-image/.test(image);
        t.check(image && (laria || (route.startsWith("/tiendas/") && t.live)), `${route}: og:image ${image ? image.replace(/^https?:\/\/[^/]+/, "") : "(none)"}`);
        t.check(card === "summary_large_image", `${route}: twitter:card ${card}`);
      }
    },
  },
  {
    id: "EASE-766",
    async run(t) {
      x.ciAsserts(t, "tests/ux-listing-page.sql", ["get_public_seller_facts"]);
      x.ciAsserts(t, "tests/ux-effortless-listing-page.test.cjs", ["Una dirección en"]);
    },
  },
];
