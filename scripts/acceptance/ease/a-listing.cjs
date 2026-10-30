// Effortless Laria acceptance, group A part 3: the listing page and WhatsApp (EASE-100 to EASE-119). Listing pages are
// cached for 60 s (ISR), so each check opens a listing for the first time only after its data is in place.
"use strict";
const a = require("./a-helpers.cjs");

const cases = [];
const clean = (text) => text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const digits9 = () => `9${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;
const iso = (daysAgo = 0) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const pedal = (extra = {}) => ({ category: "pedals", type: "pedals", brand: "Boss", model: "DS-1", price: 300, ...extra });

// A SKU in Inventario, as the owner (the function the Inventario page calls).
function inventoryItem(t, owner, fields, quantity = 0) {
  const [row] = t.sqlAs(owner.id, `select public.create_inventory_item(${t.literal(JSON.stringify(fields))}::jsonb, ${Number(quantity)}, ${t.literal(`a-${t.tag()}`)}) as r`);
  return row.r.item;
}

// Verified sales with the buyer's review of the seller, one sold listing each (as a confirmed Laria sale leaves them).
function seedReviews(t, seller, buyer, ratings) {
  const L = t.literal;
  const tag = t.tag().replace(/[^a-z0-9]/g, "");
  t.exec(`with l as (
      insert into public.listings (id, slug, title, seller_type, status, category, instrument_type, brand, model, condition, price_pen, city, region,
        contact_name, whatsapp_phone, description, owner_user_id, created_by_source, marketplace_rules_accepted_at, published_at, created_at, sold_at, attributes)
      select gen_random_uuid(), 'ease-resena-${tag}-' || n, 'Pedal vendido ${tag} ' || n, 'individual', 'sold', 'pedals', 'pedals', 'Boss', 'DS-1',
        'Usado - buen estado', 200, 'Lima', 'Lima', ${L(seller.name)}, ${L(seller.phone)}, 'Pedal vendido para las reseñas de la aceptación, probado y en buen estado.',
        ${L(seller.id)}, 'self_service', now(), now() - interval '20 days', now() - interval '20 days', now() - interval '12 days', '{}'::jsonb
      from generate_series(1, ${ratings.length}) n
      returning id
    ), c as (
      insert into public.transaction_claims (listing_id, seller_user_id, buyer_user_id, attribution_type, status, created_at, responded_at)
      select l.id, ${L(seller.id)}, ${L(buyer.id)}, 'laria', 'confirmed', now() - interval '12 days', now() - interval '11 days' from l
      returning id, listing_id
    ), v as (
      insert into public.verified_transactions (claim_id, listing_id, seller_user_id, buyer_user_id, seller_identity_type, sold_at, verified_at, review_deadline)
      select c.id, c.listing_id, ${L(seller.id)}, ${L(buyer.id)}, 'particular', now() - interval '12 days', now() - interval '11 days', now() - interval '1 day' from c
      returning id, listing_id
    ), r as (
      select v.id, row_number() over (order by v.listing_id) as n from v
    )
    insert into public.transaction_reviews (transaction_id, direction, reviewer_user_id, subject_user_id, rating, comment, submitted_at)
    select r.id, 'buyer_to_seller', ${L(buyer.id)}, ${L(seller.id)}, (array[${ratings.join(",")}]::smallint[])[r.n], 'Reseña de prueba ' || r.n, now() - interval '5 days' - make_interval(mins => r.n::int) from r`);
}

// Clicks the WhatsApp control and returns the tab it opened (WhatsApp is a stand-in page here).
async function contactPopup(page, locator = a.contactLink(page)) {
  const [popup] = await Promise.all([page.waitForEvent("popup", { timeout: 10_000 }), locator.click()]);
  await popup.waitForURL((url) => url.href !== "about:blank", { timeout: 10_000 });
  return popup;
}

// ------------------------------------------------------------------ fix-03: the store's number reaches its listings
cases.push({
  id: "EASE-100",
  timeout: 300_000,
  run: async (t) => {
    const owner = t.account({ kind: "store_owner" });
    const shop = t.store(owner, { verified: true });
    const approved = t.listing(owner, { storeRow: shop, ...pedal({ title: `Pedal Boss BD-2 ${a.word("zw")}`, model: "BD-2", price: 450 }) });
    const sold = t.listing(owner, { storeRow: shop, status: "sold", ...pedal({ title: `Pedal Boss DS-2 ${a.word("zw")}`, model: "DS-2", price: 420 }), extra: { sold_at: iso(1) } });
    const oldPhone = owner.phone;
    const next = digits9();
    const page = await t.page({ as: owner.email });
    await t.goto(page, "/mi-cuenta/tienda");
    const field = page.getByLabel("WhatsApp para compradores");
    await field.fill(next);
    await page.getByRole("button", { name: "Guardar datos de la tienda" }).click();
    const confirm = page.getByRole("button", { name: "Guardar cambios" });
    if (await confirm.isVisible({ timeout: 2_000 }).catch(() => false)) await confirm.click();
    const stored = await a.until(() => {
      const [row] = t.sql(`select whatsapp_phone from public.stores where id = ${t.literal(shop.id)}`);
      return row.whatsapp_phone !== oldPhone ? row.whatsapp_phone : null;
    }, { timeout: 20_000 });
    await t.shot(page, "mi-tienda");
    t.check(stored && stored.replace(/^51/, "") === next, `Mi tienda saves the new number (${stored})`);
    const rows = Object.fromEntries(t.sql(`select id, whatsapp_phone from public.listings where id in (${t.literal(approved.id)}, ${t.literal(sold.id)})`).map((row) => [row.id, row.whatsapp_phone]));
    t.check(rows[approved.id] === stored, `the approved listing follows it (${rows[approved.id]})`);
    t.check(rows[sold.id] === oldPhone, `the sold listing keeps its number (${rows[sold.id]})`);
    const visitor = await t.page();
    await t.goto(visitor, approved.path);
    const href = await a.contactLink(visitor).getAttribute("href");
    t.check(href.startsWith(`https://wa.me/51${next}?`), `the approved listing's WhatsApp opens the new number (${href.split("?")[0]})`);
    await t.goto(visitor, sold.path);
    t.check((await visitor.locator("a[href^='https://wa.me/']").count()) === 0 && /fue marcado como vendido/.test(await visitor.locator("main").innerText()),
      "the sold listing offers no WhatsApp button (its stored number stays as it was)");
  },
});

