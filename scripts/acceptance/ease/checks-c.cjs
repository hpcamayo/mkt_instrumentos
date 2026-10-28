// Effortless Laria acceptance, group C: the sell form (EASE-300..320) and my listings (EASE-400..432): the account
// home, Pendientes, the edit form, Mis publicaciones, vacation mode, transactions and statistics. Run with
// scripts/acceptance/ease/run.cjs. Every case signs in with its own accounts, so none is marked live.
"use strict";
const fs = require("node:fs");
const c = require("./c-helpers.cjs");

const L = c.L;
const cases = [];

// ------------------------------------------------------------------ the sell form (selling batch)

// FIX 02: a phone JPEG with GPS EXIF is stored re-encoded, at most 2,400 px, without EXIF.
cases.push({
  id: "EASE-300",
  run: async (t) => {
    const seller = t.account({ kind: "particular" });
    const source = c.phonePhoto("gps");
    const original = c.jpeg(source);
    t.check(original.bytes > 5 * 1024 * 1024 && original.gps && Math.max(original.width, original.height) > 2400,
      `the test photo is a phone JPEG over 5 MB with GPS EXIF (${original.width} x ${original.height}, ${original.bytes} bytes)`);
    const page = await t.page({ as: seller.email });
    await t.goto(page, "/mi-cuenta/publicar");
    await c.fillSell(page, { photos: [source, ...c.samples(1)] });
    await c.continueStep(page);
    await c.publish(page);
    const listing = c.newestListing(seller.id);
    t.check(listing && listing.status === "pending" && listing.photos.length === 2, `the listing was sent with 2 photos (${listing?.status}, ${listing?.photos.length})`);
    const file = c.photoFile(listing.photos[0]);
    const stored = c.jpeg(file);
    t.note(`stored ${file}: ${JSON.stringify(stored)}`);
    t.check(stored.jpeg && Math.max(stored.width, stored.height) <= 2400, `the stored photo is a JPEG at most 2,400 px on its longest side (${stored.width} x ${stored.height})`);
    t.check(!stored.exif && !stored.gps && stored.app1 === 0, `the stored photo has no EXIF block and no GPS data (APP1 segments: ${stored.app1})`);
    t.check(stored.bytes < original.bytes && stored.bytes <= 5 * 1024 * 1024, `the stored photo was re-encoded (${stored.bytes} bytes, under 5 MB)`);
    const [object] = t.sql(`select bucket_id, name from storage.objects where bucket_id = 'listing-photos' and owner = ${L(seller.id)}
      and name = ${L(listing.photos[0].replace(/^.*\/listing-photos\//, ""))}`);
    t.check(Boolean(object), `the object is in listing-photos (${object?.name})`);
    await t.shot(page, "sent");
  },
});

