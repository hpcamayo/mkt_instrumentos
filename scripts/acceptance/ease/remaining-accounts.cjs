"use strict";
const h = require("./harness.cjs"), { until } = require("./d-helpers.cjs");
const L = h.literal, cases = [];
const favorite = (page, id) => page.locator('[data-favorite-listing="' + id + '"] button:visible').first();
async function publicItem(t, page) {
  if (!t.live) return t.listing(t.account({ kind: "particular" }));
  await t.goto(page, "/listados");
  const response = await page.request.get(t.url("/api/public-cards"));
  if (!response.ok()) throw new Error("public card fixture unavailable");
  const item = (await response.json()).cards.find((c) => c.availability === "approved");
  if (!item) t.skip("no public approved listing");
  return { ...item, path: "/instrumentos/" + item.slug };
}
function alert(t, owner, filters = { category: "guitars" }) {
  return t.sqlAs(owner.id, "select public.create_saved_search_alert(" + L(JSON.stringify(filters)) + "::jsonb, 'daily') as r")[0].r;
}
function queryAlerts(t, owner) { return t.sql("select * from public.saved_search_alerts where user_id=" + L(owner.id) + " and deleted_at is null"); }
cases.push({ id: "EASE-203", live: true, run: async (t) => {
  const page = await t.page(), item = await publicItem(t, page);
  await t.goto(page, item.path); await favorite(page, item.id).click();
  await page.getByText("Guardado en este dispositivo. Con una cuenta lo verás también en otros dispositivos.", { exact: true }).waitFor();
  t.check(new URL(page.url()).pathname === item.path, "saving a visitor favorite never asks for sign-in");
  t.check(await favorite(page, item.id).getAttribute("aria-pressed") === "true", "the heart is pressed");
  await t.goto(page, "/favoritos");
  await page.getByRole("link", { name: item.title, exact: true }).first().waitFor();
  t.check(await page.evaluate((id) => JSON.parse(localStorage.getItem("laria:favoritos") || "[]").some((r) => r.id === id), item.id), "the favorite persists on this device");
  await t.shot(page, "device-favorite");
}});
cases.push({ id: "EASE-204", run: async (t) => {
  const seller = t.account({ kind: "particular" }), buyer = t.account({ kind: "buyer" }), item = t.listing(seller), page = await t.page();
  await t.goto(page, item.path); await favorite(page, item.id).click();
  await t.signIn(page, buyer.email, { next: "/mi-cuenta/favoritos" });
  t.check(await until(() => t.sql("select listing_id from public.favorites where user_id=" + L(buyer.id)).some((r) => r.listing_id === item.id)), "sign-in merges the device favorite into this account");
  await page.getByText(/Guardamos 1 favorito/).waitFor();
  t.check(true, "the merge notice gives the count");
  t.check(await page.evaluate(() => JSON.parse(localStorage.getItem("laria:favoritos") || "[]").length === 0), "the merged device list is cleared");
  const other = await t.page({ as: buyer.email, phone: true });
  await t.goto(other, "/mi-cuenta/favoritos"); await other.getByRole("link", { name: item.title, exact: true }).first().waitFor();
  t.check(true, "the favorite appears in a separate browser");
}});
cases.push({ id: "EASE-205", live: true, run: async (t) => {
  const page = await t.page(), item = await publicItem(t, page);
  await t.goto(page, item.path); await favorite(page, item.id).click();
  await page.evaluate(() => { localStorage.setItem("laria:descubrir-ocultos", JSON.stringify([{ slug: "prueba-oculta", at: Date.now() }])); document.cookie = "laria_visita_anterior=" + (Date.now() - 3600000) + "; Path=/"; });
  await t.goto(page, "/favoritos"); await page.getByRole("button", { name: "Borrar lo guardado en este dispositivo" }).click();
  await page.getByRole("alertdialog").waitFor();
  t.check(await page.evaluate(() => Boolean(localStorage.getItem("laria:favoritos"))), "the confirmation does not clear anything before acceptance");
  await page.getByRole("alertdialog").getByRole("button", { name: "Borrar", exact: true }).click();
  await page.getByRole("heading", { name: "Todavía no guardaste nada" }).waitFor();
  const state = await page.evaluate(() => ({ keys: ["laria:favoritos", "laria:vistos", "laria:descubrir-ocultos"].filter((key) => localStorage.getItem(key)), cookies: document.cookie.split("; ").filter((v) => /^laria_(ultima_visita|visita_anterior)=/.test(v)) }));
  t.check(state.keys.length === 0 && state.cookies.length === 0, "confirmation clears favorites, viewed/hidden items and visit cookies: " + JSON.stringify(state));
}});
cases.push({ id: "EASE-206", run: async (t) => {
  const buyer = t.account({ kind: "buyer" }), page = await t.page();
  await t.goto(page, "/listados?category=guitars&brand=Fender");
  await page.getByRole("link", { name: "Crear alerta", exact: true }).first().click(); await page.waitForURL(/\/login/);
  const next = new URL(page.url()).searchParams.get("next");
  t.check(next && next.includes("category=guitars"), "the sign-in link preserves the intended search");
  await t.signIn(page, buyer.email, { next }); await page.getByText("Alerta creada para esta búsqueda.", { exact: true }).waitFor();
  t.check(await until(() => queryAlerts(t, buyer).length === 1), "returning from sign-in creates exactly one alert");
  await page.reload(); await page.waitForTimeout(700);
  t.check(queryAlerts(t, buyer).length === 1, "reload does not replay the consumed alert intent");
}});
cases.push({ id: "EASE-207", run: async (t) => {
  const buyer = t.account({ kind: "buyer" }), item = t.listing(t.account({ kind: "particular" })), page = await t.page();
  await t.goto(page, item.path); await page.getByRole("link", { name: /Ingresa para reportar publicación/i }).click(); await page.waitForURL(/\/login/);
  t.check(new URL(page.url()).searchParams.get("next") === item.path, "report sign-in keeps the same target");
  await t.signIn(page, buyer.email, { next: item.path }); await page.getByRole("button", { name: "Enviar reporte", exact: true }).waitFor();
  t.check(await page.getByLabel("Motivo", { exact: true }).isVisible(), "returning from sign-in opens the report form for the same listing");
  t.check((await page.getByRole("heading", { level: 1 }).innerText()).includes(item.title), "the target listing remains visible");
  await page.getByRole("button", { name: "Cancelar", exact: true }).last().click();
  t.note("The report was opened and cancelled; nothing was submitted to moderation.");
}});
cases.push({ id: "EASE-210", live: true, run: async (t) => {
  const page = await t.page(), item = await publicItem(t, page);
  await t.goto(page, "/login?next=" + encodeURIComponent(item.path) + "&motivo=favorito");
  t.check(await page.getByText("Ingresa para guardar «" + item.title + "»", { exact: true }).isVisible(), "sign-in explains the favorite intent with the listing title");
  const image = page.locator("main img").first();
  t.check(await image.count() > 0 && await until(() => image.evaluate((img) => img.complete && img.naturalWidth > 0), {timeout:15000}), "the listing photo loads on the reason panel");
}});
cases.push({ id: "EASE-211", liveAccounts: false, run: async (t) => {
  const seller = t.account({ kind: "particular" }), buyer = t.account({ kind: "buyer" }), old = t.listing(seller, { publishedDaysAgo: 3 });
  t.listing(seller); t.exec("insert into public.favorites(user_id,listing_id) values (" + L(buyer.id) + "," + L(old.id) + ")");
  const page = await t.page({ as: buyer.email }), previous = Date.now() - 3600000;
  await page.context().addCookies([{ name: "laria_ultima_visita", value: String(previous), url: t.base }]);
  await t.goto(page, "/mi-cuenta/favoritos");
  const chip = page.locator('[aria-label="Nuevo desde tu última visita"] a').filter({ hasText: /[0-9]+ en Guitarras/ });
  t.check(await chip.count() > 0, "favorites offers new publications in the favorite category since the prior visit");
  t.check((await page.context().cookies()).some((c) => c.name === "laria_visita_anterior" && c.value === String(previous)), "the 30-minute visit gap keeps the previous visit");
  await t.shot(page, "new-since-visit");
}});
cases.push({ id: "EASE-212", run: async (t) => {
  const buyer = t.account({ kind: "buyer" }); alert(t, buyer);
  const page = await t.page({ as: buyer.email }); await t.goto(page, "/mi-cuenta/alertas"); await page.getByRole("button", { name: "Editar", exact: true }).first().click();
  t.check(await page.getByRole("radio", { name: /Resumen diario/ }).isChecked(), "daily is the initial frequency");
  await page.getByLabel("Nombre", { exact: false }).fill("Mi guitarra de prueba"); await page.getByRole("radio", { name: /Al instante/ }).check();
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  t.check(await until(() => { const r = queryAlerts(t, buyer)[0]; return r.name === "Mi guitarra de prueba" && r.frequency === "immediate"; }), "name and instant frequency persist");
  await page.reload(); t.check(await page.getByText("Mi guitarra de prueba", { exact: true }).isVisible(), "the saved alert name survives reload");
}});
cases.push({ id: "EASE-220", run: async (t) => {
  const buyer = t.account({ kind: "buyer" }); alert(t, buyer);
  const page = await t.page({ as: buyer.email }); await t.goto(page, "/mi-cuenta/correos");
  for (const [label, column] of [["Bajas de precio de mis favoritos", "price_drop_emails"], ["Resumen semanal de lo que sigo", "follow_digest_emails"]]) {
    const checkbox = page.getByRole("checkbox", { name: label }), before = await checkbox.isChecked(); await checkbox.setChecked(!before);
    t.check(await until(() => t.sql("select " + column + " as v from public.email_preferences where user_id=" + L(buyer.id))[0]?.v === !before), label + " saves the selected setting");
  }
  await page.getByRole("button", { name: "Pausar todas", exact: true }).click(); await page.getByRole("alertdialog").getByRole("button", { name: "Pausar alertas", exact: true }).click();
  t.check(await until(() => queryAlerts(t, buyer).every((a) => a.status === "paused")), "the confirmed action pauses all alerts");
}});
cases.push({ id: "EASE-222", run: async (t) => {
  const seller = t.account({ kind: "particular" }), buyer = t.account({ kind: "buyer" }), active = t.listing(seller), sold = t.listing(seller, { status: "sold" });
  t.exec("insert into public.favorites(user_id,listing_id) values (" + L(buyer.id) + "," + L(active.id) + "),(" + L(buyer.id) + "," + L(sold.id) + ")");
  const page = await t.page({ as: buyer.email }); await t.goto(page, "/mi-cuenta/favoritos");
  t.check(await page.getByRole("link", { name: "Contactar por WhatsApp", exact: true }).count() === 1, "the available favorite offers WhatsApp");
  t.check(await page.getByRole("link", { name: "Ver similares disponibles", exact: true }).count() === 1, "the sold favorite offers similar available listings");
  t.check(await page.getByRole("button", { name: "Crear alerta parecida", exact: true }).count() === 1, "the sold favorite offers a similar alert");
}});
cases.push({ id: "EASE-223", run: async (t) => {
  const seller = t.account({ kind: "particular" }), buyer = t.account({ kind: "buyer" }), item = t.listing(seller);
  t.exec("select public.create_account_notification(" + L(buyer.id) + ", 'listing_approved', " + L(item.id) + ", null) from generate_series(1,51)");
  t.exec("insert into public.favorites(user_id,listing_id,saved_price_pen) values (" + L(buyer.id) + "," + L(item.id) + ",1500)");
  t.sqlAs(seller.id, "select public.set_owned_listing_price(" + L(item.id) + ",1100) as r");
  const page = await t.page({ as: buyer.email }); await t.goto(page, "/mi-cuenta/notificaciones");
  t.check(await page.locator("main ol > li h2").count() === 50, "the first notification page contains 50 rows");
  t.check(await page.getByText("«" + item.title + "» bajó de", { exact: false }).count() > 0, "the price-drop notification names the listing");
  await page.getByRole("link", { name: "Anteriores", exact: true }).click(); await page.waitForURL(/page=2/);
  t.check(await page.locator("main ol > li h2").count() === 2, "the remaining notifications appear on page two");
  await page.getByRole("button", { name: "Marcar todo como leído", exact: true }).click();
  t.check(await until(() => t.notifications(buyer.id).every((n) => n.read_at)), "mark all read updates all pages");
  t.note("The fresh ux-accounts-saving SQL suite also exercises one in-app notification per alert match.");
}});
module.exports = cases;
