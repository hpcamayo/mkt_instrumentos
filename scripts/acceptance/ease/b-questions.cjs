// Group B, listing questions (EASE-170..179): asking, the contact-detail filter and limits, the seller's one answer,
// notifications and the seller's e-mail, reporting, admin hide/restore, the signed-out and sold states, and the form's
// feedback. Each case makes its own accounts and listings (harness.cjs); 178 also runs live, signed out.
"use strict";
const b = require("./b-util.cjs");

const CONTACT = "No escribas números de teléfono, enlaces ni correos. Las preguntas y respuestas son públicas; para hablar con quien vende, usa el botón de contacto.";
const ASKED = "Publicamos tu pregunta. Te avisaremos cuando la respondan.";
const ANSWERED = "Publicamos tu respuesta. Quien preguntó recibirá un aviso.";
const EMPTY = "Aún no hay preguntas. Pregunta lo que necesites saber; la respuesta queda para todos.";
const SOLD = "Esta publicación se vendió. Las preguntas quedan como referencia y ya no reciben respuestas.";

// "Preguntas" once its questions have loaded (or once it left the page, as on a sold listing with none).
async function questionsLoaded(page) {
  await page.waitForFunction(() => {
    const section = document.querySelector("section#preguntas");
    return !section || !/Cargando preguntas…/.test(section.textContent || "");
  }, null, { timeout: 45_000 });
  return page.locator("section#preguntas");
}

const items = (section) => section.locator("ol > li");
const itemFor = (section, text) => items(section).filter({ hasText: text });

// A question asked through the database function, as the account (the page's own route calls the same function).
function ask(t, user, listingId, body) {
  const [row] = t.sqlAs(user.id, `select public.ask_listing_question(${t.literal(listingId)}, ${t.literal(body)}) as asked`);
  return row.asked.id;
}

// A call that should fail, as the account (anon with id null; admin: an admin's claims), in a transaction that is
// rolled back: its error text, or null when the database let it through.
function refused(t, user, statement, { admin = false } = {}) {
  const claims = user.id
    ? { sub: user.id, role: "authenticated", aal: "aal2", ...(admin ? { app_metadata: { role: "admin" } } : {}) }
    : { role: "anon" };
  try {
    b.rolledBack(`set local role ${user.id ? "authenticated" : "anon"};
      select set_config('request.jwt.claims', ${t.literal(JSON.stringify(claims))}, true);
      ${statement};`);
    return null;
  } catch (error) {
    return String(error.stderr || error.message).replace(/\s+/g, " ");
  }
}