// FIX 02: big phone photos are accepted and shrunk on Publicar and on Editar.
cases.push({
  id: "EASE-301",
  run: async (t) => {
    const seller = t.account({ kind: "particular" });
    const source = c.phonePhoto("big");
    const original = c.jpeg(source);
    t.check(original.bytes > 9 * 1024 * 1024, `the test photo weighs ${(original.bytes / 1048576).toFixed(1)} MB (${original.width} x ${original.height})`);
    const since = t.sql("select now() as at")[0].at;
    const page = await t.page({ as: seller.email });
    await t.goto(page, "/mi-cuenta/publicar");
    await c.fillSell(page, { photos: [source, ...c.samples(1, 7)], stopAfter: 1 });
    const form = c.sellForm(page);
    const alerts = await form.locator("[role=alert]").allInnerTexts();
    t.check(!alerts.some((text) => /pesad|MB|grande/i.test(text)), `Publicar shows no size refusal (${alerts.join(" | ") || "no alert"})`);
    t.check(await form.getByText("Subida").count() === 2, "both photos show Subida");
    await t.shot(page, "publicar");
    const uploaded = c.objects(seller.id, "listing-photos", since);
    const big = uploaded.map((row) => ({ row, info: c.jpeg(c.diskPath(row.bucket_id, row.name)) }))
      .sort((a, b) => b.info.width - a.info.width)[0];
    t.check(uploaded.length === 2 && big && Math.max(big.info.width, big.info.height) <= 2400 && big.info.bytes <= 5 * 1024 * 1024,
      `Publicar stored it shrunk (${big?.info.width} x ${big?.info.height}, ${big?.info.bytes} bytes)`);

    const listing = t.listing(seller, { title: `Guitarra para editar fotos ${t.tag().slice(-4)}` });
    const sinceEdit = t.sql("select now() as at")[0].at;
    const edit = await t.page({ as: seller.email });
    await t.goto(edit, `/mi-cuenta/publicaciones/${listing.id}/editar`);
    await edit.locator("#editar-photos").setInputFiles([source]);
    await edit.waitForTimeout(800);
    const editAlerts = await edit.locator("[role=alert]").allInnerTexts();
    t.check(!editAlerts.some((text) => /pesad|MB|grande/i.test(text)), `Editar shows no size refusal (${editAlerts.join(" | ") || "no alert"})`);
    await edit.getByRole("button", { name: "Guardar cambios" }).click();
    await c.until(async () => /cambios principales quedaron en revisión|se guardaron correctamente/.test(await c.mainText(edit)), { timeout: 60_000 });
    const text = await c.mainText(edit);
    t.check(/cambios principales quedaron en revisión|se guardaron correctamente/.test(text), "Editar saved the change with the big photo");
    await t.shot(edit, "editar");
    const editObjects = c.objects(seller.id, "listing-edit-photos", sinceEdit);
    const info = editObjects[0] ? c.jpeg(c.diskPath("listing-edit-photos", editObjects[0].name)) : null;
    t.note(`edit object: ${editObjects[0]?.name} ${JSON.stringify(info)}`);
    t.check(info && Math.max(info.width, info.height) <= 2400 && info.bytes <= 5 * 1024 * 1024 && !info.exif,
      `Editar stored it shrunk and without EXIF (${info?.width} x ${info?.height}, ${info?.bytes} bytes)`);
  },
});

// big-06: photos first on phones and computers; each photo shows its progress and is uploaded before Publicar.
cases.push({
  id: "EASE-303",
  timeout: 300_000,
  run: async (t) => {
    const seller = t.account({ kind: "particular" });
    for (const phone of [true, false]) {
      const look = await t.page({ as: seller.email, phone });
      await t.goto(look, "/mi-cuenta/publicar");
      const first = c.sellForm(look).getByRole("heading", { level: 2 }).first();
      t.check(/^1\s*Fotos$/.test((await first.innerText()).replace(/\s+/g, " ").trim()), `step 1 is Fotos on a ${phone ? "phone" : "computer"} (${(await first.innerText()).replace(/\s+/g, " ")})`);
      if (phone) await t.shot(look, "phone-step1");
      await look.close();
    }
    const page = await t.page({ as: seller.email });
    await t.goto(page, "/mi-cuenta/publicar");
    // A slow connection, so the progress is visible: 120 kB/s up.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: 4_000_000, uploadThroughput: 120_000 });
    const since = t.sql("select now() as at")[0].at;
    const form = c.sellForm(page);
    await form.getByRole("button", { name: "Guitarras", exact: true }).click();
    await page.locator("#venta-fotos").setInputFiles([c.phonePhoto("gps"), c.phonePhoto("big"), ...c.samples(1, 3)]);
    const progress = await c.until(async () => {
      const value = await form.getByRole("progressbar", { name: "Subida de la foto" }).first().getAttribute("aria-valuenow").catch(() => null);
      const label = await form.getByText(/Subiendo \d+%|Preparando…/).first().innerText().catch(() => null);
      return label ? { value, label } : null;
    }, { timeout: 20_000, every: 100 });
    t.check(Boolean(progress), `each photo shows its progress while it uploads (${progress?.label}, progressbar ${progress?.value})`);
    await t.shot(page, "uploading");
    await c.continueStep(page);
    const step2 = await form.getByRole("heading", { level: 2 }).first().innerText();
    const atStep2 = c.objects(seller.id, "listing-photos", since).length;
    t.check(/Qué es/.test(step2), `Continuar works at once, while the photos upload (${step2.replace(/\s+/g, " ")}; ${atStep2} of 3 stored so far)`);
    t.check(atStep2 < 3, "the photos were still uploading when step 2 opened");
    await t.shot(page, "step2");
    const stored = await c.until(() => c.objects(seller.id, "listing-photos", since).length === 3, { timeout: 180_000, every: 1000 });
    t.check(stored, `the three photos are stored while the seller is on step 2, before Publicar (${c.objects(seller.id, "listing-photos", since).length})`);
    t.check(c.newestListing(seller.id) === null, "nothing was published yet");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await form.getByRole("button", { name: "Atrás" }).click();
    await c.until(async () => (await form.getByText("Subida").count()) === 3, { timeout: 30_000 });
    t.check(await form.getByText("Subida").count() === 3, "back on step 1 each photo shows Subida");
    await t.shot(page, "uploaded");
  },
});

