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
    t.check(await form.getByText("Subida", { exact: true }).count() === 2, "both photos show Subida");
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
    // Each tile shows Preparando… and then Subiendo N% with a progress bar; wait until one is part-way.
    const seen = new Set();
    const progress = await c.until(async () => {
      for (const label of await form.getByText(/^(Subiendo \d+%|Preparando…)$/).allInnerTexts().catch(() => [])) seen.add(label.trim());
      const values = await form.getByRole("progressbar", { name: "Subida de la foto" }).evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("aria-valuenow"))));
      const partway = values.find((value) => value > 0 && value < 100);
      return partway ? { values, partway } : null;
    }, { timeout: 30_000, every: 100 });
    t.check(Boolean(progress) && seen.has("Preparando…") && [...seen].some((label) => /Subiendo [1-9]\d?%/.test(label)),
      `each photo shows its progress while it uploads (seen: ${[...seen].join(", ")}; progress bars ${progress?.values?.join("/")})`);
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
    await c.until(async () => (await form.getByText("Subida", { exact: true }).count()) === 3, { timeout: 30_000 });
    t.check(await form.getByText("Subida", { exact: true }).count() === 3, "back on step 1 each photo shows Subida");
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
    // It opens on the first step still to complete (photos, brand and model are done: step 3).
    const step = (await form.getByRole("heading", { level: 2 }).first().innerText()).replace(/\s+/g, " ");
    t.check(/Estado y precio/.test(step), `Retomar opens the form on the next step to complete (${step})`);
    await t.shot(second, "restored");
    await form.getByRole("button", { name: "Paso 2. Qué es" }).click();
    const marca = await form.getByLabel("Marca", { exact: true }).inputValue();
    const modelo = await form.getByLabel("Modelo", { exact: true }).inputValue();
    t.check(marca === "Gibson" && modelo === "Les Paul Studio", `with the brand and model (${marca}, ${modelo})`);
    await form.getByRole("button", { name: "Paso 1. Fotos" }).click();
    await c.until(async () => (await form.getByRole("button", { name: /^Quitar foto \d$/ }).count()) === 2);
    t.check(await form.getByRole("button", { name: /^Quitar foto \d$/ }).count() === 2, "Retomar restores both photos");
    await c.until(async () => (await form.locator("img[alt^='Foto ']").evaluateAll((nodes) => nodes.filter((node) => node.complete && node.naturalWidth > 0).length)) === 2);
    const images = await form.locator("img[alt^='Foto ']").evaluateAll((nodes) => nodes.map((node) => node.complete && node.naturalWidth > 0));
    t.check(images.length === 2 && images.every(Boolean) && await form.getByText("Subida", { exact: true }).count() === 2, `the restored photos load and show Subida (${images.join(", ")})`);
    await t.shot(second, "restored-photos");
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
    await b.waitForTimeout(1000);
    const heading = (await form.getByRole("heading", { level: 2 }).first().innerText()).replace(/\s+/g, " ");
    if (!/Fotos/.test(heading)) await form.getByRole("button", { name: /^Paso 1\b/ }).click();
    await c.until(async () => (await form.locator("img[alt^='Foto ']").evaluateAll((nodes) => nodes.filter((node) => node.complete && node.naturalWidth > 0).length)) === 2);
    const photoCount = await form.getByRole("button", { name: /^Quitar foto \d$/ }).count();
    const loaded = await form.locator("img[alt^='Foto ']").evaluateAll((nodes) => nodes.filter((node) => node.complete && node.naturalWidth > 0).length);
    t.check(photoCount === 2 && loaded === 2, `Continuar in the other browser opens the draft with its photos (${heading}; ${photoCount} photos, ${loaded} loaded)`);
    await t.shot(b, "continued");
    await c.continueStep(b);
    t.check(await form.getByLabel("Marca", { exact: true }).inputValue() === "Yamaha" && await form.getByLabel("Modelo", { exact: true }).inputValue() === "Pacifica 112V", "and its brand and model");
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
    const text = (await form.innerText()).replace(/\s+/g, " ");
    t.check(/4 Revisar y publicar/.test(text) && /Fender Jazz Bass/.test(text) && /S\/ ?2,300/.test(text) && /Usado · buen estado/.test(text) && /Lima ?· ?Particular/.test(text),
      `step 4 shows the catalog card: photo, title, price, condition, place and Particular (${text.slice(text.indexOf("Revisar y publicar"), text.indexOf("Revisar y publicar") + 260)})`);
    const cardImage = form.getByText("2 fotos", { exact: true }).first().locator("xpath=ancestor::*[.//img][1]//img").first();
    t.check(await cardImage.evaluate((node) => node.complete && node.naturalWidth > 0), "the card has the main photo");
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