cases.push({
  id: "EASE-101",
  run: async (t) => {
    const nine = digits9();
    const seller = t.account({ kind: "particular", phone: nine });
    const listing = t.listing(seller, pedal({ title: `Pedal Boss SD-1 ${a.word("zx")}`, model: "SD-1" }));
    const full = `51${digits9()}`;
    const other = t.account({ kind: "particular", phone: full });
    const second = t.listing(other, pedal({ title: `Pedal Boss CH-1 ${a.word("zx")}`, model: "CH-1" }));
    // The database adds 51 on every save now (20261103120000_ux_phone_normalization.sql), so a number stored as 9 digits is
    // an older row: write one the way it was then, in this session only (no triggers), on this check's own listing.
    const [saved] = t.sql(`select whatsapp_phone from public.listings where id = ${t.literal(listing.id)}`);
    t.note(`entered as ${nine}, saved as ${saved.whatsapp_phone}`);
    t.exec(`set session_replication_role = replica; update public.listings set whatsapp_phone = ${t.literal(nine)} where id = ${t.literal(listing.id)}; set session_replication_role = origin;`);
    const [row] = t.sql(`select l.whatsapp_phone, p.phone from public.listings l left join public.profiles p on p.id = l.owner_user_id where l.id = ${t.literal(listing.id)}`);
    const page = await t.page();
    await t.goto(page, listing.path);
    const href = await a.contactLink(page).getAttribute("href");
    t.check(/^\d{9}$/.test(row.whatsapp_phone) && href.startsWith(`https://wa.me/51${nine}?`), `a number stored as 9 digits (${row.whatsapp_phone}, profile ${row.phone}) opens ${href.split("?")[0]}`);
    await t.goto(page, second.path);
    const href2 = await a.contactLink(page).getAttribute("href");
    t.check(href2.startsWith(`https://wa.me/${full}?`), `a number already with 51 is unchanged (${href2.split("?")[0]})`);
  },
});

cases.push({
  id: "EASE-102",
  run: async (t) => {
    const others = t.sql("select count(*)::int as n from public.listings where status = 'approved' and category = 'winds'")[0].n;
    if (others > 0) t.skip(`needs a type with no public listings; winds has ${others}`);
    const seller = t.account({ kind: "particular" });
    const sold = t.listing(seller, { status: "sold", title: `Saxofón alto Yamaha ${a.word("zy")}`, category: "winds", type: "winds", brand: "Yamaha", model: "YAS-280", price: 3500, extra: { sold_at: iso(2) } });
    const page = await t.page();
    await t.goto(page, sold.path);
    await page.getByRole("link", { name: "Ver publicaciones similares" }).click();
    await page.waitForURL((url) => url.hash === "#similares", { timeout: 10_000 });
    await page.waitForTimeout(600);
    const box = await a.rect(page, "#similares");
    const text = clean(await page.locator("#similares").innerText());
    t.check(box && box.top >= -5 && box.top < box.innerHeight, `the link lands on the similar section (top ${box?.top} px)`);
    t.check(/Ahora no hay otras publicaciones de este tipo\./.test(text) && (await page.locator("#similares").getByRole("link", { name: "Explorar el catálogo" }).count()) === 1,
      `with nothing similar it says so and links the catalog: "${text.slice(0, 120)}"`);
    await t.shot(page, "similares");
  },
});

// ------------------------------------------------------------------ list-02: the limitation, once, under the button
cases.push({
  id: "EASE-103",
  live: true,
  run: async (t) => {
    let path;
    if (!t.live) {
      const seller = t.account({ kind: "particular" });
      path = t.listing(seller, pedal({ title: `Pedal Boss DD-8 ${a.word("zu")}`, model: "DD-8", price: 640 })).path;
    } else {
      const finder = await t.page();
      await t.goto(finder, "/listados");
      path = `/instrumentos/${(await a.resultCards(finder))[0].slug}`;
    }
    for (const phone of [true, false]) {
      const page = await t.page({ phone });
      await t.goto(page, path);
      const bar = page.locator(".contact-bar");
      const line = bar.locator("p", { hasText: "Laria no procesa pagos ni envíos" });
      const button = bar.locator("a[href^='https://wa.me/'], a", { hasText: /Contactar por WhatsApp|Solicitar compra/ }).first();
      const lineBox = await line.boundingBox();
      const buttonBox = await button.boundingBox();
      t.check(clean(await line.innerText()) === "Laria no procesa pagos ni envíos · Cómo comprar seguro" && lineBox && buttonBox && lineBox.y >= buttonBox.y + buttonBox.height - 2,
        `${phone ? "390" : "1366"} px: "Laria no procesa pagos ni envíos · Cómo comprar seguro" sits under the button`);
      const main = await page.locator("main").innerText();
      const mentions = (main.match(/no procesa pagos/g) || []).length;
      t.check(mentions === 1 && !/no retiene dinero/.test(main), `${phone ? "390" : "1366"} px: said once, no separate trust block (${mentions})`);
      await t.shot(page, phone ? "phone" : "desktop");
      await line.getByRole("button", { name: "Cómo comprar seguro" }).click();
      const sheet = page.getByRole("dialog", { name: "Cómo comprar seguro" });
      await sheet.waitFor();
      const tips = await sheet.locator("li").count();
      t.check(tips === 3, `${phone ? "390" : "1366"} px: the link opens the safety sheet with ${tips} tips`);
      if (phone) await t.shot(page, "sheet");
    }
  },
});