// POST 01: closing and reopening Publicar offers the saved form with its photos; Descartar clears it.
cases.push({
  id: "EASE-304",
  run: async (t) => {
    const seller = t.account({ kind: "particular" });
    const first = await t.page({ as: seller.email });
    const context = first.context();
    await t.goto(first, "/mi-cuenta/publicar");
    await c.fillSell(first, { brand: "Gibson", model: "Les Paul Studio", stopAfter: 2 });
    await first.waitForTimeout(1500);
    const key = `laria:venta:${seller.id}:listing`;
    const saved = await first.evaluate((name) => localStorage.getItem(name), key);
    t.check(Boolean(saved), `the form is saved on this device as it is filled (${key})`);
    await first.close();

    const second = await context.newPage();
    await t.goto(second, "/mi-cuenta/publicar");
    const notice = second.getByText(/Tienes una publicación sin terminar/);
    await notice.waitFor({ timeout: 20_000 });
    const summary = await c.mainText(second);
    t.check(/Gibson Les Paul Studio · 2 fotos/.test(summary), `reopening Publicar offers the saved form (${(summary.match(/Tienes una publicación[^\n]*\n[^\n]*/) || [""])[0].replace(/\n/g, " ")})`);
    await t.shot(second, "offer");
    await second.getByRole("button", { name: "Retomar tu borrador" }).click();
    const form = c.sellForm(second);
    await form.waitFor();
    await c.until(async () => (await form.getByRole("button", { name: /^Quitar foto \d$/ }).count()) === 2);
    t.check(await form.getByRole("button", { name: /^Quitar foto \d$/ }).count() === 2, "Retomar restores both photos");
    const images = await form.locator("img[alt^='Foto ']").evaluateAll((nodes) => nodes.map((node) => node.complete && node.naturalWidth > 0));
    t.check(images.length === 2 && images.every(Boolean), `the restored photos load (${images.join(", ")})`);
    const marca = await form.getByLabel("Marca", { exact: true }).inputValue().catch(() => null);
    const step = await form.getByRole("heading", { level: 2 }).first().innerText();
    t.check(marca === "Gibson" || /Qué es/.test(step), `it reopens where the seller was, with the brand (${step.replace(/\s+/g, " ")}, Marca ${marca})`);
    await t.shot(second, "restored");
    await second.close();

    const third = await context.newPage();
    await t.goto(third, "/mi-cuenta/publicar");
    await third.getByRole("button", { name: "Descartar" }).click();
    await c.sellForm(third).waitFor();
    t.check(await c.sellForm(third).getByRole("button", { name: /^Quitar foto \d$/ }).count() === 0, "Descartar starts an empty form");
    await third.waitForTimeout(800);
    const after = await third.evaluate((name) => localStorage.getItem(name), key);
    t.check(!after || !/Gibson/.test(after), "Descartar clears the saved form");
    await third.reload({ waitUntil: "load" });
    await c.sellForm(third).waitFor();
    t.check(await third.getByText(/Tienes una publicación sin terminar/).count() === 0, "after Descartar nothing is offered again");
  },
});