// FIX 05: after publishing a SKU, Publicar otro instrumento opens an empty page; Volver al SKU and Publicar el
// siguiente SKU sin publicación work.
cases.push({
  id: "EASE-302",
  run: async (t) => {
    const owner = t.account({ kind: "store_owner" });
    const store = t.store(owner, { inventory: true });
    const code = `C302${t.tag().slice(-4).toUpperCase()}`;
    const first = c.sku(owner, { merchant_sku: `${code}-A`, product_name: "Fender Player Telecaster", unit_price_pen: 3200 });
    const second = c.sku(owner, { merchant_sku: `${code}-B`, product_name: "Boss Katana 50", unit_price_pen: 1100 });
    const page = await t.page({ as: owner.email });
    await t.goto(page, `/mi-cuenta/tienda/publicar?sku=${first.id}`);
    t.check(/Publicar .*-A/.test(await page.getByRole("heading", { level: 1 }).innerText()), "the publish page names the SKU");
    await c.fillSell(page, { brand: "Fender", model: "Player Telecaster", price: "3200",
      description: "Telecaster nueva de exhibición, con funda y garantía de la tienda por seis meses." });
    await c.continueStep(page);
    await c.publish(page);
    const text = await c.mainText(page);
    const [linked] = t.sql(`select listing_id from public.store_inventory_items where id = ${L(first.id)}`);
    t.check(Boolean(linked.listing_id), `the SKU is linked to the new listing (${linked.listing_id})`);
    t.check(/Tu publicación está en línea/.test(text), "the verified store's listing is live");
    const actions = await page.locator("main a").evaluateAll((nodes) => Object.fromEntries(nodes.map((node) => [node.textContent.trim(), node.getAttribute("href")])));
    t.check(actions["Volver al SKU"] === `/mi-cuenta/tienda/inventario/${first.id}`, `Volver al SKU links to the SKU (${actions["Volver al SKU"]})`);
    t.check(actions["Publicar el siguiente SKU sin publicación"] === "/mi-cuenta/tienda/publicar?sku=siguiente", "Publicar el siguiente SKU sin publicación is offered");
    t.check(actions["Publicar otro instrumento"] === "/mi-cuenta/tienda/publicar", `Publicar otro instrumento opens the page without a SKU (${actions["Publicar otro instrumento"]})`);
    await t.shot(page, "confirmation");

    await page.getByRole("link", { name: "Publicar otro instrumento" }).click();
    await page.waitForURL((url) => url.pathname === "/mi-cuenta/tienda/publicar" && !url.search);
    await c.sellForm(page).waitFor();
    const fresh = await c.mainText(page);
    t.check(/Publicar en tu tienda/.test(fresh) && !/vinculada al SKU/.test(fresh) && !fresh.includes(code), "Publicar otro instrumento: an empty publish page with no SKU");
    t.check(await c.sellForm(page).getByRole("button", { name: /^Quitar foto \d$/ }).count() === 0, "with no photos from the last one");
    await t.shot(page, "otro");

    const back = await page.context().newPage();
    await t.goto(back, actions["Volver al SKU"]);
    const skuPage = await c.mainText(back);
    t.check(skuPage.includes(`${code}-A`) && /Fender Player Telecaster/.test(skuPage) && /El precio y la disponibilidad de la publicación siguen a este SKU/.test(skuPage),
      "Volver al SKU opens the SKU with its new listing");
    const next = await page.context().newPage();
    await t.goto(next, actions["Publicar el siguiente SKU sin publicación"]);
    const nextHeading = await next.getByRole("heading", { level: 1 }).innerText();
    t.check(nextHeading.includes(`${code}-B`), `Publicar el siguiente SKU sin publicación opens the next unlinked SKU (${nextHeading})`);
    t.check(/vinculada al SKU/.test(await c.mainText(next)), "and links the new listing to it");
    await t.shot(next, "siguiente");
    void second;
  },
});

// EASE-306 is the SQL suite's (tests/ux-effortless-selling.sql); EASE-307 needs a HEIC photo (below).

