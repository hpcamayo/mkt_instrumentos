// Group E: Reservado and Hacer una oferta (EASE-800 to EASE-829), local stack only. Each check makes its own Particular,
// listings and buyers; periods are made and aged on those rows only, and the job runs as the schedule runs it.
"use strict";
const h = require("./harness.cjs");
const e = require("./e-helpers.cjs");
const x = require("./e-local.cjs");

const RES_SQL = "tests/maybes-reservado.sql";
const RES_TEST = "tests/maybes-reservado.test.cjs";
const L = x.L;
const RESERVED_LINE = "Vi que está reservado. Si se libera, ¿me avisas?";
const norm = (text) => String(text || "").replace(/\s+/g, " ").trim();

function one(t, options = {}) {
  const own = e.particularListings(t, { count: 1, ...options });
  return { seller: own.seller, listing: own.listings[0], word: own.word };
}
const period = (listingId) => h.sql(`select reserved_at, reserved_until, ended_at from public.listing_reservations where listing_id = ${L(listingId)}`)[0] || null;
const watch = (t, buyer, listingId) => h.sqlAs(buyer.id, `select public.set_listing_release_watch(${L(listingId)}, true) as ok`)[0]?.ok;
const watchers = (listingId) => h.sql(`select count(*)::int as n from public.listing_release_watches where listing_id = ${L(listingId)}`)[0].n;
const notices = (userId, type) => h.sql(`select * from public.notifications where user_id = ${L(userId)} and event_type = ${L(type)} order by created_at`);
const mails = (userId, type) => h.sql(`select * from laria_private.marketplace_email_deliveries where recipient_user_id = ${L(userId)} and event_type = ${L(type)}`);
const runJob = () => h.sql("select laria_private.run_listing_reservations() as result")[0].result;
// The period ended `ago` (an interval) and, when asked, the job asked about it then.
function age(listingId, ago = "1 minute", { asked = false } = {}) {
  h.exec(`update public.listing_reservations set reserved_at = now() - interval '2 days' - interval '${ago}',
    reserved_until = now() - interval '${ago}', ended_at = ${asked ? `now() - interval '${ago}'` : "null"} where listing_id = ${L(listingId)}`);
}

// A Mis publicaciones row: the innermost row or card that holds the title and buttons.
function rowOf(page, title) {
  return page.locator("li, tr, article").filter({ hasText: title }).filter({ has: page.getByRole("button") }).last();
}

async function chooseDays(page, label) {
  const dialog = page.getByRole("group", { name: "¿Por cuántos días la reservas?" });
  await dialog.waitFor({ timeout: 10_000 });
  await dialog.getByRole("button", { name: label, exact: true }).click();
  return dialog;
}

// Text of the notices the page shows (toasts), as they come.
async function toastText(page, pattern, timeout = 10_000) {
  return x.until(async () => {
    const texts = await page.locator('[role="status"], [role="alert"], [aria-live]').allInnerTexts().catch(() => []);
    return texts.map(norm).find((text) => pattern.test(text)) || null;
  }, { timeout });
}

// Confirms a dialog when one opens (the primary button), and returns whether it did.
async function confirmIfAsked(page, names = /^(Sí, se vendió|Confirmar|Marcar vendida|Quitar reserva|Sí, quitar)/) {
  const dialog = page.getByRole("dialog").or(page.getByRole("alertdialog")).first();
  if (!(await dialog.isVisible().catch(() => false))) {
    await h.sleep(600);
    if (!(await dialog.isVisible().catch(() => false))) return false;
  }
  await dialog.getByRole("button", { name: names }).last().click();
  return true;
}