// POST 02: a draft saved to the account opens in another browser with its photos; publishing removes it.
cases.push({
  id: "EASE-305",
  run: async (t) => {
    const seller = t.account({ kind: "particular" });
    const a = await t.page({ as: seller.email });
    await t.goto(a, "/mi-cuenta/publicar");
    await c.fillSell(a, { brand: "Yamaha", model: "Pacifica 112V", stopAfter: 2 });
    await c.sellForm(a).getByRole("button", { name: "Guardar borrador" }).click();
    await a.getByText(/Borrador guardado/).waitFor({ timeout: 30_000 });
    t.check(true, "Guardar borrador says the draft is saved to the account");
    const [draft] = t.sql(`select id, jsonb_array_length(photos) as photos, form->>'title' as title from public.listing_drafts where owner_user_id = ${L(seller.id)}`);
    t.check(draft && draft.photos === 2, `the account has the draft with its 2 photos (${JSON.stringify(draft)})`);

    const b = await t.page({ as: seller.email, phone: true });
    await t.goto(b, "/mi-cuenta/publicaciones");
    const drafts = b.locator("section", { has: b.getByRole("heading", { name: "Borradores" }) });
    const row = drafts.locator("li").filter({ hasText: "Yamaha Pacifica 112V" });
    t.check(await row.count() === 1 && /2 fotos/.test(await row.innerText()), `Mis publicaciones lists the draft (${(await row.innerText().catch(() => "")).replace(/\s+/g, " ")})`);
    await t.shot(b, "mis-publicaciones");
    await row.getByRole("link", { name: "Continuar" }).click();
    await b.waitForURL(/borrador=/);
    const form = c.sellForm(b);
    await form.waitFor();
    await c.until(async () => (await form.getByRole("button", { name: /^Quitar foto \d$/ }).count()) === 2 || /Qué es|Estado y precio/.test(await form.innerText()));
    const heading = (await form.getByRole("heading", { level: 2 }).first().innerText()).replace(/\s+/g, " ");
    t.check(/Estado y precio|Qué es/.test(heading), `Continuar in the other browser opens the draft past the photos (${heading})`);
    await form.getByRole("button", { name: "Paso 1. Fotos" }).click();
    const photoCount = await form.getByRole("button", { name: /^Quitar foto \d$/ }).count();
    const loaded = await form.locator("img[alt^='Foto ']").evaluateAll((nodes) => nodes.filter((node) => node.complete && node.naturalWidth > 0).length);
    t.check(photoCount === 2 && loaded === 2, `with its photos (${photoCount} photos, ${loaded} loaded)`);
    await t.shot(b, "continued");
    await form.getByRole("button", { name: "Paso 2. Qué es" }).click();
    t.check(await form.getByLabel("Marca", { exact: true }).inputValue() === "Yamaha", "and its brand");
    await c.continueStep(b);
    await form.locator('input[name="condition"][value="Usado - buen estado"]').check({ force: true });
    await form.getByLabel("Precio en soles").fill("950");
    await form.locator("#venta-description").fill("Guitarra liviana, cuerdas nuevas y sin rajaduras; incluye funda acolchada.");
    await c.continueStep(b);
    await c.publish(b);
    const listing = c.newestListing(seller.id);
    t.check(listing && listing.status === "pending" && /Yamaha Pacifica/.test(listing.title), `publishing from the other browser sent it (${listing?.title}, ${listing?.status})`);
    const left = t.sql(`select count(*)::int as n from public.listing_drafts where owner_user_id = ${L(seller.id)}`)[0].n;
    t.check(left === 0, `publishing removed the draft (${left} left)`);
    await t.goto(b, "/mi-cuenta/publicaciones");
    t.check(await b.getByRole("heading", { name: "Borradores" }).count() === 0, "Mis publicaciones no longer lists it");
  },
});