// POST 14 / FIX: the review wait is shown only from real data (20 reviewed Particular listings in 60 days).
cases.push({
  id: "EASE-316",
  timeout: 300_000,
  run: async (t) => {
    const qualifying = "store_id is null and published_at is not null and published_at >= created_at and published_at > now() - interval '60 days'";
    const [{ n: baseline }] = t.sql(`select count(*)::int as n from public.listings where ${qualifying}`);
    // In a transaction that is rolled back: bring the count to 19 and then 20 with listings reviewed in 45 minutes.
    const seller = t.account({ kind: "particular" });
    const insert = (count) => `insert into public.listings (id, slug, title, seller_type, status, category, instrument_type, brand, model, condition,
        price_pen, city, region, contact_name, whatsapp_phone, description, owner_user_id, created_by_source, marketplace_rules_accepted_at, created_at, published_at)
      select gen_random_uuid(), 'c316-' || g || '-' || md5(random()::text), 'Guitarra revisada ' || g, 'individual', 'approved', 'guitars', 'electric_guitar',
        'Fender', 'Strat', 'Usado - buen estado', 1000, 'Lima', 'Lima', 'Prueba', '51999000111', 'Guitarra para medir la espera de revisión.',
        ${L(seller.id)}, 'self_service', now(), now() - interval '2 days' - interval '45 minutes', now() - interval '2 days'
      from generate_series(1, ${count}) g`;
    // Above 19 already: move the other listings out of the window in the same rolled-back transaction.
    const clear = baseline >= 19 ? `update public.listings set published_at = now() - interval '70 days', created_at = now() - interval '71 days' where ${qualifying};` : "";
    const fill = baseline >= 19 ? 19 : 19 - baseline;
    const [at19] = c.rolledBack(`${clear} ${insert(fill)}`, "select public.listing_review_wait_minutes() as wait");
    const [at20] = c.rolledBack(`${clear} ${insert(fill + 1)}`, "select public.listing_review_wait_minutes() as wait");
    t.check(at19.wait === null, `with 19 reviewed Particular listings in 60 days no wait is computed (${at19.wait}; baseline ${baseline})`);
    t.check(baseline >= 19 ? at20.wait === 45 : at20.wait !== null, `with 20 the median is (${at20.wait} minutes)`);
    const [{ wait: now }] = t.sql("select public.listing_review_wait_minutes() as wait");
    t.note(`current wait on the local stack: ${now}`);

    const page = await t.page({ as: seller.email });
    await t.goto(page, "/mi-cuenta/publicar");
    await c.fillSell(page);
    await c.continueStep(page);
    await c.publish(page);
    const sent = await c.mainText(page);
    const line = (sent.match(/Normalmente se revisa[^\n.]*\./) || [null])[0];
    if (now === null) t.check(line === null, "the confirmation after sending shows no wait without data");
    else t.check(Boolean(line), `the confirmation after sending shows the usual wait (${line}; median ${now} minutes)`);
    t.check(/En revisión \(ahora\)/.test(sent), "and where the listing is (Enviada, En revisión, Publicada)");
    await t.shot(page, "sent");
  },
});