// ------------------------------------------------------------------ list-03, list-04, list-05: the page's facts
cases.push({
  id: "EASE-104",
  run: async (t) => {
    const seller = t.account({ kind: "particular" });
    const yes = t.listing(seller, pedal({ title: `Pedal NUX Morning Star ${a.word("zr")}`, brand: "NUX", model: "Morning Star", attributes: { pedal_type: "overdrive", format: "compact", true_bypass: "yes" } }));
    const no = t.listing(seller, pedal({ title: `Pedal NUX Steel Singer ${a.word("zr")}`, brand: "NUX", model: "Steel Singer", attributes: { pedal_type: "overdrive", format: "compact", true_bypass: "no" } }));
    const page = await t.page();
    const lineOf = async (path) => {
      await t.goto(page, path);
      return clean(await page.locator("h1 ~ p.font-semibold").first().innerText().catch(() => ""));
    };
    const withYes = await lineOf(yes.path);
    await t.shot(page, "spec-line");
    const withNo = await lineOf(no.path);
    const parts = withYes.split(" · ");
    t.check(parts.length >= 2 && parts.length <= 5 && /Overdrive/.test(withYes), `under the title: "${withYes}"`);
    t.check(/True bypass/i.test(withYes) && !/\b(Sí|No)\b/.test(withYes), "a yes attribute reads as its label");
    t.check(!/True bypass/i.test(withNo) && !/\bNo\b/.test(withNo), `a no attribute is left out ("${withNo}")`);
  },
});

cases.push({
  id: "EASE-105",
  run: async (t) => {
    const seller = t.account({ kind: "particular" });
    const ages = [[0, "Publicado hoy"], [1, "Publicado ayer"], [5, "Publicado hace 5 días"], [20, "Publicado hace 2 semanas"], [65, "Publicado hace 2 meses"], [400, "Publicado hace 1 año"]];
    const made = ages.map(([days, label]) => ({ label, listing: t.listing(seller, pedal({ title: `Pedal Boss ${days} días ${a.word("zq")}`, publishedDaysAgo: days })) }));
    const edited = t.listing(seller, pedal({ title: `Pedal Boss editado ${a.word("zq")}`, publishedDaysAgo: 10, price: 500 }));
    const untouched = t.listing(seller, pedal({ title: `Pedal Boss intacto ${a.word("zq")}`, publishedDaysAgo: 10, price: 500 }));
    const quiet = t.listing(seller, pedal({ title: `Pedal Boss tranquilo ${a.word("zq")}`, publishedDaysAgo: 100 }));
    const awake = t.listing(seller, pedal({ title: `Pedal Boss reciente ${a.word("zq")}`, publishedDaysAgo: 100, price: 500 }));
    t.exec(`update public.listings set price_pen = 480 where id in (${t.literal(edited.id)}, ${t.literal(awake.id)})`);
    const page = await t.page();
    const meta = async (path) => {
      await t.goto(page, path);
      return clean(await page.locator("main").innerText());
    };
    for (const { label, listing } of made) {
      const text = await meta(listing.path);
      t.check(text.includes(`Lima, Lima · ${label}`) && !/Actualizado/.test(text), `${label}`);
    }
    const editedText = await meta(edited.path);
    await t.shot(page, "edited");
    t.check(/Publicado hace 10 días · Actualizado hoy/.test(editedText), "a price edit adds \"Actualizado hoy\" (\"Publicado hace 10 días · Actualizado hoy\")");
    t.check(!/Actualizado/.test(await meta(untouched.path)), "an unedited listing has no \"Actualizado\"");
    const quietText = await meta(quiet.path);
    await t.shot(page, "quiet");
    t.check(/Esta publicación tiene un tiempo: consulta si sigue disponible\./.test(quietText), "after 90 days untouched the quiet note shows");
    t.check(!/Esta publicación tiene un tiempo/.test(await meta(awake.path)), "a recent change keeps it away");
  },
});

cases.push({
  id: "EASE-106",
  run: async (t) => {
    const seller = t.account({ kind: "particular" });
    const make = (name) => t.listing(seller, pedal({ title: `Pedal Boss ${name} ${a.word("zp")}`, publishedDaysAgo: 10, price: 1000 }));
    const drop = make("baja");
    const raised = make("sube");
    const sold = make("vendido");
    const pending = t.listing(seller, pedal({ status: "pending", title: `Pedal Boss pendiente ${a.word("zp")}`, price: 1000 }));
    t.exec(`update public.listings set price_pen = 900 where id in (${[drop, raised, sold, pending].map((l) => t.literal(l.id)).join(",")})`);
    t.exec(`update public.listings set price_pen = 1200 where id = ${t.literal(raised.id)}`);
    t.exec(`update public.listings set status = 'sold', sold_at = now() where id = ${t.literal(sold.id)}`);
    const db = Object.fromEntries(t.sql(`select id, previous_price_pen from public.listings where id in (${[drop, raised, sold, pending].map((l) => t.literal(l.id)).join(",")})`).map((r) => [r.id, r.previous_price_pen]));
    t.check(Number(db[drop.id]) === 1000 && db[raised.id] === null && db[pending.id] === null, `the drop is recorded (Antes ${db[drop.id]}); the increase cleared it; the pending listing has none`);
    const page = await t.page();
    const priceLine = () => page.locator("h1 ~ p", { hasText: /S\/\s?[\d,]+/ }).first();
    await t.goto(page, drop.path);
    const price = clean(await priceLine().innerText().catch(() => ""));
    t.check(/S\/ 900/.test(price) && /Antes/.test(price) && /S\/ 1,000/.test(price), `the page shows "${price}"`);
    await t.shot(page, "antes");
    await t.goto(page, `/listados?q=${encodeURIComponent(drop.title.split(" ").pop())}`);
    await a.settled(page);
    const [card] = await a.resultCards(page);
    t.check(card?.drop && /Antes S\/ 1,000/.test(clean(card.text)), `the catalog card too: "${card?.text}"`);
    await t.goto(page, raised.path);
    const raisedPrice = clean(await priceLine().innerText().catch(() => ""));
    t.check(/S\/ 1,200/.test(raisedPrice) && !/Antes/.test(raisedPrice), `after an increase nothing shows ("${raisedPrice}")`);
    await t.goto(page, sold.path);
    const soldPrice = clean(await priceLine().innerText().catch(() => ""));
    t.check(/S\/ 900/.test(soldPrice) && !/Antes/.test(soldPrice) && (await page.locator("h1 ~ p .line-through").count()) === 0, `a sold listing never shows it ("${soldPrice}")`);
  },
});