// POST 05: Anterior, Siguiente and Usar como principal reorder the photos; the first is labelled Principal.
cases.push({
  id: "EASE-308",
  run: async (t) => {
    const seller = t.account({ kind: "particular" });
    const page = await t.page({ as: seller.email });
    await t.goto(page, "/mi-cuenta/publicar");
    await c.fillSell(page, { photos: c.samples(3, 11), stopAfter: 1 });
    const form = c.sellForm(page);
    const order = () => form.locator("img[alt^='Foto ']").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src")));
    const principal = async () => (await form.locator("li[data-photo-index='0']").innerText()).includes("Principal");
    const [a, b, cc] = await order();
    t.check(await principal(), "the first photo is labelled Principal");
    await form.getByRole("button", { name: "Mover foto 1 después" }).click();
    t.check(JSON.stringify(await order()) === JSON.stringify([b, a, cc]), "Siguiente moves the first photo one place later");
    await form.getByRole("button", { name: "Mover foto 3 antes" }).click();
    t.check(JSON.stringify(await order()) === JSON.stringify([b, cc, a]), "Anterior moves the last photo one place earlier");
    await form.getByRole("button", { name: "Usar foto 3 como principal" }).click();
    t.check(JSON.stringify(await order()) === JSON.stringify([a, b, cc]), "Usar como principal puts it first");
    t.check(await principal() && (await form.locator("li[data-photo-index='0'] img").getAttribute("src")) === a, "and the new first photo carries Principal");
    t.check(await form.getByRole("button", { name: "Mover foto 1 antes" }).isDisabled() && await form.getByRole("button", { name: "Usar foto 1 como principal" }).count() === 0,
      "the first photo has no Anterior or Usar como principal to press");
    await t.shot(page, "reordered");
  },
});

// POST 07: the shot list follows the category; a shot taken is marked as done.
cases.push({
  id: "EASE-309",
  run: async (t) => {
    const seller = t.account({ kind: "particular" });
    const page = await t.page({ as: seller.email });
    await t.goto(page, "/mi-cuenta/publicar");
    const form = c.sellForm(page);
    const shots = () => form.getByRole("list", { name: "Lista de fotos sugeridas" }).getByRole("button").evaluateAll((nodes) => nodes.map((node) => node.textContent.trim()));
    const before = await shots();
    await form.getByRole("button", { name: "Guitarras", exact: true }).click();
    const guitar = await shots();
    t.check(["Frente", "Reverso", "Clavijero y número de serie", "Trastes", "Electrónica"].every((shot) => guitar.includes(shot)),
      `Guitarras shows the guitar shots (${guitar.join(", ")})`);
    t.check(JSON.stringify(before) !== JSON.stringify(guitar), `the list changed with the category (before: ${before.join(", ")})`);
    await form.getByRole("button", { name: "Teclados y pianos", exact: true }).click();
    const keys = await shots();
    t.check(JSON.stringify(keys) !== JSON.stringify(guitar) && !keys.includes("Trastes"), `Teclados y pianos shows other shots (${keys.join(", ")})`);
    await form.getByRole("button", { name: "Guitarras", exact: true }).click();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), form.getByRole("button", { name: /^Agregar foto: Frente\./ }).click()]);
    await chooser.setFiles(c.samples(1, 20));
    const done = form.getByRole("button", { name: "Frente: lista. Agregar otra" });
    await done.waitFor({ timeout: 20_000 });
    t.check(await done.count() === 1, "after the photo, Frente is marked as done (Frente: lista)");
    t.check(/Foto 1 · Frente/.test(await form.locator("li[data-photo-index='0']").innerText()), "the photo is labelled with its shot");
    await t.shot(page, "frente");
  },
});

// POST 13: brand and model write the title until the seller edits it.
cases.push({
  id: "EASE-310",
  run: async (t) => {
    const seller = t.account({ kind: "particular" });
    const page = await t.page({ as: seller.email });
    await t.goto(page, "/mi-cuenta/publicar");
    await c.fillSell(page, { brand: "Ibanez", model: "RG421", stopAfter: 2 });
    const form = c.sellForm(page);
    const title = form.getByLabel("Título", { exact: true });
    t.check(await title.inputValue() === "Ibanez RG421", `brand and model fill the title (${await title.inputValue()})`);
    await form.getByLabel("Modelo", { exact: true }).fill("RG450");
    t.check(await title.inputValue() === "Ibanez RG450", `changing the model updates it while untouched (${await title.inputValue()})`);
    await title.fill("Ibanez RG450 2019 negra con estuche");
    await form.getByLabel("Modelo", { exact: true }).fill("RG470");
    await form.getByLabel("Marca", { exact: true }).fill("Ibanez Japan");
    t.check(await title.inputValue() === "Ibanez RG450 2019 negra con estuche", `once edited, the title no longer changes (${await title.inputValue()})`);
    await t.shot(page, "title");
  },
});