// POST 14 and POST 15: a direct publication is celebrated and easy to share; the approval e-mail opens the listing.
cases.push({
  id: "EASE-317",
  run: async (t) => {
    const owner = t.account({ kind: "store_owner" });
    t.store(owner, { verified: true });
    const page = await t.page({ as: owner.email, permissions: ["clipboard-read", "clipboard-write"] });
    await t.goto(page, "/mi-cuenta/tienda/publicar");
    await c.fillSell(page, { brand: "Gretsch", model: "G2622 Streamliner", price: "3900",
      description: "Guitarra semihueca nueva, con garantía de la tienda y funda incluida en la compra." });
    await c.continueStep(page);
    await c.publish(page);
    const text = await c.mainText(page);
    const listing = c.newestListing(owner.id);
    t.check(listing.status === "approved", `a verified store publishes directly (${listing.status})`);
    t.check(/Tu publicación está en línea/.test(text), "the confirmation says Tu publicación está en línea");
    const view = page.getByRole("link", { name: "Ver publicación" });
    t.check(await view.getAttribute("href") === `/instrumentos/${listing.slug}`, "Ver publicación opens the listing");
    await page.getByRole("button", { name: "Compartir" }).click();
    await page.getByText("Enlace copiado.").waitFor({ timeout: 10_000 }).catch(() => {});
    const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
    t.check(copied === `${t.base}/instrumentos/${listing.slug}`, `Compartir hands over the listing's link (copied: ${copied})`);
    await t.shot(page, "live");
    await view.click();
    await page.waitForURL(`**/instrumentos/${listing.slug}`);
    t.check((await page.getByRole("heading", { level: 1 }).innerText()).includes("Gretsch G2622 Streamliner"), "the listing page opens");

    // The approval e-mail: a Particular's listing approved in Administración queues it; render it as the worker does.
    const seller = t.account({ kind: "particular" });
    const pending = t.listing(seller, { status: "pending", title: `Bajo para aprobar ${t.tag().slice(-4)}`, category: "basses", type: "bass" });
    t.sqlAs(c.adminId(), `select public.review_listing(${L(pending.id)}, 'approve', null) as ok`, { admin: true });
    const [delivery] = t.sql(`select d.event_type, d.recipient_email, d.context from laria_private.marketplace_email_deliveries d
      where d.listing_id = ${L(pending.id)} and d.event_type = 'listing_approved'`);
    t.check(Boolean(delivery), "approving queues the listing_approved e-mail to the seller");
    const [row] = t.sql(`select title, slug, price_pen from public.listings where id = ${L(pending.id)}`);
    const email = c.renderEmail(c.emailPayload("listing_approved", { listing: row, email: delivery?.recipient_email, name: seller.name }));
    t.check(email.subject === "Tu publicación está en línea" && /Ver tu publicación/.test(email.html), `the e-mail says it is live and offers Ver tu publicación (${email.subject})`);
    t.check(email.destination === `${t.base}/instrumentos/${row.slug}`, `its button opens the listing (${email.destination})`);
    const opened = await t.page();
    const response = await t.goto(opened, email.destination);
    t.check(response.status() === 200 && (await opened.getByRole("heading", { level: 1 }).innerText()).includes(row.title), "the e-mail's link opens the live listing");
  },
});

// POST 16: a clip stops at 20 seconds; the Admin queue and the listing load it only on tap; a pending listing's clip
// is hidden from the public. Needs CHROMIUM_ARGS="--use-fake-device-for-media-stream --use-fake-ui-for-media-stream".
cases.push({
  id: "EASE-318",
  timeout: 360_000,
  run: async (t) => {
    if (!/use-fake-device-for-media-stream/.test(process.env.CHROMIUM_ARGS || "")) t.skip("run with CHROMIUM_ARGS set to a fake microphone");
    const seller = t.account({ kind: "particular" });
    const page = await t.page({ as: seller.email, permissions: ["microphone"] });
    await t.goto(page, "/mi-cuenta/publicar");
    await c.fillSell(page, { brand: "Fender", model: "Blues Junior", type: "Amplificadores", category: "Amplificadores", price: "2600",
      description: "Amplificador valvular en buen estado, suena limpio y con mucho cuerpo, sin ruidos." });
    const form = c.sellForm(page);
    const started = Date.now();
    await form.getByRole("button", { name: "Grabar sonido" }).click();
    const stop = form.getByRole("button", { name: /^Detener \(\d+ s\)$/ });
    await stop.waitFor({ timeout: 15_000 });
    const label = await stop.innerText();
    await page.waitForTimeout(3000);
    t.check(/^Detener \(\d+ s\)$/.test(label), `recording shows the time left (${label})`);
    await form.getByRole("button", { name: "Quitar sonido" }).waitFor({ timeout: 45_000 });
    const seconds = (Date.now() - started) / 1000;
    t.check(seconds < 30, `the recording stopped by itself at the limit (${seconds.toFixed(1)} s after Grabar)`);
    await c.until(async () => !(await form.getByText("Subiendo…").count()), { timeout: 60_000 });
    await t.shot(page, "clip");
    await c.continueStep(page);
    await c.publish(page);
    const listing = c.newestListing(seller.id);
    const [clip] = t.sql(`select clip_url, mime_type, duration_seconds from public.listing_sound_clips where listing_id = ${L(listing.id)}`);
    t.check(clip && Number(clip.duration_seconds) <= 20 && Number(clip.duration_seconds) >= 15, `the clip is saved with the listing, ${clip?.duration_seconds} s (${clip?.mime_type})`);
    const hidden = c.rows(null, `select listing_id from public.listing_sound_clips where listing_id = ${L(listing.id)}`);
    t.check(hidden.length === 0, "while the listing is pending its clip is hidden from the public");

    const admin = await t.page({ as: t.demo.admin });
    const clipRequests = [];
    admin.on("request", (request) => { if (request.url().includes("listing-sound-clips")) clipRequests.push(request.url()); });
    const detail = await c.adminItem(t, admin, "publicaciones", listing.id, listing.title);
    const audio = detail.getByLabel("Escuchar el sonido de la publicación");
    t.check(await audio.count() === 1 && await audio.getAttribute("preload") === "none" && await audio.evaluate((node) => !node.autoplay && node.paused),
      "the Admin queue offers the clip with preload none, not playing");
    await admin.waitForTimeout(1500);
    t.check(clipRequests.length === 0, `the Admin queue does not load the clip before a tap (${clipRequests.length} requests)`);
    await audio.evaluate((node) => node.play().catch(() => null));
    await c.until(() => clipRequests.length > 0, { timeout: 10_000 });
    t.check(clipRequests.length > 0, "a tap loads it");
    await t.shot(admin, "admin");
    await detail.getByRole("button", { name: `Aprobar: ${listing.id}` }).click();
    await c.until(() => t.sql(`select status from public.listings where id = ${L(listing.id)}`)[0].status === "approved", { timeout: 20_000 });

    const visitor = await t.page({ phone: true });
    const publicRequests = [];
    visitor.on("request", (request) => { if (request.url().includes("listing-sound-clips")) publicRequests.push(request.url()); });
    await t.goto(visitor, `/instrumentos/${listing.slug}`);
    const section = visitor.getByRole("region", { name: "Cómo suena" });
    const player = section.getByLabel("Escuchar cómo suena el instrumento");
    t.check(await player.count() === 1 && await player.getAttribute("preload") === "none" && await player.evaluate((node) => node.paused),
      `the approved listing shows Cómo suena with preload none (${(await section.innerText()).replace(/\s+/g, " ")})`);
    await visitor.waitForTimeout(1500);
    t.check(publicRequests.length === 0, `the listing does not load the clip before a tap (${publicRequests.length} requests)`);
    await player.evaluate((node) => node.play().catch(() => null));
    await c.until(() => publicRequests.length > 0, { timeout: 10_000 });
    t.check(publicRequests.length > 0, "a tap loads it");
    t.check(c.rows(null, `select listing_id from public.listing_sound_clips where listing_id = ${L(listing.id)}`).length === 1, "once approved the clip is public");
    await t.shot(visitor, "listing");
  },
});