cases.push({
  id: "EASE-107",
  timeout: 300_000,
  run: async (t) => {
    const seller = t.account({ kind: "particular" });
    const buyer = t.account({ kind: "buyer" });
    const ratings = Array.from({ length: 27 }, (_, i) => [5, 5, 4, 5, 3, 5, 4, 5, 2, 5][i % 10]);
    seedReviews(t, seller, buyer, ratings);
    const listing = t.listing(seller, pedal({ title: `Pedal Boss reseñas ${a.word("zr")}` }));
    const page = await t.page();
    await t.goto(page, listing.path);
    const section = page.locator("#resenas");
    await section.waitFor();
    const text = clean(await section.innerText());
    const count = (n) => ratings.filter((r) => r === n).length;
    const breakdown = await section.locator("dl > div").evaluateAll((rows) => rows.map((row) => row.innerText.replace(/\s+/g, " ").trim()));
    t.check(/27 reseñas/.test(text), `the section counts 27 reviews ("${text.slice(0, 80)}")`);
    t.check([5, 4, 3, 2, 1].every((star, i) => breakdown[i] === `${star} ${star === 1 ? "estrella" : "estrellas"} ${count(star)}`), `with the count per star: ${breakdown.join(" | ")}`);
    const cards = () => section.locator("li:has(> p)").count();
    t.check((await cards()) === 5, `five reviews show first (${await cards()})`);
    await section.getByRole("button", { name: "Ver las 27 reseñas" }).click();
    await a.until(async () => (await cards()) === 25, { timeout: 10_000 });
    t.check((await cards()) === 25, `"Ver las 27 reseñas" loads 20 more (${await cards()})`);
    await t.shot(page, "resenas", { fullPage: true });
    await section.getByRole("button", { name: "Ver más reseñas" }).click();
    await a.until(async () => (await cards()) === 27, { timeout: 10_000 });
    t.check((await cards()) === 27 && (await section.getByRole("button", { name: /Ver (más|las)/ }).count()) === 0, `"Ver más reseñas" loads the rest (${await cards()}), then the button goes`);
  },
});

// ------------------------------------------------------------------ list-07, list-10, trust-03: similar and the seller
cases.push({
  id: "EASE-108",
  live: true,
  run: async (t) => {
    let path;
    let source = null;
    if (!t.live) {
      const seller = t.account({ kind: "particular" });
      const other = () => t.account({ kind: "particular", city: "Cusco", region: "Cusco" });
      source = t.listing(seller, pedal({ title: `Pedal Boss fuente ${a.word("zj")}`, brand: "Boss", price: 1000 }));
      for (let i = 0; i < 2; i += 1) t.listing(other(), pedal({ title: `Pedal Boss misma marca ${a.word("zj")}`, brand: "Boss", price: 5000, city: "Cusco", region: "Cusco" }));
      for (let i = 0; i < 2; i += 1) t.listing(other(), pedal({ title: `Pedal Joyo precio ${a.word("zj")}`, brand: "Joyo", price: 1150, city: "Cusco", region: "Cusco" }));
      for (let i = 0; i < 2; i += 1) t.listing(seller, pedal({ title: `Pedal Mooer ciudad ${a.word("zj")}`, brand: "Mooer", price: 4000 }));
      path = source.path;
    } else {
      const finder = await t.page();
      await t.goto(finder, "/listados?category=pedals");
      await a.settled(finder);
      if ((await a.resultCount(finder)) < 2) t.skip("live: similar-ranking check requires several public pedal listings");
      const first = (await a.resultCards(finder))[0];
      if (!first) t.skip("no pedals on the live catalog");
      path = `/instrumentos/${first.slug}`;
    }
    const page = await t.page();
    await t.goto(page, path);
    // .first(): while the page streams in, the row can briefly be in the document twice.
    const row = page.locator("#similares [role='list'][aria-label='Publicaciones similares']").first();
    await row.waitFor({ timeout: 15_000 });
    const items = await row.locator(":scope > [role='listitem'] a[href^='/instrumentos/']").evaluateAll((links) => [...new Set(links.map((l) => l.getAttribute("href").split("/").pop()))]);
    t.check(items.length > 0 && items.length <= 8, `up to 8 similar listings in a row (${items.length})`);
    const next = page.getByRole("button", { name: "Ver siguientes" });
    t.check((await next.isVisible()) && (await page.getByRole("button", { name: "Ver anteriores" }).isVisible()), "with two buttons at 1366 px");
    const before = await row.evaluate((el) => el.scrollLeft);
    await next.click();
    await page.waitForTimeout(700);
    const after = await row.evaluate((el) => el.scrollLeft);
    t.check(items.length <= 4 || after > before, `"Ver siguientes" moves the row (${before} → ${after})`);
    await t.shot(page, "similares");
    if (source) {
      const rows = Object.fromEntries(t.sql(`select slug, brand, price_pen, city, published_at from public.listings where slug in (${items.map(t.literal).join(",")})`).map((r) => [r.slug, r]));
      const tier = (r) => (r.brand?.toLowerCase() === "boss" ? 0 : Math.abs(Number(r.price_pen) - 1000) <= 300 ? 1 : r.city === "Lima" ? 2 : 3);
      const tiers = items.map((slug) => tier(rows[slug]));
      t.check(tiers.every((value, i) => i === 0 || tiers[i - 1] <= value), `same brand first, then within 30% of the price, then the same city (${tiers.join(" ")})`);
    }
    const phone = await t.page({ phone: true });
    await t.goto(phone, path);
    await phone.locator("#similares [role='list'][aria-label='Publicaciones similares']").first().waitFor({ timeout: 15_000 });
    t.check(!(await phone.getByRole("button", { name: "Ver siguientes" }).isVisible()), "on a phone the row scrolls by swipe, without buttons");
  },
});