// POST 09: a starter goes on its own line with the caret after it; the counter shows a check at 40 characters.
cases.push({
  id: "EASE-312",
  run: async (t) => {
    const seller = t.account({ kind: "particular" });
    const page = await t.page({ as: seller.email });
    await t.goto(page, "/mi-cuenta/publicar");
    await c.fillSell(page, { description: null, price: null, condition: null });
    const form = c.sellForm(page);
    const field = form.locator("#venta-description");
    await field.fill("Guitarra cuidada");
    const counter = form.locator("p[aria-live=polite]").filter({ hasText: /caracteres/ });
    t.check(/^16 de 40 caracteres mínimos$/.test((await counter.innerText()).trim()) && await counter.locator("svg").count() === 0,
      `under 40 the counter counts up without a check (${(await counter.innerText()).trim()})`);
    await form.getByRole("button", { name: "+ Incluye estuche" }).click();
    const value = await field.inputValue();
    const caret = await field.evaluate((node) => [node.selectionStart, node.selectionEnd, document.activeElement === node]);
    t.check(value === "Guitarra cuidada\nIncluye estuche", `the starter is on its own line (${JSON.stringify(value)})`);
    t.check(caret[0] === value.length && caret[1] === value.length && caret[2], `the caret is after it, in the field (${caret.join(", ")})`);
    await page.keyboard.type(" rígido original y correa de cuero");
    const typed = await field.inputValue();
    t.check(typed.endsWith("Incluye estuche rígido original y correa de cuero"), "typing continues the starter's line");
    const text = (await counter.innerText()).trim();
    t.check(new RegExp(`^${typed.length} caracteres: suficiente$`).test(text) && await counter.locator("svg").count() === 1,
      `at 40 or more the counter shows a check and suficiente (${text})`);
    await t.shot(page, "starter");
  },
});

// POST 13 (preview): step 4 shows the catalog card and, on request, the listing page with the seller and trust text.
cases.push({
  id: "EASE-313",
  run: async (t) => {
    const seller = t.account({ kind: "particular", name: `Vendedora ${t.tag().slice(-4)}` });
    const page = await t.page({ as: seller.email });
    await t.goto(page, "/mi-cuenta/publicar");
    await c.fillSell(page, { brand: "Fender", model: "Jazz Bass", type: "Guitarras eléctricas", price: "2300" });
    await c.continueStep(page);
    const form = c.sellForm(page);
    const text = await form.innerText();
    t.check(/4\s*Revisar y publicar/.test(text) && /Fender Jazz Bass/.test(text) && /S\/\s?2,300/.test(text) && /Usado · buen estado/.test(text) && /Lima · Particular/.test(text),
      "step 4 shows the catalog card: photo, title, price, condition, place and Particular");
    t.check(await form.getByText("2 fotos").count() >= 1, "the card shows the photo count");
    const toggle = form.getByRole("button", { name: "Ver cómo se verá la página" });
    await toggle.click();
    await form.getByRole("button", { name: "Ocultar la página" }).waitFor();
    const preview = await form.innerText();
    t.check(preview.includes(seller.name) && /Particular · Contacto por WhatsApp/.test(preview), "the page preview has the seller block");
    t.check(/Coordinas el pago y la entrega directamente con quien vende\. Laria no procesa pagos/.test(preview), "and the trust text");
    t.check(/Descripción/.test(preview) && /Especificaciones/.test(preview), "and the description and specifications");
    await t.shot(page, "preview", { fullPage: true });
  },
});