// SHOP 06: Valores por defecto sets the condition and the standard text; new store listings start with both; the
// 40-character minimum counts only the seller's own words.
cases.push({
  id: "EASE-319",
  run: async (t) => {
    const owner = t.account({ kind: "store_owner" });
    t.store(owner, { verified: false });
    const footer = "Garantía de la tienda por 3 meses. Puedes probarlo en el local de lunes a sábado.";
    const page = await t.page({ as: owner.email });
    await t.goto(page, "/mi-cuenta/tienda/valores-por-defecto");
    await page.getByLabel("Condición más habitual").selectOption({ label: "Nuevo" }).catch(async () => page.getByLabel("Condición más habitual").selectOption("Nuevo"));
    await page.getByLabel("Texto al final de cada descripción").fill(footer);
    await page.getByRole("button", { name: "Guardar valores" }).click();
    await page.getByText("Guardado. Se usarán en tus próximas publicaciones.").waitFor({ timeout: 15_000 });
    t.check(true, "Valores por defecto saves the condition and the standard text");
    await t.goto(page, "/mi-cuenta/tienda/publicar");
    await c.fillSell(page, { brand: "Roland", model: "FP-30X", type: "Teclados y pianos", category: "Teclados y pianos", condition: null, description: null, price: "2900" });
    const form = c.sellForm(page);
    const condition = await form.locator('input[name="condition"]:checked').getAttribute("value").catch(() => null);
    const description = await form.locator("#venta-description").inputValue();
    t.check(condition === "Nuevo", `a new store listing starts with the default condition (${condition})`);
    t.check(description.trim() === footer && description.startsWith("\n"), "and with the standard text at the end of the description");
    const counter = (await form.locator("p[aria-live=polite]").filter({ hasText: /caracteres/ }).innerText()).trim();
    t.check(/^0 de 40 caracteres mínimos, sin contar el texto de tu tienda$/.test(counter), `the counter does not count the standard text (${counter})`);
    await c.continueStep(page);
    const summary = (await form.innerText()).replace(/\s+/g, " ");
    const stayed = await form.getByRole("heading", { name: /Estado y precio/ }).count();
    t.check(stayed === 1 && /al menos 40 caracteres/.test(summary), `Continuar with only the standard text asks for the seller's own words (${(summary.match(/Revisa[^.]*\.[^.]*\./) || [""])[0]})`);
    await t.shot(page, "only-footer");
    await form.locator("#venta-description").evaluate((node) => node.focus());
    await form.locator("#venta-description").press("Control+Home");
    await page.keyboard.type("Piano digital nuevo de exhibición, con pedal y atril incluidos.");
    await c.continueStep(page);
    t.check(/Revisar y publicar/.test(await form.getByRole("heading", { level: 2 }).first().innerText()), "with 40 characters of the seller's own it continues");
    await c.publish(page);
    const listing = c.newestListing(owner.id);
    t.check(listing.condition === "Nuevo" && listing.description.endsWith(footer) && listing.description.startsWith("Piano digital"),
      "the listing is sent with the condition and the standard text at the end");
  },
});