cases.push({
  id: "EASE-109",
  live: true,
  run: async (t) => {
    const reply = /respond|respuesta|contesta/i;
    if (t.live) {
      const finder = await t.page();
      await t.goto(finder, "/listados");
      const cards = await a.resultCards(finder);
      const picks = [cards.find((c) => /Particular/.test(c.text)), cards.find((c) => /Tienda/.test(c.text))].filter(Boolean);
      for (const card of picks) {
        const page = await t.page();
        await t.goto(page, `/instrumentos/${card.slug}`);
        const text = clean(await page.locator("#vendedor").innerText());
        t.check(/Activo (hoy|esta semana|este mes)|compradores? confirm|Nuevo en Laria|En Laria desde|Correo confirmado/.test(text) && !reply.test(text), `${card.slug}: the seller card shows recorded facts, no reply-time claim ("${text.slice(0, 160)}")`);
      }
      return;
    }
    const seller = t.account({ kind: "particular" });
    const buyer = t.account({ kind: "buyer" });
    t.exec(`update auth.users set last_sign_in_at = now() - interval '2 hours' where id = ${t.literal(seller.id)}`);
    // Buyers count once their account is a week old with a confirmed e-mail (launch audit A17, laria_private.counted_buyers).
    t.exec(`update auth.users set created_at = now() - interval '10 days' where id = ${t.literal(buyer.id)}`);
    seedReviews(t, seller, buyer, [5]);
    const listing = t.listing(seller, pedal({ title: `Pedal Boss hechos ${a.word("zh")}` }));
    const owner = t.account({ kind: "store_owner" });
    t.exec(`update auth.users set last_sign_in_at = now() - interval '3 days' where id = ${t.literal(owner.id)}`);
    const shop = t.store(owner, { verified: true });
    const storeListing = t.listing(owner, { storeRow: shop, ...pedal({ title: `Pedal Boss tienda ${a.word("zh")}` }) });
    const page = await t.page();
    await t.goto(page, listing.path);
    const card = clean(await page.locator("#vendedor").innerText());
    await page.locator("#vendedor").screenshot({ path: `${t.OUT}/EASE-109-particular.png` });
    t.check(/Activo hoy/.test(card) && /1 comprador confirmó su compra en Laria/.test(card) && /Nuevo en Laria/.test(card) && /Correo confirmado/.test(card),
      `a Particular's card: activity, confirmed sales, Nuevo en Laria and Correo confirmado ("${card.slice(0, 220)}")`);
    t.check(!reply.test(card), "no reply-time claim");
    await t.goto(page, storeListing.path);
    const storeCard = clean(await page.locator("#vendedor").innerText());
    t.check(/Activo esta semana/.test(storeCard) && /Nuevo en Laria|En Laria desde/.test(storeCard) && !reply.test(storeCard), `a store's card: activity and time on Laria, no reply-time claim ("${storeCard.slice(0, 200)}")`);
  },
});

cases.push({
  id: "EASE-110",
  run: async (t) => {
    const owner = t.account({ kind: "store_owner" });
    const shop = t.store(owner, { verified: false, district: "Barranco", address: "Av. Grau 123", showAddress: true, name: `Casa Grau ${t.tag().slice(-4)}` });
    const [admin] = t.sql(`select id from auth.users where email = ${t.literal(t.demo.admin)}`);
    t.sqlAs(admin.id, `select public.set_store_verification(${t.literal(shop.id)}, true) as ok`, { admin: true });
    const listing = t.listing(owner, { storeRow: shop, ...pedal({ title: `Pedal Boss verificado ${a.word("zv")}` }) });
    const page = await t.page({ javaScript: false });
    await t.goto(page, listing.path);
    const explainer = page.locator("#vendedor details").first();
    await explainer.locator("summary").click();
    const text = clean(await explainer.innerText());
    const now = new Date();
    const month = now.toLocaleDateString("es-PE", { month: "long", timeZone: "America/Lima" }).slice(0, 3);
    const since = /verificada desde (\p{L}+)\.? (\d{4})/u.exec(text);
    t.check(await explainer.evaluate((el) => el.open), "without scripts, pressing Tienda verificada opens it");
    t.check(text.includes(`RUC ${shop.ruc}`) && text.includes(`Razón social: ${shop.name} SAC`) && text.includes("Dirección: Av. Grau 123, Barranco, Lima") && text.includes("Un teléfono de contacto"),
      `it lists RUC, razón social, address and a phone on file ("${text.slice(0, 260)}")`);
    t.check(since && since[1].toLowerCase().startsWith(month.toLowerCase()) && Number(since[2]) === now.getFullYear(), `with the verification date ("${since?.[0]}")`);
    t.check(/No es una garantía sobre su equipo ni sus ventas/.test(text), "and what verification does not mean");
    await page.locator("#vendedor").screenshot({ path: `${t.OUT}/EASE-110-explainer.png` });
  },
});

// ------------------------------------------------------------------ list-11: alerts on the listing
cases.push({
  id: "EASE-111",
  timeout: 300_000,
  run: async (t) => {
    const owner = t.account({ kind: "store_owner" });
    const shop = t.store(owner, { inventory: true });
    const listing = t.listing(owner, { storeRow: shop, ...pedal({ title: `Pedal Boss agotado ${a.word("zs")}`, price: 380 }) });
    const sku = `EASE-${t.tag().slice(-6).toUpperCase()}`;
    const item = inventoryItem(t, owner, { merchant_sku: sku, product_name: listing.title, unit_price_pen: 380, listing_id: listing.id }, 0);
    const [state] = t.sql(`select stock_state from public.listings where id = ${t.literal(listing.id)}`);
    t.check(state.stock_state === "out_of_stock", `the store listing is Agotado (${state.stock_state})`);
    const visitor = await t.page();
    await t.goto(visitor, listing.path);
    const ask = visitor.getByRole("link", { name: "Ingresa para que te avisemos" });
    await ask.waitFor({ timeout: 10_000 });
    t.check((await ask.getAttribute("href")).startsWith(`/login?next=${encodeURIComponent(listing.path)}`), "a visitor is sent to sign in");
    const buyer = t.account({ kind: "buyer" });
    const page = await t.page({ as: buyer.email });
    await t.goto(page, listing.path);
    await page.getByRole("button", { name: "Avísame cuando vuelva" }).click();
    await page.getByRole("button", { name: "Te avisaremos · Cancelar aviso" }).waitFor({ timeout: 10_000 });
    await t.shot(page, "watching");
    t.check(t.sql(`select count(*)::int as n from public.listing_stock_watches where listing_id = ${t.literal(listing.id)} and user_id = ${t.literal(buyer.id)}`)[0].n === 1, "the watch is saved");
    const ownerPage = await t.page({ as: owner.email });
    await t.goto(ownerPage, listing.path);
    await ownerPage.waitForTimeout(2_500);
    t.check((await ownerPage.getByRole("button", { name: /Avísame cuando vuelva|Te avisaremos/ }).count()) === 0, "the owner cannot watch their own listing");
    // The owner restocks in Inventario.
    await t.goto(ownerPage, "/mi-cuenta/tienda/inventario");
    const plus = ownerPage.getByRole("button", { name: `Reponer 1 unidad de ${sku}` });
    if (await plus.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await plus.click();
      t.note("restocked with +1 in Inventario");
    } else {
      t.sqlAs(owner.id, `select public.record_stock_movement(${t.literal(item.id)}, 'restock', 1, null, null, null, null, ${t.literal(`a-${t.tag()}`)}) as r`);
      t.note("restocked through record_stock_movement as the owner (the +1 button was not found)");
    }
    const notes = await a.until(() => t.notifications(buyer.id).filter((n) => n.event_type === "listing_back_in_stock"), { timeout: 20_000 });
    await t.shot(ownerPage, "inventario");
    const mails = t.emails(`recipient_user_id = ${t.literal(buyer.id)} and event_type = 'listing_back_in_stock'`);
    const watches = t.sql(`select count(*)::int as n from public.listing_stock_watches where listing_id = ${t.literal(listing.id)}`)[0].n;
    t.check(notes.length === 1 && mails.length === 1 && watches === 0, `back in stock: ${notes.length} notification, ${mails.length} e-mail, the watch ended (${watches} left)`);
  },
});