// POST 11: a phone number, a link, an all-caps title or a price under S/ 20 shows a hint; Publicar still works.
cases.push({
  id: "EASE-314",
  run: async (t) => {
    const seller = t.account({ kind: "particular" });
    const page = await t.page({ as: seller.email });
    await t.goto(page, "/mi-cuenta/publicar");
    await c.fillSell(page, { brand: "Squier", model: "Affinity", title: "SQUIER AFFINITY TELECASTER", price: "15",
      description: "Guitarra en buen estado, llámame al 987 654 321 o mira más fotos en www.ejemplo.pe/fotos" });
    const form = c.sellForm(page);
    const step3 = await form.innerText();
    t.check(/No hace falta escribir tu número/.test(step3), "a phone number in the description shows a hint");
    t.check(/Quita enlaces, correos o usuarios de redes/.test(step3), "a link shows a hint");
    t.check(/¿S\/ 15 es el precio real\?/.test(step3), "a price under S/ 20 shows a hint");
    await t.shot(page, "step3");
    await c.continueStep(page);
    const step4 = await form.innerText();
    t.check(/Escribe el título sin todo en mayúsculas/.test(step4), "the all-caps title is listed with the others before sending");
    await c.publish(page);
    const listing = c.newestListing(seller.id);
    t.check(listing && listing.status === "pending" && /987 654 321/.test(listing.description), `Publicar still works with the hints (${listing?.status})`);
    await t.shot(page, "sent");
  },
});

// POST 16: Publicar uno parecido keeps category, type, brand, condition, place and description; not photos, price,
// model or title.
cases.push({
  id: "EASE-315",
  run: async (t) => {
    const seller = t.account({ kind: "particular", city: "Arequipa", region: "Arequipa" });
    const page = await t.page({ as: seller.email });
    await t.goto(page, "/mi-cuenta/publicar");
    await c.fillSell(page, { brand: "Gibson", model: "SG Standard", condition: "Usado - con detalles", price: "4200",
      description: "Guitarra con detalles de uso en el cuerpo, suena muy bien y tiene estuche." });
    await c.continueStep(page);
    await c.publish(page);
    await page.getByRole("button", { name: "Publicar uno parecido" }).click();
    const form = c.sellForm(page);
    await form.waitFor();
    t.check(await form.getByRole("button", { name: /^Quitar foto \d$/ }).count() === 0, "photos are not kept");
    t.check(await form.getByRole("button", { name: "Guitarras", exact: true }).getAttribute("aria-pressed") === "true", "the category is kept");
    await page.locator("#venta-fotos").setInputFiles(c.samples(2, 30));
    await c.waitUploads(page);
    await c.continueStep(page);
    const values = {
      type: await form.locator('input[name="instrument_type"]:checked').getAttribute("value").catch(() => null),
      brand: await form.getByLabel("Marca", { exact: true }).inputValue(),
      model: await form.getByLabel("Modelo", { exact: true }).inputValue(),
      title: await form.getByLabel("Título", { exact: true }).inputValue(),
    };
    t.check(values.type === "electric_guitar" && values.brand === "Gibson", `type and brand are kept (${values.type}, ${values.brand})`);
    t.check(values.model === "" && values.title === "", `model and title start empty (${JSON.stringify(values.model)}, ${JSON.stringify(values.title)})`);
    await t.shot(page, "step2");
    await form.getByLabel("Modelo", { exact: true }).fill("Les Paul Junior");
    await c.continueStep(page);
    const step3 = {
      condition: await form.locator('input[name="condition"]:checked').getAttribute("value").catch(() => null),
      price: await form.getByLabel("Precio en soles").inputValue(),
      city: await form.getByLabel("Ciudad").inputValue(),
      region: await form.getByLabel("Región").inputValue(),
      description: await form.locator("#venta-description").inputValue(),
    };
    t.check(step3.condition === "Usado - con detalles", `the condition is kept (${step3.condition})`);
    t.check(step3.city === "Arequipa" && step3.region === "Arequipa", `the place is kept (${step3.city}, ${step3.region})`);
    t.check(step3.description === "Guitarra con detalles de uso en el cuerpo, suena muy bien y tiene estuche.", "the description is kept");
    t.check(step3.price === "", `the price starts empty (${JSON.stringify(step3.price)})`);
    await t.shot(page, "step3");
  },
});

module.exports = cases;