// STOCK 09: a SKU remembers its listing details; Publicar este SKU starts with them after publishing and unlinking,
// and after editing Datos para publicar.
cases.push({
  id: "EASE-320",
  run: async (t) => {
    const owner = t.account({ kind: "store_owner" });
    t.store(owner, { inventory: true });
    const item = c.sku(owner, { merchant_sku: `C320${t.tag().slice(-4).toUpperCase()}`, product_name: "Ibanez Gio", unit_price_pen: 900 });
    const page = await t.page({ as: owner.email });
    await t.goto(page, `/mi-cuenta/tienda/publicar?sku=${item.id}`);
    const description = "Guitarra Ibanez Gio nueva, ideal para empezar; incluye cable y uñetas de regalo.";
    await c.fillSell(page, { brand: "Ibanez", model: "GRX70QA", condition: "Nuevo", price: "900", description });
    await c.continueStep(page);
    await c.publish(page);
    const [{ listing_details: details, listing_id: linked }] = t.sql(`select listing_details, listing_id from public.store_inventory_items where id = ${L(item.id)}`);
    t.check(Boolean(linked) && details?.brand === "Ibanez" && details?.model === "GRX70QA" && details?.condition === "Nuevo" && details?.description === description,
      `publishing the SKU saves its listing details (${JSON.stringify(details)})`);
    await t.goto(page, `/mi-cuenta/tienda/inventario/${item.id}`);
    await page.getByRole("button", { name: "Desvincular" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Desvincular" }).click();
    await c.until(() => !t.sql(`select listing_id from public.store_inventory_items where id = ${L(item.id)}`)[0].listing_id, { timeout: 15_000 });
    t.check(true, "Desvincular unlinks the listing");
    await page.reload({ waitUntil: "load" });
    await page.getByRole("link", { name: "Publicar este SKU" }).click();
    await page.waitForURL(/sku=/);
    await c.fillSell(page, { brand: null, model: null, condition: null, price: null, description: null, stopAfter: 2 });
    const form = c.sellForm(page);
    const step2 = { brand: await form.getByLabel("Marca", { exact: true }).inputValue(), model: await form.getByLabel("Modelo", { exact: true }).inputValue() };
    await c.continueStep(page);
    const step3 = {
      condition: await form.locator('input[name="condition"]:checked').getAttribute("value").catch(() => null),
      description: await form.locator("#venta-description").inputValue(),
    };
    t.check(step2.brand === "Ibanez" && step2.model === "GRX70QA" && step3.condition === "Nuevo" && step3.description === description,
      `Publicar este SKU starts with its brand, model, condition and description (${JSON.stringify({ ...step2, ...step3 })})`);
    await t.shot(page, "again");

    await t.goto(page, `/mi-cuenta/tienda/inventario/${item.id}`);
    const panel = page.locator("details", { hasText: "Datos para publicar" });
    await panel.locator("summary").click();
    await panel.getByLabel("Modelo").fill("GRX70QA-SB");
    await panel.getByRole("button", { name: "Guardar datos" }).click();
    await page.getByText("Guardado. Se usarán la próxima vez que publiques este SKU.").waitFor({ timeout: 15_000 });
    await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("laria:venta:")).forEach((key) => localStorage.removeItem(key)));
    await t.goto(page, `/mi-cuenta/tienda/publicar?sku=${item.id}`);
    await c.fillSell(page, { brand: null, model: null, condition: null, price: null, description: null, stopAfter: 2 });
    const edited = await form.getByLabel("Modelo", { exact: true }).inputValue();
    t.check(edited === "GRX70QA-SB", `after editing Datos para publicar it starts with the edited model (${edited})`);
  },
});

module.exports = cases;