cases.push({
  id: "EASE-112",
  run: async (t) => {
    const seller = t.account({ kind: "particular" });
    const sold = t.listing(seller, { status: "sold", ...pedal({ title: `Pedal Boss vendido ${a.word("zt")}`, brand: "Boss" }), extra: { sold_at: iso(1) } });
    const visitor = await t.page();
    await t.goto(visitor, sold.path);
    t.check(await visitor.getByRole("link", { name: "Ingresa para que te avisemos si aparece otro" }).waitFor({ timeout: 10_000 }).then(() => true).catch(() => false), "a visitor is asked to sign in");
    const buyer = t.account({ kind: "buyer" });
    const page = await t.page({ as: buyer.email });
    await t.goto(page, sold.path);
    await page.getByRole("button", { name: "Avísame si aparece otro" }).click();
    await page.getByRole("link", { name: "Ver mis alertas" }).waitFor({ timeout: 10_000 });
    t.check(/Listo: te avisaremos cuando se publique uno parecido\./.test(await page.locator("main").innerText()), "the press creates the alert");
    const alerts = t.sql(`select frequency, search_filters from public.saved_search_alerts where user_id = ${t.literal(buyer.id)}`);
    const f = alerts[0]?.search_filters || {};
    t.check(alerts.length === 1 && alerts[0].frequency === "immediate" && f.category === "pedals" && f.instrument_type === "pedals" && f.brand === "Boss",
      `an immediate alert for its category, type and brand (${JSON.stringify(alerts)})`);
    await t.shot(page, "created");
    await t.goto(page, sold.path);
    await page.getByRole("button", { name: "Avísame si aparece otro" }).click();
    await page.getByText("Ya tienes esta alerta. Puedes verla en Alertas.").waitFor({ timeout: 10_000 });
    t.check(t.sql(`select count(*)::int as n from public.saved_search_alerts where user_id = ${t.literal(buyer.id)}`)[0].n === 1, "pressing again says it exists, and no second alert is made");
    await page.getByRole("link", { name: "Ver mis alertas" }).click();
    await page.waitForURL((url) => url.pathname === "/mi-cuenta/alertas", { timeout: 20_000 });
    t.check(/Boss/.test(await page.locator("main").innerText()), "Alertas lists it");
  },
});