module.exports = [
  {
    id: "EASE-800",
    async run(t) {
      const { seller, listing } = one(t);
      const page = await t.page({ phone: true, as: seller.email });
      await t.goto(page, "/mi-cuenta/publicaciones");
      const row = rowOf(page, listing.title);
      await row.getByRole("button", { name: "Reservar", exact: true }).click();
      const dialog = page.getByRole("group", { name: "¿Por cuántos días la reservas?" });
      await dialog.waitFor({ timeout: 10_000 });
      const options = (await dialog.getByRole("button").allInnerTexts()).map(norm);
      t.check(await dialog.getByText("¿Por cuántos días la reservas?").count() === 1, "Reservar asks ¿Por cuántos días la reservas?");
      t.check(["1 día", "2 días", "3 días", "5 días"].every((label) => options.includes(label)), `¿Por cuántos días la reservas? offers ${options.join(" / ")}`);
      await t.shot(page, "days");
      const pressed = Date.now();
      await dialog.getByRole("button", { name: "2 días", exact: true }).click();
      const toast = await toastText(page, /hasta el/);
      const held = period(listing.id);
      t.check(held && Math.abs(Date.parse(held.reserved_at) - pressed) < 30_000 && Date.parse(held.reserved_until) - Date.parse(held.reserved_at) === 2 * 86_400_000,
        `one tap reserves for 2 days from now (${held?.reserved_at} → ${held?.reserved_until})`);
      const end = x.limaParts(Date.parse(held.reserved_until));
      t.check(toast && toast.includes(`${end.weekday} ${end.day} de ${end.month}`) && toast.includes(end.clock), `the toast gives the end in Lima time: "${toast}"`);
      await x.until(async () => /Reservada hasta el/.test(norm(await row.innerText())), { timeout: 10_000 });
      const text = norm(await row.innerText());
      t.check(/Reservada hasta el/.test(text), `the row: "${(/Reservada hasta el[^·\n]*/.exec(text) || [text.slice(0, 120)])[0]}"`);
      t.check(await row.getByRole("button", { name: "Cambiar reserva" }).count() === 1 && await row.getByRole("button", { name: "Quitar reserva" }).count() === 1, "with Cambiar reserva and Quitar reserva");
      await t.shot(page, "reserved");
    },
  },
  {
    id: "EASE-801",
    async run(t) {
      x.ciAsserts(t, RES_SQL, ["RESERVATION_NOT_OWNED", "RESERVATION_STORE_LISTING", "RESERVATION_NOT_PUBLISHED"]);
      const { seller, listing } = one(t);
      const other = t.account({ kind: "particular" });
      const refused = (userId, listingId) => x.attempt(userId, `select public.set_listing_reservation(${L(listingId)}, 2) as r`);
      const theirs = refused(other.id, listing.id);
      t.check(!theirs.ok && theirs.error.endsWith("No puedes administrar esta publicación."), `someone else's listing: ${theirs.error}`);
      const { owner, store } = x.inventoryStore();
      const storeListing = t.listing(owner, { storeRow: store });
      const shop = refused(owner.id, storeListing.id);
      t.check(!shop.ok && shop.error.endsWith("Las tiendas separan unidades desde Inventario."), `a store listing: ${shop.error}`);
      for (const status of ["pending", "hidden", "sold", "draft"]) {
        const item = t.listing(seller, { status, extra: status === "sold" ? { sold_at: new Date().toISOString() } : {} });
        const result = refused(seller.id, item.id);
        t.check(!result.ok && result.error.endsWith("Solo puedes reservar una publicación publicada."), `a ${status} listing: ${result.error}`);
      }
      const page = await t.page({ as: owner.email });
      for (const route of ["/mi-cuenta/publicaciones", "/mi-cuenta/tienda/inventario"]) {
        await t.goto(page, route);
        t.check(await page.getByRole("button", { name: "Reservar", exact: true }).count() === 0, `${route} never offers Reservar to a store`);
      }
      await t.shot(page, "store-table");
    },
  },
  {
    id: "EASE-802",
    async run(t) {
      x.ciAsserts(t, RES_SQL, ["RESERVATION_DAYS_INVALID"]);
      const { seller, listing } = one(t);
      const page = await t.page({ as: seller.email });
      for (const days of [4, "2"]) {
        const answer = await x.call(page, t.base, "POST", `/api/listings/${listing.id}/manage`, { action: "reserve", days });
        t.check(answer.status === 400 && /Elige 1, 2, 3 o 5 días\./.test(JSON.stringify(answer.body)), `the route refuses days ${JSON.stringify(days)}: ${answer.status} ${JSON.stringify(answer.body)}`);
      }
      const fn = x.attempt(seller.id, `select public.set_listing_reservation(${L(listing.id)}, 4) as r`);
      t.check(!fn.ok && fn.error.endsWith("Elige 1, 2, 3 o 5 días."), `the function refuses 4: ${fn.error}`);
      const table = x.attemptExec(`insert into public.listing_reservations (listing_id, reserved_at, reserved_until) values (${L(listing.id)}, now(), now() + interval '6 days')`);
      t.check(!table.ok && /listing_reservations_period_check/.test(table.error), `the table refuses 6 days: ${table.error}`);
      t.check(period(listing.id) === null, "nothing was reserved");
    },
  },
  {
    id: "EASE-803",
    async run(t) {
      const { seller, listing } = one(t, { prices: [900] });
      e.reserve(t, seller, listing.id, 2);
      const end = x.limaParts(Date.parse(period(listing.id).reserved_until));
      const buyer = t.account({ kind: "buyer" });
      for (const options of [{ phone: true }, { width: 1366 }]) {
        const width = options.phone ? 390 : 1366;
        const page = await t.page({ ...options, as: buyer.email });
        await t.goto(page, listing.path);
        const text = await x.mainText(page);
        t.check(await page.locator("main").getByText("Reservado", { exact: true }).count() > 0, `${width} px: the Reservado tag`);
        const sentence = new RegExp(`Quien vende lo reservó para otra persona hasta el ${end.weekday} ${end.day} de ${end.month} a las? ${end.clock} [ap]\\. m\\.`);
        t.check(sentence.test(norm(text)), `${width} px: "${(/Quien vende lo reservó[^.]*\. m\./.exec(norm(text)) || ["(missing)"])[0]}"`);
        const notify = page.getByRole("button", { name: "Avísame si se libera" }).first();
        await notify.waitFor({ timeout: 15_000 }).catch(() => {});
        const whatsapp = page.getByRole("link", { name: /Contactar por WhatsApp/ }).first();
        t.check(await notify.count() === 1 && await whatsapp.count() === 1, `${width} px: Avísame si se libera and WhatsApp`);
        const order = await notify.evaluate((a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING), await whatsapp.elementHandle());
        const look = await Promise.all([notify, whatsapp].map((node) => node.evaluate((el) => getComputedStyle(el).backgroundColor)));
        t.check(order && look[0] !== look[1], `${width} px: Avísame si se libera leads and WhatsApp is the secondary button (${look.join(" / ")})`);
        const message = t.whatsappText(await whatsapp.getAttribute("href"));
        t.check(message.endsWith(RESERVED_LINE), `${width} px: the message ends "${message.slice(-50)}"`);
        await t.shot(page, `${width}`);
      }
    },
  },
  {
    id: "EASE-804",
    async run(t) {
      x.ciAsserts(t, RES_TEST, ["a list of cards is read 200 ids at a time"]);
      x.ciAsserts(t, "tests/catalog-recovery.test.cjs", ["Reservado"]);
      const own = e.particularListings(t, { count: 2 });
      e.reserve(t, own.seller, own.listings[0].id, 2);
      const page = await t.page({ phone: true });
      await t.goto(page, `/listados?q=${own.word}`);
      const held = await x.cardText(page, own.listings[0].slug);
      const free = await x.cardText(page, own.listings[1].slug);
      t.check(held && /Reservado/.test(held), "on /listados the reserved card carries Reservado");
      t.check(free && !/Reservado/.test(free), "and the other none");
      await t.shot(page, "cards");
    },
  },
  {
    id: "EASE-805",
    async run(t) {
      x.ciAsserts(t, "tests/catalog-recovery.test.cjs", ["LARIA_CATALOG_ENRICHMENT_DISABLED", "Reservado"]);
      x.ciAsserts(t, RES_TEST, ["one failed read means no badge rather than a wrong one"]);
    },
  },
  {
    id: "EASE-806",
    async run(t) {
      x.ciAsserts(t, RES_SQL, ["each new period of a shown listing changes the cached pages", "a changed end changes the cached pages",
        "the end changes the cached pages", "closing an ended period shows nothing new", "a listing no page shows records nothing"]);
    },
  },
  {
    id: "EASE-807",
    async run(t) {
      x.ciAsserts(t, RES_SQL, ["a new end"]);
      const { seller, listing } = one(t);
      e.reserve(t, seller, listing.id, 2);
      const buyer = t.account({ kind: "buyer" });
      watch(t, buyer, listing.id);
      const page = await t.page({ as: seller.email });
      await t.goto(page, "/mi-cuenta/publicaciones");
      const row = rowOf(page, listing.title);
      await row.getByRole("button", { name: "Cambiar reserva" }).click();
      const pressed = Date.now();
      await chooseDays(page, "5 días");
      await x.until(() => { const now = period(listing.id); return now && Date.parse(now.reserved_until) - Date.parse(now.reserved_at) === 5 * 86_400_000 ? now : null; }, { timeout: 10_000 });
      const now = period(listing.id);
      t.check(now && Math.abs(Date.parse(now.reserved_at) - pressed) < 30_000 && Date.parse(now.reserved_until) - Date.parse(now.reserved_at) === 5 * 86_400_000, `a new 5-day period from now (${now?.reserved_until})`);
      t.check(watchers(listing.id) === 1, "the person waiting keeps waiting");
      await t.shot(page, "changed");
    },
  },
  {
    id: "EASE-808",
    async run(t) {
      const { seller, listing } = one(t);
      e.reserve(t, seller, listing.id, 2);
      const buyers = [t.account({ kind: "buyer" }), t.account({ kind: "buyer" })];
      for (const buyer of buyers) watch(t, buyer, listing.id);
      const page = await t.page({ as: seller.email });
      await t.goto(page, "/mi-cuenta/publicaciones");
      const row = rowOf(page, listing.title);
      const pressed = Date.now();
      await row.getByRole("button", { name: "Quitar reserva" }).click();
      await confirmIfAsked(page);
      const toast = await toastText(page, /avis/i);
      t.check(toast && /\b2\b|dos/.test(toast), `the toast says how many were told: "${toast}"`);
      await x.until(async () => !/Reservada hasta/.test(norm(await rowOf(page, listing.title).innerText())), { timeout: 8_000 });
      t.check(!/Reservada hasta/.test(norm(await rowOf(page, listing.title).innerText())), "the tag goes at once");
      t.check(period(listing.id) === null, "the period is gone");
      for (const buyer of buyers) {
        t.check(notices(buyer.id, "listing_released").length === 1, `a person waiting gets one Se liberó una reserva notice (${notices(buyer.id, "listing_released").map((n) => n.message).join(" | ")})`);
        t.check(mails(buyer.id, "listing_released").length === 1, "and one e-mail");
      }
      const [row2] = h.sql(`select availability_confirmed_at from public.listings where id = ${L(listing.id)}`);
      t.check(row2.availability_confirmed_at && Math.abs(Date.parse(row2.availability_confirmed_at) - pressed) < 60_000, "it counts as Sí, sigue disponible");
      await t.shot(page, "released");
    },
  },
  {
    id: "EASE-809",
    async run(t) {
      x.ciAsserts(t, RES_SQL, ["the job asks about the one period that ended", "a second run asks nothing", "the seller is asked once per period"]);
      const { seller, listing } = one(t);
      e.reserve(t, seller, listing.id, 2);
      age(listing.id, "1 minute");
      runJob();
      runJob();
      const asked = notices(seller.id, "listing_reservation_ended");
      t.check(asked.length === 1, `the seller gets one notice (${asked.map((n) => n.message).join(" | ")})`);
      const mail = mails(seller.id, "listing_reservation_ended");
      t.check(mail.length === 1, "and one e-mail");
      t.check(period(listing.id)?.ended_at, "the period is marked ended");
      const page = await t.page({ as: seller.email });
      await t.goto(page, "/mi-cuenta");
      const text = norm(await x.mainText(page));
      t.check(text.includes(`¿Se vendió “${listing.title}”?`) || (text.includes("¿Se vendió") && text.includes(listing.title)), "the account home has a Pendientes item");
      t.check(await page.getByRole("button", { name: "Sí, se vendió" }).count() > 0, "with Sí, se vendió");
      await t.shot(page, "pendientes");
      const listed = await e.catalogPage(t, `q=${encodeURIComponent(listing.title.split(" ")[1])}`);
      t.check(!(listed.body?.reserved || []).includes(listing.id), "the badge is gone");
    },
  },
  {
    id: "EASE-810",
    async run(t) {
      const { seller, listing } = one(t);
      e.reserve(t, seller, listing.id, 2);
      const buyer = t.account({ kind: "buyer" });
      watch(t, buyer, listing.id);
      age(listing.id, "1 minute");
      runJob();
      const page = await t.page({ as: seller.email });
      await t.goto(page, "/mi-cuenta");
      const item = page.locator("li, article, section").filter({ hasText: listing.title }).filter({ has: page.getByRole("button", { name: "Sí, se vendió" }) }).last();
      await item.getByRole("button", { name: "Sí, se vendió" }).click();
      await confirmIfAsked(page);
      await page.waitForURL((url) => url.pathname.startsWith("/mi-cuenta/transacciones/"), { timeout: 30_000 }).catch(() => {});
      const [row] = h.sql(`select status from public.listings where id = ${L(listing.id)}`);
      t.check(row.status === "sold", `the listing is sold (${row.status})`);
      t.check(/^\/mi-cuenta\/transacciones\/[0-9a-f-]{36}$/.test(new URL(page.url()).pathname), `the buyer choice opens at ${new URL(page.url()).pathname}`);
      await t.shot(page, "transaction");
      const told = notices(buyer.id, "listing_reservation_sold");
      t.check(told.length === 1 && /^Se vendió/.test(told[0].message), `the person waiting gets "${told[0]?.message}" in the app`);
      t.check(mails(buyer.id, "listing_reservation_sold").length === 0 && mails(buyer.id, "listing_released").length === 0, "and no e-mail");
    },
  },
  {
    id: "EASE-811",
    async run(t) {
      const { seller, listing } = one(t);
      e.reserve(t, seller, listing.id, 2);
      const buyer = t.account({ kind: "buyer" });
      watch(t, buyer, listing.id);
      age(listing.id, "1 minute");
      runJob();
      const page = await t.page({ as: seller.email });
      await t.goto(page, "/mi-cuenta");
      const pressed = Date.now();
      const item = page.locator("li, article, section").filter({ hasText: listing.title }).filter({ has: page.getByRole("button", { name: "No, sigue disponible" }) }).last();
      await item.getByRole("button", { name: "No, sigue disponible" }).click();
      await confirmIfAsked(page, /^(No, sigue disponible|Confirmar|Sí)/);
      await x.until(() => period(listing.id) === null, { timeout: 10_000 });
      const [row] = h.sql(`select availability_confirmed_at from public.listings where id = ${L(listing.id)}`);
      t.check(row.availability_confirmed_at && Math.abs(Date.parse(row.availability_confirmed_at) - pressed) < 60_000, "the listing records an availability confirmation");
      await t.goto(page, "/mi-cuenta");
      t.check(await page.getByRole("button", { name: "No, sigue disponible" }).count() === 0 || !norm(await x.mainText(page)).includes(`¿Se vendió “${listing.title}”?`), "the Pendientes item goes");
      t.check(period(listing.id) === null, "the ended period goes");
      t.check(notices(buyer.id, "listing_released").length === 1 && mails(buyer.id, "listing_released").length === 1, "the person waiting gets one release notice and e-mail");
      await t.shot(page, "after");
    },
  },
  {
    id: "EASE-812",
    async run(t) {
      x.ciAsserts(t, RES_SQL, ["released after 24 hours", "nobody hears twice"]);
      const { seller, listing } = one(t);
      e.reserve(t, seller, listing.id, 2);
      const buyer = t.account({ kind: "buyer" });
      watch(t, buyer, listing.id);
      age(listing.id, "1 minute");
      runJob();
      age(listing.id, "25 hours", { asked: true });
      runJob();
      runJob();
      t.check(period(listing.id) === null, "24 hours after the end the period is deleted");
      t.check(notices(buyer.id, "listing_released").length === 1, "the person waiting hears once");
      const [row] = h.sql(`select availability_confirmed_at from public.listings where id = ${L(listing.id)}`);
      t.check(!row.availability_confirmed_at, "no availability confirmation is recorded");
      const page = await t.page({ as: seller.email });
      await t.goto(page, "/mi-cuenta");
      t.check(!norm(await x.mainText(page)).includes(`¿Se vendió “${listing.title}”?`), "the Pendientes item goes");
    },
  },
  {
    id: "EASE-813",
    async run(t) {
      x.ciAsserts(t, RES_TEST, ["Se vendió", "Sigue disponible", "Reservar otra vez", "Marcar vendida"]);
    },
  },
  {
    id: "EASE-814",
    async run(t) {
      const { seller, listing } = one(t);
      e.reserve(t, seller, listing.id, 2);
      age(listing.id, "1 minute");
      runJob();
      t.check(notices(seller.id, "listing_reservation_ended").filter((n) => !n.read_at).length === 1, "the ended period asked ¿Se vendió?");
      const page = await t.page({ as: seller.email });
      await t.goto(page, "/mi-cuenta/publicaciones");
      const row = rowOf(page, listing.title);
      t.check(/Terminó la reserva/.test(norm(await row.innerText())), `the row reads "${(/Terminó la reserva[^\n]*/.exec(norm(await row.innerText())) || [""])[0].slice(0, 80)}"`);
      const pressed = Date.now();
      await row.getByRole("button", { name: "Reservar otra vez" }).click();
      await chooseDays(page, "1 día");
      const now = await x.until(() => { const p = period(listing.id); return p && !p.ended_at ? p : null; }, { timeout: 10_000 });
      t.check(now && Math.abs(Date.parse(now.reserved_at) - pressed) < 30_000 && Date.parse(now.reserved_until) - Date.parse(now.reserved_at) === 86_400_000, "a new 1-day period starts from now");
      t.check(notices(seller.id, "listing_reservation_ended").every((n) => n.read_at), "the earlier ¿Se vendió? notice is marked read");
      await t.shot(page, "again");
    },
  },
  {
    id: "EASE-815",
    async run(t) {
      x.ciAsserts(t, RES_SQL, ["the job closes the period of a hidden listing", "quietly"]);
      const own = e.particularListings(t, { count: 4 });
      const buyer = t.account({ kind: "buyer" });
      for (const item of own.listings) {
        e.reserve(t, own.seller, item.id, 2);
        watch(t, buyer, item.id);
      }
      const [sold, hidden, archived, admin] = own.listings;
      h.sqlAs(own.seller.id, `select public.set_owned_listing_lifecycle(${L(hidden.id)}, 'hide') as r`);
      h.exec(`update public.listings set status = 'sold', sold_at = now() where id = ${L(sold.id)}`);
      h.exec(`update public.listings set status = 'archived' where id = ${L(archived.id)}`);
      h.exec(`update public.listings set status = 'hidden' where id = ${L(admin.id)}`);
      runJob();
      for (const [name, item] of [["sold", sold], ["hidden", hidden], ["archived", archived], ["hidden by an admin", admin]]) {
        t.check(period(item.id) === null && watchers(item.id) === 0, `${name}: the period and the requests are gone`);
      }
      const soldNotices = notices(buyer.id, "listing_reservation_sold");
      t.check(soldNotices.length === 1 && soldNotices[0].listing_id === sold.id, "the person waiting hears Se vendió only for the one that sold");
      t.check(mails(buyer.id, "listing_reservation_sold").length === 0 && notices(buyer.id, "listing_released").length === 0, "in the app only; the others end quietly");
    },
  },
  {
    id: "EASE-816",
    async run(t) {
      const { seller, listing } = one(t);
      e.reserve(t, seller, listing.id, 2);
      const buyer = t.account({ kind: "buyer" });
      const page = await t.page({ as: buyer.email });
      await t.goto(page, listing.path);
      const on = page.getByRole("button", { name: "Avísame si se libera" }).first();
      await on.waitFor({ timeout: 15_000 });
      await on.click();
      await page.getByText("Te avisaremos").first().waitFor({ timeout: 10_000 }).catch(() => {});
      t.check(await page.getByText("Te avisaremos").count() > 0 && await page.getByRole("button", { name: "Cancelar aviso" }).count() > 0, "a buyer turns it on: Te avisaremos · Cancelar aviso");
      t.check(watchers(listing.id) === 1, "the request is saved");
      await t.shot(page, "on");
      await page.reload();
      await page.getByRole("button", { name: "Cancelar aviso" }).first().waitFor({ timeout: 15_000 }).catch(() => {});
      t.check(await page.getByRole("button", { name: "Cancelar aviso" }).count() > 0, "it survives a reload");
      await page.getByRole("button", { name: "Cancelar aviso" }).first().click();
      await page.getByRole("button", { name: "Avísame si se libera" }).first().waitFor({ timeout: 10_000 }).catch(() => {});
      t.check(watchers(listing.id) === 0 && await page.getByRole("button", { name: "Avísame si se libera" }).count() > 0, "and off");
      const visitor = await t.page();
      await t.goto(visitor, listing.path);
      const login = visitor.getByRole("link", { name: "Ingresa para que te avisemos si se libera" }).first();
      await login.waitFor({ timeout: 15_000 }).catch(() => {});
      const href = (await login.count()) ? await login.getAttribute("href") : null;
      t.check(href && decodeURIComponent(href).includes(listing.path), `a visitor sees Ingresa para que te avisemos si se libera (${href})`);
      await t.shot(visitor, "visitor");
      const owner = await t.page({ as: seller.email });
      await t.goto(owner, listing.path);
      await h.sleep(2_000);
      t.check(await owner.getByRole("button", { name: "Avísame si se libera" }).count() === 0 && await owner.getByRole("link", { name: /Ingresa para que te avisemos/ }).count() === 0, "the owner sees no button");
    },
  },
  {
    id: "EASE-817",
    async run(t) {
      x.ciAsserts(t, RES_SQL, ["RELEASE_WATCH_UNAVAILABLE", "RELEASE_WATCH_OWN_LISTING"]);
      x.ciAsserts(t, RES_TEST, ["409"]);
    },
  },
  {
    id: "EASE-818",
    async run(t) {
      x.ciAsserts(t, RES_SQL, ["has_table_privilege('anon', 'public.listing_reservations', 'select')", "select * from public.listing_release_watches",
        "a hidden listing shows no period", "a buyer has no periods of their own", "get_reserved_listings"]);
    },
  },
  {
    id: "EASE-819",
    async run(t) {
      x.ciAsserts(t, RES_SQL, ["release_watches", "account_anonymizations", "and the count is recorded with the rest"]);
    },
  },
  {
    id: "EASE-820",
    async run(t) {
      x.ciAsserts(t, RES_SQL, ["email_max_age('listing_released') = interval '2 days'", "email_max_age('listing_reservation_ended') = interval '3 days'", "email_priority"]);
      x.ciAsserts(t, RES_TEST, ["Se liberó una publicación que esperabas", "¿Se vendió"]);
    },
  },
  {
    id: "EASE-821",
    async run(t) {
      x.ciAsserts(t, RES_TEST, ["Se liberó una reserva", "Se vendió lo que esperabas"]);
    },
  },
  {
    id: "EASE-822",
    async run(t) {
      x.ciAsserts(t, RES_TEST, [RESERVED_LINE]);
    },
  },
  {
    id: "EASE-823",
    async run(t) {
      x.ciAsserts(t, RES_TEST, ["6:30", "a la 1:05", "jue 29 oct", "«mañana»"]);
    },
  },
  {
    id: "EASE-824",
    async run(t) {
      x.ciAsserts(t, RES_TEST, ["Hacer una oferta"]);
      x.ciAsserts(t, RES_TEST, ["listing\\.price_pen !== null && listing\\.price_pen > 0"]);
      const own = e.particularListings(t, { count: 3 });
      const [open, sold, held] = own.listings;
      h.exec(`update public.listings set status = 'sold', sold_at = now() where id = ${L(sold.id)}`);
      e.reserve(t, own.seller, held.id, 2);
      const noPrice = x.attemptExec(`update public.listings set price_pen = null where id = ${L(open.id)}`);
      t.check(!noPrice.ok, `a published listing cannot lose its price (${noPrice.error}), so "without a price" rests on the page's condition above`);
      const { owner, store } = x.inventoryStore();
      const shop = t.listing(owner, { storeRow: store, title: `Guitarra ${own.word} tienda` });
      const page = await t.page();
      const cases = [["a published Particular listing with a price", open, true], ["a sold listing", sold, false], ["a reserved listing", held, false],
        ["a store listing", shop, false]];
      for (const [name, item, expected] of cases) {
        await t.goto(page, item.path);
        await page.locator("main h1").first().waitFor({ timeout: 15_000 }).catch(() => {});
        const shown = await page.getByRole("button", { name: "Hacer una oferta" }).count() > 0;
        t.check(shown === expected, `${name}: ${shown ? "shows" : "no"} Hacer una oferta`);
      }
    },
  },
  {
    id: "EASE-825",
    async run(t) {
      x.ciAsserts(t, RES_TEST, ["1900", "1800", "1700", "Precio publicado"]);
    },
  },
  {
    id: "EASE-826",
    async run(t) {
      const { seller, listing } = one(t, { prices: [2000] });
      const page = await t.page({ phone: true });
      const posts = [];
      page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/contact") posts.push(request.postData()); });
      await t.goto(page, listing.path);
      await page.getByRole("button", { name: "Hacer una oferta" }).click();
      const sheet = page.getByRole("dialog").filter({ hasText: "Precio publicado" });
      await sheet.waitFor({ timeout: 10_000 });
      await sheet.getByRole("button", { name: "S/ 1,900" }).click();
      await x.control(sheet, "Enviar oferta por WhatsApp").click();
      const safety = x.safetySheet(page);
      await safety.waitFor({ timeout: 10_000 }).catch(() => {});
      t.check(await safety.count() === 1, "from S/ 1,000 the safety sheet shows first");
      await t.shot(page, "safety");
      const popup = await x.popupOf(page, () => x.control(safety, "Continuar a WhatsApp").click());
      const url = new URL(popup.url());
      const text = t.whatsappText(popup.url());
      t.check(url.href.includes(seller.phone), `wa.me opens with the seller's number (${url.pathname})`);
      t.check(/^Hola, te ofrezco S\/\s1,900 por tu .+ publicado en Laria: \S+\/instrumentos\/\S+$/.test(text) && text.includes(listing.slug), `the message: "${text}"`);
      t.check(!/¿Sigue disponible\?|¿Incluye|¿Acepta/.test(text), "without the quick questions");
      await h.sleep(800);
      t.check(posts.length === 1, `the contact is recorded (${posts.length} post to /api/contact)`);
      const events = await x.until(() => {
        const rows = h.sql(`select source, metadata from public.marketplace_events where listing_id = ${L(listing.id)} and event_type = 'whatsapp_contact'`);
        return rows.length ? rows : null;
      }, { timeout: 15_000 }) || [];
      t.check(events.length === 1, `like the main button's (${JSON.stringify(events[0] || {})})`);
      await popup.close();
      // The offer sheet stays open behind WhatsApp; close it and make the offer again.
      if (await sheet.count()) await sheet.getByRole("button", { name: "Cerrar", exact: true }).last().click();
      await page.getByRole("button", { name: "Hacer una oferta" }).click();
      await sheet.waitFor({ timeout: 10_000 });
      await sheet.getByRole("button", { name: "S/ 1,800" }).click();
      const again = await x.popupOf(page, () => x.control(sheet, "Enviar oferta por WhatsApp").click());
      t.check(await x.safetySheet(page).count() === 0 && /wa\.me|whatsapp/.test(again.url()), "the safety sheet shows once per browser");
    },
  },
  {
    id: "EASE-827",
    async run(t) {
      x.ciAsserts(t, RES_TEST, ["puts the amount in the message and opens WhatsApp with that text alone"]);
      const { listing } = one(t, { prices: [900] });
      const page = await t.page({ phone: true });
      const seen = [];
      page.context().on("request", (request) => seen.push({ url: request.url(), body: request.postData() || "" }));
      await t.goto(page, listing.path);
      await page.getByRole("button", { name: "Hacer una oferta" }).click();
      const sheet = page.getByRole("dialog").filter({ hasText: "Precio publicado" });
      await sheet.waitFor({ timeout: 10_000 });
      await sheet.getByLabel("Tu oferta").fill("837");
      const popup = await x.popupOf(page, () => x.control(sheet, "Enviar oferta por WhatsApp").click());
      t.check(/837/.test(t.whatsappText(popup.url())), "the offer is in the WhatsApp message");
      await h.sleep(1_000);
      const carrying = seen.filter((request) => !/wa\.me|whatsapp\.com/.test(new URL(request.url).hostname) && /837/.test(`${decodeURIComponent(request.url)} ${request.body}`));
      t.check(carrying.length === 0, `no request to Laria carries the amount${carrying.length ? ` (${carrying.map((r) => r.url).join(", ")})` : ""}`);
      const contact = seen.filter((request) => new URL(request.url).pathname === "/api/contact");
      const keys = contact.map((request) => Object.keys(JSON.parse(request.body || "{}")).sort().join(","));
      t.check(contact.length === 1 && !/amount|offer|oferta|price/.test(keys[0]), `/api/contact receives identity and source only (${keys[0]})`);
      const stored = h.sql(`select count(*)::int as n from public.marketplace_events where listing_id = ${L(listing.id)} and metadata::text like '%837%'`)[0].n
        + h.sql(`select count(*)::int as n from public.notifications where listing_id = ${L(listing.id)} and message like '%837%'`)[0].n;
      t.check(stored === 0, "no event or notice stores it");
    },
  },
  {
    id: "EASE-828",
    async run(t) {
      x.ciAsserts(t, RES_TEST, ["Es el precio publicado o más", "Una oferta muy por debajo del precio suele quedarse sin respuesta"]);
    },
  },
  {
    id: "EASE-829",
    async run(t) {
      const { listing } = one(t, { prices: [2000] });
      for (const options of [{ phone: true }, { width: 1366 }]) {
        const width = options.phone ? 390 : 1366;
        const page = await t.page(options);
        await t.goto(page, listing.path);
        const opener = page.getByRole("button", { name: "Hacer una oferta" }).first();
        await opener.click();
        const sheet = page.getByRole("dialog").filter({ hasText: "Precio publicado" });
        await sheet.waitFor({ timeout: 10_000 });
        await h.sleep(500);
        const box = await sheet.boundingBox();
        const view = page.viewportSize();
        if (options.phone) t.check(box && Math.abs(box.y + box.height - view.height) < 3 && box.width >= view.width - 2, `390 px: a bottom sheet (${Math.round(box?.y)}+${Math.round(box?.height)} of ${view.height})`);
        else t.check(box && Math.abs(box.x + box.width / 2 - view.width / 2) < 4 && box.y > 8 && box.y + box.height < view.height - 8, `1366 px: a centered dialog (${Math.round(box?.x)},${Math.round(box?.y)} ${Math.round(box?.width)}x${Math.round(box?.height)})`);
        t.check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width} px: no horizontal scroll`);
        const chips = sheet.getByRole("button", { name: /^S\/ [\d,]+$/ });
        const pressedBefore = await chips.first().getAttribute("aria-pressed");
        await chips.first().click();
        const pressedAfter = await chips.first().getAttribute("aria-pressed");
        t.check(pressedBefore === "false" && pressedAfter === "true", `${width} px: the amount chips are pressed buttons (${pressedBefore} → ${pressedAfter})`);
        const small = await sheet.evaluate((node) => [...node.querySelectorAll("button, input, a, textarea")].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.width < 24 || r.height < 24);
        }).map((el) => `${el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`));
        t.check(small.length === 0, `${width} px: every control is at least 24 px${small.length ? ` (${small.join("; ")})` : ""}`);
        await t.shot(page, `${width}-sheet`);
        await page.keyboard.press("Escape");
        await h.sleep(400);
        const focused = () => page.evaluate(() => {
          const node = document.activeElement;
          if (!node || node === document.body) return "the page itself (body)";
          return `${node.tagName.toLowerCase()} "${(node.getAttribute("aria-label") || node.textContent).trim().slice(0, 40)}"`;
        });
        let focus = await focused();
        t.check(await sheet.count() === 0 && /^button "Hacer una oferta"/.test(focus), `${width} px: Esc returns focus to Hacer una oferta (focus on ${focus})`);
        await opener.click();
        await sheet.waitFor({ timeout: 10_000 });
        await sheet.getByRole("button", { name: "Cerrar", exact: true }).last().click();
        await h.sleep(400);
        focus = await focused();
        t.check(/^button "Hacer una oferta"/.test(focus), `${width} px: Cerrar returns focus to Hacer una oferta (focus on ${focus})`);
        await opener.click();
        await sheet.waitFor({ timeout: 10_000 });
        const order = [];
        for (let step = 0; step < 12; step += 1) {
          await page.keyboard.press("Tab");
          order.push(await page.evaluate(() => (document.activeElement?.closest('dialog, [role="dialog"]') ? "in" : "out")));
        }
        t.check(order.every((where) => where === "in"), `${width} px: Tab stays in the sheet`);
      }
    },
  },
];