// A POST to the questions route from the page (same origin, with the page's session).
async function post(page, payload) {
  return page.evaluate(async (body) => {
    const response = await fetch("/api/listing-questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, payload);
}

// Console errors, warnings and page errors that speak of hydration (React's minified #418/#423/#425 included).
function watchHydration(page) {
  const seen = [];
  page.on("console", (message) => {
    if (/hydrat|Minified React error #4(18|19|23|25)/i.test(message.text())) seen.push(`${message.type()}: ${message.text().slice(0, 200)}`);
  });
  page.on("pageerror", (error) => {
    if (/hydrat|Minified React error #4(18|19|23|25)/i.test(error.message)) seen.push(`pageerror: ${error.message.slice(0, 200)}`);
  });
  return seen;
}

module.exports = [
  {
    id: "EASE-170",
    async run(t) {
      const seller = t.account({ kind: "particular" });
      const item = t.listing(seller, { photos: 1 });
      const earlier = t.account({ kind: "buyer", name: "Lucía Paredes" });
      ask(t, earlier, item.id, "¿Sigue disponible?");
      const buyer = t.account({ kind: "buyer", name: "Rodrigo Castañeda" });

      const page = await t.page({ as: buyer.email });
      await t.goto(page, item.path);
      const section = await questionsLoaded(page);
      const body = "¿Incluye estuche y correa?";
      await section.getByLabel("Haz una pregunta").fill(body);
      const sent = Date.now();
      await section.getByRole("button", { name: "Enviar pregunta" }).click();
      await section.getByText(ASKED).waitFor({ timeout: 20_000 });
      await itemFor(section, body).waitFor({ timeout: 10_000 });
      const shownAfter = Date.now() - sent;
      const mine = await items(section).allInnerTexts();
      t.check(mine.length === 2 && mine[0].includes("Tu pregunta") && mine[0].includes(body) && mine[1].includes("¿Sigue disponible?"),
        `the buyer's question shows at once (${shownAfter} ms, no reload) at the top, marked Tu pregunta, above the earlier one`);
      t.check(shownAfter < 5_000 && page.url().endsWith(item.path), "shown within the same page, without a reload");
      await t.shot(page, "buyer", { fullPage: false });
      await section.scrollIntoViewIfNeeded();
      await t.shot(page, "buyer-section");

      const [row] = t.sql(`select body, asker_user_id, status from public.listing_questions where listing_id = ${t.literal(item.id)} and asker_user_id = ${t.literal(buyer.id)}`);
      t.check(row?.body === body && row.status === "visible", "stored once, visible");

      const visitor = await t.page({ phone: true });
      await t.goto(visitor, item.path);
      const publicSection = await questionsLoaded(visitor);
      const seen = await items(publicSection).allInnerTexts();
      t.check(seen[0]?.includes("Pregunta de Rodrigo C.") && seen[0].includes(body), `a visitor sees it first as "Pregunta de Rodrigo C.": ${JSON.stringify(seen[0]?.split("\n").slice(0, 2))}`);
      t.check(seen[1]?.includes("Pregunta de Lucía P.") && seen[1].includes("¿Sigue disponible?"), "the earlier question is below it (newest first)");
      t.check(!(await visitor.locator("body").innerText()).includes("Castañeda"), "the full surname is not on the page");
      t.check(/2 preguntas/.test(await publicSection.innerText()), "the count reads 2 preguntas");
      await publicSection.scrollIntoViewIfNeeded();
      await t.shot(visitor, "visitor");
    },
  },
  {
    id: "EASE-171",
    async run(t) {
      const seller = t.account({ kind: "particular" });
      const item = t.listing(seller);
      const buyer = t.account({ kind: "buyer" });
      for (const text of ["¿Me escribes al 987 654 321?", "Llámame: 987.654-321 por favor", "Mira www.ejemplo.com ahora", "Mira https://ejemplo.org/x", "Escríbeme a ana@correo.com"]) {
        const error = refused(t, buyer, `select public.ask_listing_question(${t.literal(item.id)}, ${t.literal(text)})`);
        t.check(error?.includes(`QUESTION_CONTACT_DETAILS: ${CONTACT}`), `question "${text}" refused with the Spanish message`);
      }
      const question = ask(t, buyer, item.id, "¿Tiene algún golpe?");
      for (const text of ["Escríbeme al 999 888 777", "Mira www.ejemplo.pe", "Escríbeme a ana@correo.com"]) {
        const error = refused(t, seller, `select public.answer_listing_question(${t.literal(question)}, ${t.literal(text)})`);
        t.check(error?.includes(`QUESTION_CONTACT_DETAILS: ${CONTACT}`), `answer "${text}" refused with the Spanish message`);
      }
      const rows = t.sql(`select body, answer from public.listing_questions where listing_id = ${t.literal(item.id)}`);
      t.check(rows.length === 1 && rows[0].answer === null, `nothing refused was stored (${rows.length} question, no answer)`);

      // The page's route refuses the same text before the database, with the same message.
      const page = await t.page({ as: buyer.email });
      await t.goto(page, item.path);
      const response = await post(page, { action: "ask", listingId: item.id, body: "¿Me pasas tu número? 987 654 321" });
      t.check(response.status === 400 && response.body?.message === CONTACT, `the route answers 400 with the message (${response.status})`);
      t.check(t.sql(`select id from public.listing_questions where listing_id = ${t.literal(item.id)}`).length === 1, "still one question stored");
    },
  },
  {
    id: "EASE-172",
    async run(t) {
      const seller = t.account({ kind: "particular" });
      const item = t.listing(seller);
      const buyer = t.account({ kind: "buyer" });
      for (const text of ["¿Cuánto pesa?", "¿Es de 2019?", "¿Tiene estuche?"]) ask(t, buyer, item.id, text);
      const fourth = refused(t, buyer, `select public.ask_listing_question(${t.literal(item.id)}, '¿Tiene golpes?')`);
      t.check(fourth?.includes("QUESTION_PENDING_LIMIT: Ya tienes 3 preguntas sin responder en esta publicación. Espera una respuesta antes de hacer otra."), `a 4th unanswered question is refused: ${fourth?.slice(0, 160)}`);
      const other = t.listing(seller);
      t.check(Boolean(ask(t, buyer, other.id, "¿Sigue disponible?")), "another listing is a separate count");

      const busy = t.account({ kind: "buyer" });
      const elsewhere = t.listing(t.account({ kind: "particular" }));
      t.exec(`insert into public.listing_questions (listing_id, asker_user_id, body, answer, answered_at, created_at)
        select ${t.literal(elsewhere.id)}, ${t.literal(busy.id)}, '¿Pregunta número ' || n || '?', 'Respuesta.', now(), now() - interval '2 hours'
        from generate_series(1, 20) n`);
      const daily = refused(t, busy, `select public.ask_listing_question(${t.literal(item.id)}, '¿Sigue disponible?')`);
      t.check(daily?.includes("QUESTION_DAILY_LIMIT: Llegaste al límite de 20 preguntas por día. Vuelve a intentarlo mañana."), `a 21st question in 24 hours is refused: ${daily?.slice(0, 160)}`);

      const own = refused(t, seller, `select public.ask_listing_question(${t.literal(item.id)}, '¿Sigue disponible?')`);
      t.check(own?.includes("QUESTION_OWN_LISTING: No puedes preguntar en tu propia publicación."), "the seller cannot ask on their own listing");
      const owner = t.account({ kind: "store_owner" });
      const shop = t.store(owner);
      const storeItem = t.listing(owner, { storeRow: shop });
      const ownStore = refused(t, owner, `select public.ask_listing_question(${t.literal(storeItem.id)}, '¿Sigue disponible?')`);
      t.check(ownStore?.includes("QUESTION_OWN_LISTING"), "the store owner cannot ask on the store's listing");

      for (const status of ["pending", "sold"]) {
        const closed = t.listing(seller, { status });
        const error = refused(t, buyer, `select public.ask_listing_question(${t.literal(closed.id)}, '¿Sigue disponible?')`);
        t.check(error?.includes("QUESTION_LISTING_UNAVAILABLE: Esta publicación ya no recibe preguntas."), `a ${status} listing takes no questions`);
      }
    },
  },
  {
    id: "EASE-173",
    timeout: 360_000,
    async run(t) {
      const seller = t.account({ kind: "particular" });
      const item = t.listing(seller);
      const asker = t.account({ kind: "buyer", name: "Marta Quispe" });
      const question = ask(t, asker, item.id, "¿Tiene algún golpe o rayón?");
      const answer = "Sí, un rayón pequeño en la parte de atrás; nada más.";

      // Nobody but the seller gets Responder, and the route refuses them.
      const other = t.account({ kind: "buyer" });
      const admin = t.account({ kind: "admin" });
      for (const [label, user] of [["another account", other], ["the asker", asker], ["an admin", admin]]) {
        const page = await t.page({ as: user.email });
        await t.goto(page, item.path);
        const section = await questionsLoaded(page);
        await itemFor(section, "¿Tiene algún golpe").waitFor();
        t.check(await section.getByRole("button", { name: "Responder", exact: true }).count() === 0, `${label}: no Responder`);
        const response = await post(page, { action: "answer", listingId: item.id, questionId: question, answer: "Sí." });
        t.check(response.status === 403 && response.body?.message === "Solo quien vende puede responder esta pregunta.", `${label}: the route refuses (${response.status} ${response.body?.message})`);
        await page.context().close();
      }

      const page = await t.page({ as: seller.email });
      await t.goto(page, item.path);
      const section = await questionsLoaded(page);
      t.check(/Responde desde aquí/.test(await section.innerText()), "the seller sees the answer note");
      t.check(await section.getByLabel("Haz una pregunta").count() === 0, "the seller gets no question form");
      const entry = itemFor(section, "¿Tiene algún golpe");
      await entry.getByRole("button", { name: "Responder", exact: true }).click();
      await entry.getByLabel("Tu respuesta").fill(answer);
      await t.shot(page, "seller-answering");
      await entry.getByRole("button", { name: "Enviar respuesta" }).click();
      await section.getByText(ANSWERED).waitFor({ timeout: 20_000 });
      const shown = await entry.innerText();
      t.check(shown.includes("Respuesta de quien vende") && shown.includes(answer), "the answer shows under the question as Respuesta de quien vende");
      t.check(await entry.getByRole("button", { name: "Responder", exact: true }).count() === 0, "Responder is gone once answered");
      await t.shot(page, "seller-answered");
      const again = await post(page, { action: "answer", listingId: item.id, questionId: question, answer: "Otra respuesta." });
      t.check(again.status === 409 && again.body?.message === "Esta pregunta ya tiene respuesta.", `a second answer is refused (${again.status} ${again.body?.message})`);
      const [row] = t.sql(`select answer, answered_by from public.listing_questions where id = ${t.literal(question)}`);
      t.check(row.answer === answer && row.answered_by === seller.id, "one answer stored, by the seller");

      const visitor = await t.page({ phone: true });
      await t.goto(visitor, item.path);
      const seen = await questionsLoaded(visitor);
      const text = await itemFor(seen, "¿Tiene algún golpe").innerText();
      t.check(text.includes("Respuesta de quien vende") && text.includes(answer), "a later visitor sees the answer as Respuesta de quien vende");
      await itemFor(seen, "¿Tiene algún golpe").scrollIntoViewIfNeeded();
      await t.shot(visitor, "visitor");

      // A store listing: its store owner answers.
      const owner = t.account({ kind: "store_owner" });
      const shop = t.store(owner);
      const storeItem = t.listing(owner, { storeRow: shop, category: "pedals", type: "pedals", brand: "Boss", model: "DS-1" });
      const storeQuestion = ask(t, asker, storeItem.id, "¿Tiene caja original?");
      const ownerPage = await t.page({ as: owner.email });
      await t.goto(ownerPage, storeItem.path);
      const ownerSection = await questionsLoaded(ownerPage);
      const storeEntry = itemFor(ownerSection, "¿Tiene caja original?");
      await storeEntry.getByRole("button", { name: "Responder", exact: true }).click();
      await storeEntry.getByLabel("Tu respuesta").fill("Sí, con su caja y manual.");
      await storeEntry.getByRole("button", { name: "Enviar respuesta" }).click();
      await ownerSection.getByText(ANSWERED).waitFor({ timeout: 20_000 });
      const [storeRow] = t.sql(`select answer, answered_by from public.listing_questions where id = ${t.literal(storeQuestion)}`);
      t.check(storeRow.answer === "Sí, con su caja y manual." && storeRow.answered_by === owner.id, "the store owner answers the store listing's question");
      t.check((await storeEntry.innerText()).includes("Respuesta de quien vende"), "shown as Respuesta de quien vende on the store listing");
    },
  },
  {
    id: "EASE-174",
    timeout: 360_000,
    async run(t) {
      const seller = t.account({ kind: "particular" });
      const item = t.listing(seller);
      const buyer = t.account({ kind: "buyer", name: "Sofía Rojas" });
      const body = "¿El mástil está recto?";

      const buyerPage = await t.page({ as: buyer.email });
      await t.goto(buyerPage, item.path);
      const section = await questionsLoaded(buyerPage);
      await section.getByLabel("Haz una pregunta").fill(body);
      await section.getByRole("button", { name: "Enviar pregunta" }).click();
      await section.getByText(ASKED).waitFor({ timeout: 20_000 });
      const [question] = t.sql(`select id from public.listing_questions where listing_id = ${t.literal(item.id)}`);

      const asked = t.notifications(seller.id).filter((n) => n.event_type === "listing_question_asked");
      t.check(asked.length === 1, `one Te hicieron una pregunta notification for the seller (${asked.length})`);
      const deliveries = t.emails(`recipient_user_id = ${t.literal(seller.id)}`);
      t.check(deliveries.length === 1 && deliveries[0].dedupe_key === `listing_question:${question.id}` && deliveries[0].event_type === "listing_question_asked"
        && deliveries[0].notification_id === asked[0]?.id, `one queued e-mail for the seller, keyed by the question (${deliveries.map((d) => `${d.event_type}/${d.status}`).join(", ")})`);
      const mail = await b.renderDeliveries(deliveries.map((d) => d.id));
      const message = mail.messages[0];
      const link = `${t.base}/instrumentos/${item.slug}#preguntas`;
      t.check(mail.result?.sent === 1 && message?.subject === "Te hicieron una pregunta en Laria" && message.to === seller.email,
        `the worker renders it for the seller: "${message?.subject}"`);
      t.check((message?.html || "").includes(`href="${link}"`) && />\s*Responder\s*</.test(message?.html || ""), `its Responder opens ${link.replace(t.base, "")}`);
      t.check((message?.text || "").includes(`Responder: ${link}`), "the plain-text part has the same link");

      // Ver detalle on the seller's notification opens the listing at Preguntas.
      const sellerPage = await t.page({ as: seller.email });
      await t.goto(sellerPage, "/mi-cuenta/notificaciones");
      const notice = sellerPage.locator("li").filter({ hasText: "Te hicieron una pregunta" }).first();
      await notice.waitFor();
      await t.shot(sellerPage, "seller-notifications");
      await notice.getByRole("link", { name: "Ver detalle" }).click();
      await sellerPage.waitForURL((url) => url.pathname === item.path, { timeout: 30_000 });
      const sellerSection = await questionsLoaded(sellerPage);
      await sellerPage.waitForTimeout(800);
      const sellerView = await sellerPage.evaluate(() => ({ hash: location.hash, top: document.querySelector("section#preguntas")?.getBoundingClientRect().top ?? null, height: innerHeight }));
      // The notice links the listing by id (lib/notifications.ts); the page forwards it to its address, and the address
      // bar loses "#preguntas" on the way while the page still opens there.
      t.note(`Ver detalle (seller) ends on ${item.path}${sellerView.hash || " (no #preguntas in the address after the id-to-address redirect)"}`);
      t.check(sellerView.top !== null && sellerView.top >= -5 && sellerView.top < sellerView.height / 2, `Ver detalle opens the listing with Preguntas at the top of the screen (top ${Math.round(sellerView.top)} px)`);
      await t.shot(sellerPage, "seller-ver-detalle");

      // The answer: one notification for the asker, no e-mail.
      const entry = itemFor(sellerSection, body);
      await entry.getByRole("button", { name: "Responder", exact: true }).click();
      await entry.getByLabel("Tu respuesta").fill("Sí, recto y con la acción baja.");
      await entry.getByRole("button", { name: "Enviar respuesta" }).click();
      await sellerSection.getByText(ANSWERED).waitFor({ timeout: 20_000 });
      const answered = t.notifications(buyer.id).filter((n) => n.event_type === "listing_question_answered");
      t.check(answered.length === 1, `one Respondieron tu pregunta notification for the asker (${answered.length})`);
      t.check(t.emails(`recipient_user_id = ${t.literal(buyer.id)}`).length === 0, "no e-mail to the asker");
      t.check(t.emails(`recipient_user_id = ${t.literal(seller.id)}`).length === 1, "still one e-mail for the seller");

      await t.goto(buyerPage, "/mi-cuenta/notificaciones");
      const reply = buyerPage.locator("li").filter({ hasText: "Respondieron tu pregunta" }).first();
      await reply.waitFor();
      await reply.getByRole("link", { name: "Ver detalle" }).click();
      await buyerPage.waitForURL((url) => url.pathname === item.path, { timeout: 30_000 });
      await questionsLoaded(buyerPage);
      await buyerPage.waitForTimeout(800);
      const buyerView = await buyerPage.evaluate(() => ({ hash: location.hash, top: document.querySelector("section#preguntas")?.getBoundingClientRect().top ?? null, height: innerHeight }));
      t.note(`Ver detalle (asker) ends on ${item.path}${buyerView.hash || " (no #preguntas in the address)"}`);
      t.check(buyerView.top !== null && buyerView.top >= -5 && buyerView.top < buyerView.height / 2,
        `the asker's Ver detalle opens the listing at Preguntas too (top ${Math.round(buyerView.top ?? -1)} px)`);
      await t.shot(buyerPage, "asker-ver-detalle");
    },
  },
  {
    id: "EASE-175",
    async run(t) {
      const seller = t.account({ kind: "particular" });
      const item = t.listing(seller);
      const asker = t.account({ kind: "buyer", name: "Iván Torres" });
      const question = ask(t, asker, item.id, "¿Aceptas cambio por otra guitarra?");
      const reporter = t.account({ kind: "buyer" });

      const page = await t.page({ as: reporter.email });
      await t.goto(page, item.path);
      const section = await questionsLoaded(page);
      const entry = itemFor(section, "¿Aceptas cambio");
      await entry.getByRole("button", { name: "Reportar pregunta" }).click();
      await entry.getByLabel("Motivo").selectOption("spam");
      await entry.getByLabel("Detalle opcional").fill("Se repite en varias publicaciones.");
      await t.shot(page, "form");
      await entry.getByRole("button", { name: "Enviar reporte" }).click();
      await entry.getByText("Recibimos tu reporte. El equipo de moderación lo revisará.").waitFor({ timeout: 20_000 });
      const reports = t.sql(`select target_type, question_id, listing_id, reason, status from public.reports where reporter_user_id = ${t.literal(reporter.id)}`);
      t.check(reports.length === 1 && reports[0].target_type === "question" && reports[0].question_id === question && reports[0].listing_id === null && reports[0].reason === "spam",
        `Reportar pregunta files one report with target question (${JSON.stringify(reports[0])})`);

      await entry.getByRole("button", { name: "Reportar pregunta" }).click();
      await entry.getByLabel("Motivo").selectOption("otro");
      await entry.getByRole("button", { name: "Enviar reporte" }).click();
      await entry.getByText("Ya tienes un reporte abierto para este contenido.").waitFor({ timeout: 20_000 });
      t.check(t.sql(`select id from public.reports where reporter_user_id = ${t.literal(reporter.id)}`).length === 1, "a second open report by the same account is refused (Ya tienes un reporte abierto…)");
      await t.shot(page, "second");

      const askerPage = await t.page({ as: asker.email });
      await t.goto(askerPage, item.path);
      const askerSection = await questionsLoaded(askerPage);
      const own = itemFor(askerSection, "¿Aceptas cambio");
      t.check((await own.innerText()).includes("Tu pregunta") && await own.getByRole("button", { name: "Reportar pregunta" }).count() === 0, "the asker has no Reportar pregunta on their own question");
      const self = refused(t, asker, `select public.submit_content_report('question', ${t.literal(question)}, 'spam', null)`);
      t.check(self?.includes("REPORT_TARGET_UNAVAILABLE"), "and the database refuses the asker's own report");

      const admin = t.account({ kind: "admin" });
      t.sqlAs(admin.id, `select public.hide_listing_question(${t.literal(question)}, 'Prueba de aceptación') as ok`, { admin: true });
      const late = t.account({ kind: "buyer" });
      const hidden = refused(t, late, `select public.submit_content_report('question', ${t.literal(question)}, 'spam', null)`);
      t.check(hidden?.includes("REPORT_TARGET_UNAVAILABLE"), "a hidden question cannot be reported");
    },
  },
  {
    id: "EASE-176",
    timeout: 360_000,
    async run(t) {
      const seller = t.account({ kind: "particular" });
      const item = t.listing(seller);
      const asker = t.account({ kind: "buyer", name: "Pedro Salas" });
      const body = "¿Aceptas cambio por un bajo?";
      const question = ask(t, asker, item.id, body);
      const admin = t.account({ kind: "admin" });

      // Not for anyone else.
      const sellerPage = await t.page({ as: seller.email });
      await t.goto(sellerPage, item.path);
      const sellerSection = await questionsLoaded(sellerPage);
      await itemFor(sellerSection, body).waitFor();
      t.check(await sellerSection.getByRole("button", { name: "Ocultar", exact: true }).count() === 0, "the seller has no Ocultar");
      const sellerTry = await post(sellerPage, { action: "hide", listingId: item.id, questionId: question, reason: "No me gusta" });
      t.check(sellerTry.status === 403 && sellerTry.body?.message === "Solo moderación puede ocultar preguntas.", `the route refuses a non-admin (${sellerTry.status} ${sellerTry.body?.message})`);

      const page = await t.page({ as: admin.email });
      await t.goto(page, item.path);
      const section = await questionsLoaded(page);
      const entry = itemFor(section, body);
      await entry.getByRole("button", { name: "Ocultar", exact: true }).click();
      await entry.getByLabel("Motivo para ocultar").fill("Contenido repetido");
      await t.shot(page, "admin-hiding");
      await entry.getByRole("button", { name: "Ocultar pregunta" }).click();
      await section.getByText("Ocultamos la pregunta. Ya no se muestra en la publicación.").waitFor({ timeout: 20_000 });
      const hiddenText = await entry.innerText();
      t.check(/(^|\s)Oculta(\s|$)/m.test(hiddenText) && hiddenText.includes("Motivo: Contenido repetido"), "the admin still sees it, tagged Oculta with the reason");
      await entry.scrollIntoViewIfNeeded();
      await t.shot(page, "admin-hidden");

      const visitor = await t.page();
      await t.goto(visitor, item.path);
      const publicSection = await questionsLoaded(visitor);
      const publicText = await publicSection.innerText();
      t.check(!publicText.includes(body) && !publicText.includes("Contenido repetido") && publicText.includes(EMPTY), "a visitor no longer sees it (nor the reason)");
      await publicSection.scrollIntoViewIfNeeded();
      await t.shot(visitor, "visitor-hidden");

      await entry.getByRole("button", { name: "Mostrar", exact: true }).click();
      await entry.getByLabel("Motivo para mostrar").fill("Revisada, se puede mostrar");
      await entry.getByRole("button", { name: "Mostrar pregunta" }).click();
      await section.getByText("La pregunta vuelve a mostrarse en la publicación.").waitFor({ timeout: 20_000 });
      t.check(!/(^|\s)Oculta(\s|$)/m.test(await entry.innerText()) && await entry.getByRole("button", { name: "Ocultar", exact: true }).count() === 1, "Mostrar brings it back (no Oculta tag; Ocultar again)");
      await t.goto(visitor, item.path);
      const again = await questionsLoaded(visitor);
      t.check((await again.innerText()).includes(body), "a visitor sees it again");

      const audit = t.sql(`select action, admin_user_id, detail from public.admin_audit_actions where target_type = 'question' and target_id = ${t.literal(question)} order by created_at`);
      t.check(audit.length === 2 && audit[0].action === "question_hidden" && audit[1].action === "question_restored" && audit.every((row) => row.admin_user_id === admin.id),
        `both are in the admin audit: ${audit.map((row) => `${row.action} ${JSON.stringify(row.detail)}`).join("; ")}`);
      const [row] = t.sql(`select status, hidden_reason from public.listing_questions where id = ${t.literal(question)}`);
      t.check(row.status === "visible" && row.hidden_reason === null, "the question is visible again");
    },
  },
  {
    id: "EASE-177",
    async run(t) {
      const privileges = t.sql(`select role, privilege, has_table_privilege(role, 'public.listing_questions', privilege) as granted
        from unnest(array['anon', 'authenticated']) role, unnest(array['select', 'insert', 'update', 'delete']) privilege`);
      t.check(privileges.every((row) => !row.granted), `anon and authenticated have no table privilege on listing_questions (${privileges.filter((row) => row.granted).map((row) => `${row.role} ${row.privilege}`).join(", ") || "none"})`);
      const functions = t.sql(`select role, fn, has_function_privilege(role, fn, 'execute') as granted
        from unnest(array['anon', 'authenticated']) role, unnest(array['public.get_listing_questions(uuid)', 'public.ask_listing_question(uuid, text)',
          'public.answer_listing_question(uuid, text)', 'public.hide_listing_question(uuid, text)', 'public.restore_listing_question(uuid, text)']) fn`);
      const grant = (role, fn) => functions.find((row) => row.role === role && row.fn.startsWith(`public.${fn}(`))?.granted;
      t.check(grant("anon", "get_listing_questions") === true, "anon reads through get_listing_questions");
      t.check(["ask_listing_question", "answer_listing_question", "hide_listing_question", "restore_listing_question"].every((fn) => grant("anon", fn) === false), "anon cannot call any write function");

      const seller = t.account({ kind: "particular" });
      const item = t.listing(seller);
      const asker = t.account({ kind: "buyer" });
      const question = ask(t, asker, item.id, "¿Tiene funda?");
      const anon = { id: null };
      t.check(refused(t, anon, `select count(*) from public.listing_questions`)?.includes("permission denied"), "anon cannot select the table");
      t.check(refused(t, asker, `select count(*) from public.listing_questions`)?.includes("permission denied"), "authenticated cannot select the table");
      t.check(refused(t, asker, `update public.listing_questions set body = 'Editada' where id = ${t.literal(question)}`)?.includes("permission denied"), "the asker cannot edit");
      t.check(refused(t, seller, `delete from public.listing_questions where id = ${t.literal(question)}`)?.includes("permission denied"), "the seller cannot delete");
      t.check(refused(t, asker, `insert into public.listing_questions (listing_id, asker_user_id, body) values (${t.literal(item.id)}, ${t.literal(asker.id)}, 'Directa')`)?.includes("permission denied"), "nobody inserts directly");
      t.check(refused(t, anon, `select public.ask_listing_question(${t.literal(item.id)}, '¿Tiene funda?')`)?.includes("permission denied"), "anon cannot ask");
      const [{ page: read }] = t.sqlAs(null, `select public.get_listing_questions(${t.literal(item.id)}) as page`);
      t.check(read.questions?.length === 1 && read.questions[0].hidden_reason === null && !("asker_user_id" in read.questions[0]), "anon reads the Q&A through the function, without account ids");
      const [{ body }] = t.sql(`select body from public.listing_questions where id = ${t.literal(question)}`);
      t.check(body === "¿Tiene funda?", "the question is unchanged");
    },
  },
  {
    id: "EASE-178",
    live: true,
    timeout: 420_000,
    async run(t) {
      if (t.live) {
        const probe = await t.page();
        const item = await b.publicListing(t, probe);
        for (const phone of [true, false]) {
          const page = await t.page({ phone });
          const hydration = watchHydration(page);
          await t.goto(page, item.path);
          const section = await questionsLoaded(page);
          const text = await section.innerText();
          const link = section.getByRole("link", { name: "Ingresa para preguntar" });
          const count = await items(section).count();
          t.check(count > 0 || text.includes(EMPTY), `${phone ? "390" : "1366"} px: ${count ? `${count} questions` : "the empty sentence"}`);
          t.check(await link.getAttribute("href") === `/login?next=${encodeURIComponent(`${item.path}#preguntas`)}`, "a quiet Ingresa para preguntar link back to #preguntas");
          t.check(await section.locator("textarea").count() === 0, "no question form signed out");
          await page.waitForTimeout(1000);
          t.check(hydration.length === 0, `no hydration warning${hydration.length ? `: ${hydration.join(" | ")}` : ""}`);
          await section.scrollIntoViewIfNeeded();
          await t.shot(page, `live-${phone ? "phone" : "desktop"}`);
        }
        t.skip(`live: signed-out view of ${item.path} checked at 390 and 1366 px; the sold and signed-in states are checked on the local stack`);
      }

      const seller = t.account({ kind: "particular" });
      const open = t.listing(seller);
      const soldWith = t.listing(seller, { status: "sold", category: "basses", type: "bass", brand: "Fender", model: "Jazz Bass" });
      const asker = t.account({ kind: "buyer", name: "Lucía Paredes" });
      t.exec(`insert into public.listing_questions (listing_id, asker_user_id, body, answer, answered_at, answered_by, created_at)
        values (${t.literal(soldWith.id)}, ${t.literal(asker.id)}, '¿Tiene estuche?', 'Sí, incluye estuche.', now() - interval '2 days', ${t.literal(seller.id)}, now() - interval '3 days')`);
      const soldNone = t.listing(seller, { status: "sold" });
      const buyer = t.account({ kind: "buyer" });

      for (const signedIn of [false, true]) {
        for (const phone of [true, false]) {
          const where = `${signedIn ? "signed in" : "signed out"}, ${phone ? "390" : "1366"} px`;
          const page = await t.page({ phone, ...(signedIn ? { as: buyer.email } : {}) });
          const hydration = watchHydration(page);

          await t.goto(page, open.path);
          let section = await questionsLoaded(page);
          let text = await section.innerText();
          t.check(text.includes(EMPTY), `${where}, published without questions: the empty sentence`);
          if (signedIn) {
            t.check(await section.getByLabel("Haz una pregunta").count() === 1 && await section.getByRole("link", { name: "Ingresa para preguntar" }).count() === 0, `${where}: the question form, no sign-in link`);
          } else {
            const href = await section.getByRole("link", { name: "Ingresa para preguntar" }).getAttribute("href");
            t.check(href === `/login?next=${encodeURIComponent(`${open.path}#preguntas`)}` && await section.locator("textarea").count() === 0, `${where}: a quiet Ingresa para preguntar link back to #preguntas (${href})`);
          }
          await section.scrollIntoViewIfNeeded();
          await t.shot(page, `open-${signedIn ? "in" : "out"}-${phone ? "phone" : "desktop"}`);

          await t.goto(page, soldWith.path);
          section = await questionsLoaded(page);
          text = await section.innerText();
          t.check(text.includes(SOLD) && text.includes("¿Tiene estuche?") && text.includes("Sí, incluye estuche."), `${where}, sold with Q&A: read-only with the sold note`);
          t.check(await section.locator("textarea").count() === 0 && await section.getByRole("button", { name: "Responder", exact: true }).count() === 0
            && await section.getByRole("link", { name: "Ingresa para preguntar" }).count() === 0, `${where}, sold: no form, no Responder, no sign-in link`);
          await section.scrollIntoViewIfNeeded();
          await t.shot(page, `sold-${signedIn ? "in" : "out"}-${phone ? "phone" : "desktop"}`);

          await t.goto(page, soldNone.path);
          await questionsLoaded(page);
          await page.waitForTimeout(500);
          t.check(await page.locator("section#preguntas").count() === 0, `${where}, sold without questions: no Preguntas section`);
          await page.waitForTimeout(500);
          t.check(hydration.length === 0, `${where}: no hydration warning${hydration.length ? `: ${hydration.join(" | ")}` : ""}`);
          await page.context().close();
        }
      }

      // The sign-in link comes back to the questions.
      const page = await t.page();
      await t.goto(page, open.path);
      const section = await questionsLoaded(page);
      await section.getByRole("link", { name: "Ingresa para preguntar" }).click();
      await page.waitForURL((url) => url.pathname === "/login", { timeout: 20_000 });
      await page.getByLabel("Correo", { exact: true }).fill(buyer.email);
      await page.getByLabel("Contraseña", { exact: true }).fill(t.PASSWORD);
      await page.getByRole("button", { name: "Ingresar", exact: true }).click();
      await page.waitForURL((url) => url.pathname === open.path, { timeout: 30_000 });
      const back = await questionsLoaded(page);
      t.check(new URL(page.url()).hash === "#preguntas" && await back.getByLabel("Haz una pregunta").count() === 1, `after signing in it returns to ${open.path}${new URL(page.url()).hash} with the form`);
    },
  },
  {
    id: "EASE-179",
    async run(t) {
      const seller = t.account({ kind: "particular" });
      const item = t.listing(seller);
      const other = t.account({ kind: "buyer", name: "Ana Ríos" });
      const earlier = ask(t, other, item.id, "¿Tiene estuche?");
      t.sqlAs(seller.id, `select public.answer_listing_question(${t.literal(earlier)}, 'Sí, estuche rígido.') as ok`);
      const buyer = t.account({ kind: "buyer" });

      const page = await t.page({ phone: true, as: buyer.email });
      await t.goto(page, item.path);
      const section = await questionsLoaded(page);
      const posts = [];
      page.on("request", (request) => {
        if (request.method() === "POST" && request.url().includes("/api/listing-questions")) posts.push(request.url());
      });
      const field = section.getByLabel("Haz una pregunta");
      const send = section.getByRole("button", { name: "Enviar pregunta" });
      const counter = section.getByText(/^\d+ \/ 300$/);
      t.check(await counter.innerText() === "0 / 300", "the counter starts at 0 / 300");

      const fieldState = () => field.evaluate((element) => {
        const ids = (element.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
        const error = ids.map((id) => document.getElementById(id)).find((node) => node && node.id.endsWith("-error"));
        const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        return {
          invalid: element.getAttribute("aria-invalid"),
          error: error?.textContent?.trim() ?? null,
          below: error && label ? error.getBoundingClientRect().top >= label.getBoundingClientRect().bottom : false,
        };
      });

      await field.fill("Hola");
      t.check(await counter.innerText() === "4 / 300", "the counter follows the text (4 / 300)");
      await send.click();
      await page.waitForTimeout(400);
      let state = await fieldState();
      t.check(state.invalid === "true" && state.error === "La pregunta debe tener entre 5 y 300 caracteres." && state.below,
        `"Hola": the field error under the label, tied to the field (${state.error})`);
      await t.shot(page, "too-short");

      await field.fill("¿Me llamas al 987 654 321?");
      state = await fieldState();
      t.check(state.invalid === null && state.error === null, "typing clears the error");
      await send.click();
      await page.waitForTimeout(400);
      state = await fieldState();
      t.check(state.invalid === "true" && state.error === CONTACT, "a phone number: the contact-detail error");
      t.check(posts.length === 0, `no request for either (${posts.length} POSTs)`);
      await t.shot(page, "phone-number");

      const text = "¿Incluye el cable y la funda?";
      await field.fill(text);
      t.check(await counter.innerText() === `${text.length} / 300`, `the counter reads ${text.length} / 300`);
      await send.click();
      const success = section.locator("p[role='status']").filter({ hasText: ASKED });
      await success.waitFor({ timeout: 20_000 });
      t.check(await success.evaluate((element) => document.activeElement === element), "success is a status message and takes the focus");
      t.check(posts.length === 1 && await counter.innerText() === "0 / 300" && await field.inputValue() === "", "one request; the field and the counter start over");
      await t.shot(page, "sent");

      await page.route("**/api/listing-questions", (route) => (route.request().method() === "POST"
        ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Las preguntas no están disponibles por ahora." }) })
        : route.fallback()));
      await field.fill("¿Cuánto pesa con la funda?");
      await send.click();
      const alert = section.locator("p[role='alert']").filter({ hasText: "Las preguntas no están disponibles por ahora." });
      await alert.waitFor({ timeout: 20_000 });
      t.check(await alert.evaluate((element) => document.activeElement === element), "a server error is an alert and takes the focus");
      t.check(await field.inputValue() === "¿Cuánto pesa con la funda?", "the question stays in the field to send again");
      await t.shot(page, "server-error");

      const form = section.locator("form").first();
      const small = await b.smallControls(form);
      t.check(small.length === 0, `every control of the form is at least 24 px (${small.map((item) => `${item.name} ${item.width}x${item.height}`).join(", ") || "all"})`);
      // Outside the form (not this case's controls): the report link under other people's questions.
      const smallInSection = await b.smallControls(section);
      const crowded = await b.crowdedTargets(section);
      t.note(`outside the form, under 24 px: ${smallInSection.map((item) => `${item.name} ${item.width}x${item.height}`).join(", ") || "none"}; `
        + `${crowded.length ? `too close to another control for WCAG 2.5.8: ${JSON.stringify(crowded)}` : "each is spaced enough for WCAG 2.5.8"}`);
    },
  },
];