// ------------------------------------------------------------------ talk-01 to talk-05: the WhatsApp contact
cases.push({
  id: "EASE-113",
  live: true,
  run: async (t) => {
    const targets = [];
    if (!t.live) {
      const seller = t.account({ kind: "particular" });
      targets.push({ kind: "individual", listing: t.listing(seller, pedal({ title: `Pedal Boss mensaje ${a.word("zm")}`, price: 1500 })) });
      const owner = t.account({ kind: "store_owner" });
      const shop = t.store(owner);
      targets.push({ kind: "store", listing: t.listing(owner, { storeRow: shop, ...pedal({ title: `Pedal Boss mensaje tienda ${a.word("zm")}`, price: 820 }) }) });
    } else {
      const finder = await t.page();
      await t.goto(finder, "/listados");
      const cards = await a.resultCards(finder);
      const individual = cards.find((c) => /Particular/.test(c.text));
      const store = cards.find((c) => /Tienda/.test(c.text));
      if (individual) targets.push({ kind: "individual", listing: { slug: individual.slug, title: null, path: `/instrumentos/${individual.slug}` } });
      if (store) targets.push({ kind: "store", listing: { slug: store.slug, title: null, path: `/instrumentos/${store.slug}` } });
    }
    for (const { kind, listing } of targets) {
      const page = await t.page();
      await t.goto(page, listing.path);
      const title = listing.title || clean(await page.locator("h1").first().innerText());
      const price = clean(await page.locator("h1 ~ p").filter({ hasText: /S\// }).first().innerText().catch(() => "")).match(/S\/ [\d,]+/)?.[0];
      const text = clean(t.whatsappText(await a.contactLink(page).getAttribute("href")));
      const you = kind === "store" ? "su" : "tu";
      const expected = new RegExp(`^Hola, vi ${you} .+ en Laria${price ? ` a ${price.replace("/", "\\/")}` : ""}: https?://\\S+/instrumentos/${listing.slug} ¿Sigue disponible\\?$`);
      t.check(expected.test(text) && text.includes(title.slice(0, 20)), `${kind}: "${text}"`);
    }
  },
});

cases.push({
  id: "EASE-114",
  run: async (t) => {
    if (t.live) t.skip("requires the local payments-pilot variant, which is off on laria.audio");
    const seller = t.account({ kind: "particular" });
    const listing = t.listing(seller, pedal({ title: `Pedal Boss preguntas ${a.word("zl")}`, price: 350 }));
    const page = await t.page();
    await t.goto(page, listing.path);
    const group = page.getByRole("group", { name: "Agrega preguntas a tu mensaje (opcional)" });
    const chips = group.getByRole("button");
    const names = (await chips.allInnerTexts()).map(clean);
    const pressed = await chips.evaluateAll((items) => items.map((b) => b.getAttribute("aria-pressed")));
    t.check(names.length === 4 && pressed.every((p) => p !== "true"), `four optional chips, none selected (${names.join(" | ")})`);
    const base = t.whatsappText(await a.contactLink(page).getAttribute("href"));
    await group.getByRole("button", { name: "¿Incluye estuche o funda?" }).click();
    await group.getByRole("button", { name: "¿Puedo probarlo?" }).click();
    await t.shot(page, "chips");
    const popup = await contactPopup(page);
    const sent = t.whatsappText(popup.url());
    t.check(sent === `${base} ¿Incluye estuche o funda? ¿Puedo probarlo?` && !popup.url().includes("+"), `the chosen questions are appended in order: "${sent.slice(-70)}"`);
    // Payments pilot: "Solicitar compra" has no questions.
    const pilot = await t.page();
    await t.goto(pilot, `${t.PILOT_BASE}/instrumentos/demo-boss-ds-1`);
    const buy = pilot.locator(".contact-bar a", { hasText: "Solicitar compra" });
    t.check((await buy.count()) === 1 && (await pilot.getByText("Agrega preguntas a tu mensaje (opcional)").count()) === 0, "with Solicitar compra (pilot) the chips are hidden");
    await t.shot(pilot, "pilot");
  },
});

cases.push({
  id: "EASE-115",
  live: true,
  run: async (t) => {
    let path;
    if (!t.live) {
      const seller = t.account({ kind: "particular" });
      path = t.listing(seller, pedal({ title: `Pedal Boss rápido ${a.word("zk")}`, price: 320 })).path;
    } else {
      const finder = await t.page();
      await t.goto(finder, "/listados?max_price=900");
      const first = (await a.resultCards(finder))[0];
      if (!first) t.skip("no listing under S/ 900 on the live catalog");
      path = `/instrumentos/${first.slug}`;
    }
    const page = await t.page();
    const attempts = [];
    // The record first makes sure of the visit's session (POST /api/events/session), then posts /api/contact. Live checks
    // block every write, so there the record stops at the session call.
    page.on("request", (request) => {
      const { pathname } = new URL(request.url());
      if (pathname === "/api/contact" || pathname === "/api/events/session") attempts.push(`${request.method()} ${pathname}`);
    });
    await page.route("**/api/contact", (route) => route.abort("failed"));
    await t.goto(page, path);
    const link = a.contactLink(page);
    t.check((await link.getAttribute("target")) === "_blank" && (await link.evaluate((el) => el.tagName)) === "A", "the button is a link that opens a new tab");
    const started = Date.now();
    const popup = await contactPopup(page, link);
    const ms = Date.now() - started;
    await a.until(() => (t.live ? attempts.length > 0 : attempts.includes("POST /api/contact")), { timeout: 5_000 });
    t.check(/^https:\/\/wa\.me\/\d+\?text=/.test(popup.url()) && ms < 2_000, `WhatsApp opens at once (${ms} ms) with the contact route down`);
    const tried = t.live ? attempts.some((a) => a.startsWith("POST ")) : attempts.includes("POST /api/contact");
    t.check(tried && new URL(page.url()).pathname === path, `the contact was recorded in the background (${attempts.join(", ")}) and the page stayed`);
  },
});

cases.push({
  id: "EASE-116",
  timeout: 300_000,
  run: async (t) => {
    if (t.live) t.skip("requires the local payments-pilot variant, which is off on laria.audio");
    const seller = t.account({ kind: "particular" });
    const expensive = t.listing(seller, { title: `Fender American Strat ${a.word("zc")}`, model: "American Professional II", price: 6500 });
    const expensive2 = t.listing(seller, { title: `Gibson Les Paul ${a.word("zc")}`, brand: "Gibson", model: "Les Paul Standard", price: 9800 });
    const cheap = t.listing(seller, pedal({ title: `Pedal Boss barato ${a.word("zc")}`, price: 290 }));
    const page = await t.page();
    await t.goto(page, expensive.path);
    await a.contactLink(page).click();
    const sheet = page.getByRole("dialog", { name: "Cómo comprar seguro" });
    await sheet.waitFor({ timeout: 10_000 });
    t.check((await sheet.locator("li").count()) === 3 && (await sheet.getByRole("button", { name: "Volver" }).count()) === 1, "before the first contact on S/ 6,500 the sheet shows three tips");
    await t.shot(page, "sheet");
    const popup = await contactPopup(page, sheet.getByRole("link", { name: "Continuar a WhatsApp" }));
    t.check(/^https:\/\/wa\.me\//.test(popup.url()), "Continuar a WhatsApp opens WhatsApp");
    await popup.close();
    const again = await contactPopup(page);
    t.check(/^https:\/\/wa\.me\//.test(again.url()) && !(await sheet.isVisible()), "the second contact goes straight through");
    await t.goto(page, expensive2.path);
    const third = await contactPopup(page);
    t.check(/^https:\/\/wa\.me\//.test(third.url()), "another expensive listing in the same browser: no sheet (once per browser)");
    const fresh = await t.page();
    await t.goto(fresh, cheap.path);
    const direct = await contactPopup(fresh);
    t.check(/^https:\/\/wa\.me\//.test(direct.url()) && (await fresh.getByRole("dialog", { name: "Cómo comprar seguro" }).count()) === 0, "a listing under S/ 1,000 goes straight through in a new browser");
    // Any purchase request (payments pilot) shows it first.
    const pilot = await t.page();
    await t.goto(pilot, `${t.PILOT_BASE}/instrumentos/demo-boss-ds-1`);
    await pilot.locator(".contact-bar a", { hasText: "Solicitar compra" }).click();
    const pilotSheet = pilot.getByRole("dialog", { name: "Cómo comprar seguro" });
    t.check(await pilotSheet.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false), "Solicitar compra on a S/ 299 listing shows the sheet first (pilot)");
    t.check((await pilotSheet.getByRole("link", { name: "Continuar con la solicitud" }).count()) === 1, "ending in \"Continuar con la solicitud\"");
    await t.shot(pilot, "pilot-sheet");
  },
});

cases.push({
  id: "EASE-117",
  run: async (t) => {
    const seller = t.account({ kind: "particular" });
    const listing = t.listing(seller, pedal({ title: `Pedal Boss pista ${a.word("zb")}`, price: 330 }));
    const visitor = await t.page();
    await t.goto(visitor, listing.path);
    const hint = visitor.getByText("para luego confirmar la compra y dejar una reseña.");
    await hint.waitFor({ timeout: 10_000 });
    const hintBox = await hint.boundingBox();
    const buttonBox = await a.contactLink(visitor).boundingBox();
    t.check(clean(await hint.innerText()) === "Ingresa antes de escribir para luego confirmar la compra y dejar una reseña." && hintBox.y < buttonBox.y, "a visitor sees the hint above the button");
    await t.shot(visitor, "visitor");
    const popup = await contactPopup(visitor);
    t.check(/^https:\/\/wa\.me\//.test(popup.url()), "and can contact without an account");
    const buyer = t.account({ kind: "buyer" });
    const page = await t.page({ as: buyer.email });
    await t.goto(page, listing.path);
    await page.waitForTimeout(2_500);
    t.check((await page.getByText("Ingresa antes de escribir").count()) === 0, "a signed-in buyer does not see it");
  },
});

cases.push({
  id: "EASE-118",
  timeout: 300_000,
  run: async (t) => {
    const seller = t.account({ kind: "particular" });
    const listing = t.listing(seller, pedal({ title: `Pedal Boss propio ${a.word("za")}`, price: 360 }));
    const page = await t.page({ as: seller.email });
    await t.goto(page, listing.path);
    const bar = page.locator("section[aria-label='Tu publicación']");
    await bar.waitFor({ timeout: 15_000 });
    const edit = `/mi-cuenta/publicaciones/${listing.id}/editar`;
    t.check(/Es tu publicación/.test(await bar.innerText())
      && (await bar.getByRole("link", { name: "Editar" }).getAttribute("href")) === edit
      && (await bar.getByRole("link", { name: "Bajar precio" }).getAttribute("href")) === `${edit}#editar-price_pen`
      && (await bar.getByRole("button", { name: "Marcar vendida" }).count()) === 1, "the owner sees Es tu publicación with Editar, Bajar precio and Marcar vendida");
    await t.shot(page, "owner-bar");
    await bar.getByRole("link", { name: "Bajar precio" }).click();
    await page.waitForURL((url) => url.pathname === edit, { timeout: 30_000 });
    t.check(await page.locator("#editar-price_pen").waitFor({ timeout: 15_000 }).then(() => true).catch(() => false), "Bajar precio opens the edit form at the price");
    await t.goto(page, listing.path);
    await bar.waitFor({ timeout: 15_000 });
    await bar.getByRole("button", { name: "Marcar vendida" }).click();
    const dialog = page.getByRole("alertdialog", { name: "¿Marcar esta publicación como vendida?" });
    await dialog.waitFor({ timeout: 10_000 });
    await dialog.getByRole("button", { name: "Marcar vendida" }).click();
    await page.waitForURL((url) => url.pathname === `/mi-cuenta/transacciones/${listing.id}`, { timeout: 30_000 });
    const [row] = t.sql(`select status from public.listings where id = ${t.literal(listing.id)}`);
    t.check(row.status === "sold", `Marcar vendida asks first, then opens the sale confirmation (${a.pathOf(page.url())}, status ${row.status})`);
    await t.shot(page, "sale");
    // Nobody else sees it.
    const other = await t.page();
    const visible = t.listing(seller, pedal({ title: `Pedal Boss ajeno ${a.word("za")}`, price: 370 }));
    await t.goto(other, visible.path);
    await other.waitForTimeout(2_500);
    const buyer = t.account({ kind: "buyer" });
    const signed = await t.page({ as: buyer.email });
    await t.goto(signed, visible.path);
    await signed.waitForTimeout(2_500);
    t.check((await other.locator("section[aria-label='Tu publicación']").count()) === 0 && (await signed.locator("section[aria-label='Tu publicación']").count()) === 0, "visitors and other accounts do not see it");
    // A listing whose stock Inventario controls: "Ver en Inventario".
    const owner = t.account({ kind: "store_owner" });
    const shop = t.store(owner, { inventory: true });
    const stocked = t.listing(owner, { storeRow: shop, ...pedal({ title: `Pedal Boss inventario ${a.word("za")}`, price: 390 }) });
    inventoryItem(t, owner, { merchant_sku: `EASE-${t.tag().slice(-6).toUpperCase()}`, product_name: stocked.title, unit_price_pen: 390, listing_id: stocked.id }, 3);
    const store = await t.page({ as: owner.email });
    await t.goto(store, stocked.path);
    const storeBar = store.locator("section[aria-label='Tu publicación']");
    await storeBar.waitFor({ timeout: 15_000 });
    t.check((await storeBar.getByRole("link", { name: "Ver en Inventario" }).count()) === 1 && (await storeBar.getByRole("button", { name: "Marcar vendida" }).count()) === 0, "a stock-managed listing offers Ver en Inventario instead");
    await t.shot(store, "inventario");
  },
});

cases.push({
  id: "EASE-119",
  live: true,
  run: async (t) => {
    let id;
    let slug;
    const page = await t.page();
    if (!t.live) {
      const seller = t.account({ kind: "particular" });
      const listing = t.listing(seller, pedal({ title: `Pedal Boss por id ${a.word("zz")}` }));
      id = listing.id;
      slug = listing.slug;
    } else {
      await t.goto(page, "/listados");
      slug = (await a.resultCards(page))[0].slug;
      await t.goto(page, `/instrumentos/${slug}`);
      id = /"listingId":"([0-9a-f-]{36})"/.exec(await a.pageSource(page))?.[1];
      if (!id) t.skip("the live page does not show the listing id");
    }
    const hops = [];
    page.on("response", (response) => {
      if (response.request().isNavigationRequest() && response.status() >= 300 && response.status() < 400) hops.push(`${response.status()} ${a.pathOf(response.url())}`);
    });
    await t.goto(page, `/instrumentos/${id}`);
    t.check(new URL(page.url()).pathname === `/instrumentos/${slug}` && hops.length >= 1, `/instrumentos/<id> redirects to /instrumentos/${slug} (${hops.join(" | ")})`);
  },
});

module.exports = cases;
