// Group E: the AI helpers (EASE-860 to EASE-878). Browser parts run on server C (next dev with LARIA_AI_FAKE=1, never a
// live Anthropic call) or, for EASE-860, on server A where the helpers are off. Code-level cases rest on main's suite.
"use strict";
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const h = require("./harness.cjs");
const x = require("./e-local.cjs");

const L = x.L;
const AI_TEST = "tests/maybes-ai.test.cjs";
const AI_SQL = "tests/maybes-ai.sql";
const PHOTO_DIR = process.env.PHOTO_DIR || "/tmp/laria-prototype/storage/listing-photos/descubrir";
const norm = (text) => String(text || "").replace(/\s+/g, " ").trim();
const photos = (count) => fs.readdirSync(PHOTO_DIR).filter((name) => name.endsWith(".jpg")).sort().slice(0, count).map((name) => `${PHOTO_DIR}/${name}`);

// What a source file says, read where the suite has no assertion for it (a local source check, not CI).
function sourceSays(t, file, text, what) {
  t.check(x.source(file).includes(text), `${what} (${file}: "${text.slice(0, 110)}")`);
}

// The request lib/ai/claude.ts builds for each model, built in a child process the way the suite loads it.
function requestShapes(models) {
  const script = `
const Module = require("node:module");
const load = Module._load;
Module._load = function (request, ...rest) { return request === "server-only" ? {} : load.call(this, request, ...rest); };
const { structuredRequest } = require("./lib/ai/claude.ts");
const call = { system: "S", content: [{ type: "text", text: "q" }], schema: { type: "object" }, effort: "low", maxTokens: 100, timeoutMs: 1000, retries: 0 };
const out = {};
for (const model of ${JSON.stringify(models)}) {
  const request = structuredRequest(model, call);
  out[model] = { betas: request.betas || null, fallbacks: request.fallbacks || null, keys: Object.keys(request).sort(), output: Object.keys(request.output_config || {}).sort() };
}
console.log(JSON.stringify(out));`;
  const out = execFileSync("node", ["--require", "./tests/setup-alias.cjs", "-e", script], { cwd: x.REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out.trim().split("\n").pop());
}

// A store with Inventario and guitars at 2, 1 and 3 units (low at 2 or fewer) and one pedal.
function askStore() {
  const { owner, store } = x.inventoryStore();
  const tag = h.tag().slice(-6).toUpperCase();
  const make = (sku, name, quantity, category) => {
    const item = x.sku(owner, { merchant_sku: sku, product_name: name, unit_price_pen: 900, low_stock_threshold: 2 }, quantity);
    h.exec(`update public.store_inventory_items set category = ${L(category)} where id = ${L(item.id)}`);
    return item;
  };
  const items = {
    two: make(`G2${tag}`, "Guitarra dos", 2, "guitars"),
    one: make(`G1${tag}`, "Guitarra una", 1, "guitars"),
    three: make(`G3${tag}`, "Guitarra tres", 3, "guitars"),
    pedal: make(`P1${tag}`, "Pedal uno", 1, "pedals"),
  };
  return { owner, store, items };
}

// Asks from Mi tienda's box. With a destination the page moves to it and shows "Así lo entendí"; without one the box
// answers in place (role=status).
async function ask(page, t, question, { navigates = true } = {}) {
  await t.goto(page, "/mi-cuenta/tienda");
  await page.getByLabel("Tu pregunta").fill(question);
  const before = page.url();
  await page.getByRole("button", { name: "Preguntar", exact: true }).click();
  if (!navigates) {
    const status = page.getByRole("status").filter({ hasText: /No encontré|No pudimos|Escribe/ }).first();
    await status.waitFor({ timeout: 60_000 }).catch(() => {});
    return (await status.textContent().catch(() => "")) || "";
  }
  await page.waitForURL((url) => url.href !== before, { timeout: 60_000 }).catch(() => {});
  await page.locator("#asi-lo-entendi").waitFor({ timeout: 60_000 }).catch(() => {});
  return page.url();
}

async function panel(page) {
  const heading = page.locator("#asi-lo-entendi");
  if (!(await heading.count())) return null;
  return heading.evaluate((node) => {
    const section = node.closest("section");
    return {
      heading: node.textContent.replace(/\s+/g, " ").trim(),
      chips: [...section.querySelectorAll('[aria-label="Filtros que usé"] a, [aria-label="Filtros que usé"] button')].map((chip) => ({
        text: chip.textContent.replace(/\s+/g, " ").trim(), label: chip.getAttribute("aria-label") || "", href: chip.getAttribute("href") || "",
      })),
      text: section.textContent.replace(/\s+/g, " ").trim(),
    };
  });
}

// A JPEG's size and whether it carries metadata (EXIF/XMP APP1 or IPTC APP13), from its bytes.
function jpegInfo(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return { jpeg: false, bytes: buffer.length };
  let offset = 2;
  let width = 0;
  let height = 0;
  let metadata = false;
  while (offset + 4 < buffer.length && buffer[offset] === 0xff) {
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker === 0xe1 || marker === 0xed) metadata = true;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      height = buffer.readUInt16BE(offset + 5);
      width = buffer.readUInt16BE(offset + 7);
      break;
    }
    offset += 2 + length;
  }
  return { jpeg: true, width, height, metadata, bytes: buffer.length };
}

// A real JPEG of at most 600 px a side (a screenshot of the page).
async function smallJpeg(page) {
  const scale = await page.evaluate(() => window.devicePixelRatio || 1);
  const side = Math.floor(600 / scale);
  return page.screenshot({ type: "jpeg", quality: 60, clip: { x: 0, y: 0, width: side, height: Math.floor(side * 0.75) } });
}

// Publicar up to step 2 ("Qué es"), where Completar con IA lives, with the first photos of the local set.
async function sellWithPhotos(t, page, count) {
  await t.goto(page, "/mi-cuenta/publicar");
  const form = page.locator("form").filter({ has: page.getByRole("navigation", { name: "Pasos para publicar" }) });
  await form.waitFor({ timeout: 60_000 });
  await form.getByRole("button", { name: "Pedales", exact: true }).click().catch(() => {});
  await page.locator("#venta-fotos").setInputFiles(photos(count));
  await x.until(async () => (await page.getByText(/Subiendo \d+%|Preparando…/).count()) === 0, { timeout: 90_000 });
  for (let attempt = 0; attempt < 5 && !(await form.getByLabel("Marca", { exact: true }).count()); attempt += 1) {
    await form.getByRole("button", { name: "Continuar", exact: true }).click();
    await h.sleep(1_500);
  }
  return form;
}

async function suggestions(page) {
  await page.getByRole("button", { name: "Completar con IA" }).click();
  const region = page.getByRole("region", { name: "Sugerencias a partir de tus fotos" });
  await region.waitFor({ timeout: 90_000 });
  return region;
}

const AI_ORDER = ["EASE-860", "EASE-861", "EASE-862", "EASE-863", "EASE-865", "EASE-866", "EASE-867", "EASE-868", "EASE-869", "EASE-870", "EASE-871", "EASE-872", "EASE-873",
  "EASE-874", "EASE-875", "EASE-876", "EASE-877", "EASE-878", "EASE-864"];

const checks = [
  {
    id: "EASE-860",
    timeout: 300_000,
    async run(t) {
      x.ciAsserts(t, AI_TEST, ["off unless the key and LARIA_AI_HELPERS=1 are both set", "refuses before any AI call when it is off", "the pages show the helpers only with the server's flag"]);
      const { owner } = x.inventoryStore();
      const page = await t.page({ as: owner.email });
      for (const route of ["/mi-cuenta/tienda", "/mi-cuenta/tienda/inventario", "/mi-cuenta/tienda/estadisticas", "/mi-cuenta/tienda/inventario/reponer"]) {
        await t.goto(page, route);
        t.check(await page.getByRole("heading", { name: "Pregúntale a tu tienda" }).count() === 0 && await page.getByLabel("Tu pregunta").count() === 0,
          `server A (no AI switches): ${route} shows no Pregúntale a tu tienda`);
      }
      const seller = t.account({ kind: "particular" });
      const sell = await t.page({ as: seller.email });
      const form = await sellWithPhotos(t, sell, 2);
      t.check(await form.getByLabel("Marca", { exact: true }).count() === 1, "Publicar reaches Qué es with the required two photos");
      t.check(await sell.getByRole("button", { name: /Completar con IA/ }).count() === 0, "and shows no Completar con IA");
      await t.shot(sell, "publicar");
      for (const route of ["/api/store/ask", "/api/listing-assist"]) {
        const answer = await x.call(page, t.base, "POST", route, { question: "¿qué guitarras tengo?", photos: [] });
        t.check(answer.status === 404, `${route} answers ${answer.status}`);
        const garbage = await page.request.fetch(t.url(route), { method: "POST", headers: { origin: new URL(t.base).origin, "content-type": "application/json" }, data: "{no es json" });
        t.check(garbage.status() === 404, `${route} answers ${garbage.status()} to a body it can't read, so before reading it`);
      }
    },
  },
  {
    id: "EASE-861",
    async run(t) {
      x.ciAsserts(t, AI_TEST, ["the fake client answers only under next dev with LARIA_AI_FAKE=1, and a production build refuses the flag", "process\\.env\\.LARIA_AI_FAKE\\) \\{\\n\\s+throw new Error"]);
      t.note("pnpm build itself was not run; the refusal rests on the suite's check of next.config.ts");
    },
  },
  {
    id: "EASE-862",
    async run(t) {
      x.ciAsserts(t, AI_TEST, ["a request is structured output with an effort, no thinking or sampling fields, and fallbacks only where they exist", "Claude Haiku 5.5 has no server-side fallback"]);
      const shapes = requestShapes(["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1", "claude-haiku-5-5"]);
      for (const model of ["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"]) {
        const shape = shapes[model];
        t.check(shape.fallbacks === "default" && JSON.stringify(shape.betas) === '["server-side-fallback-2026-07-01"]', `local: ${model} sends fallbacks default with its beta`);
      }
      t.check(shapes["claude-haiku-5-5"].fallbacks === null && shapes["claude-haiku-5-5"].betas === null, "local: claude-haiku-5-5 sends neither");
      t.check(Object.values(shapes).every((shape) => shape.output.join() === "effort,format" && !shape.keys.some((key) => /thinking|temperature|top_p|top_k/.test(key))),
        `local: every request has output_config.format and effort, and no thinking or sampling field (${shapes["claude-sonnet-5-5"].keys.join(", ")})`);
    },
  },
  {
    id: "EASE-863",
    async run(t) {
      x.ciAsserts(t, AI_TEST, ["the answer is read after checking for a refusal", 'stop: "refusal" }), 422, "AI_REFUSED", "refused"]', 'stop: "max_tokens"', '"invalid"]', '503, "AI_UNAVAILABLE", "invalid"']);
      sourceSays(t, "app/api/store/ask/route.ts", "No pudimos responder esa pregunta. Escríbela con otras palabras o usa los filtros.", "the question's 422 says what to do instead");
      sourceSays(t, "app/api/listing-assist/route.ts", "No pudimos sugerir datos para estas fotos. Completa los campos a mano.", "the photos' 422 says what to do instead");
    },
  },
  {
    id: "EASE-865",
    async run(t) {
      x.ciAsserts(t, AI_TEST, ["the log gets one row per call through public.record_ai_request"]);
      x.ciAsserts(t, AI_SQL, ["RLS is on", "one row per call"]);
      const columns = h.sql(`select string_agg(column_name, ',' order by ordinal_position) as c from information_schema.columns where table_schema = 'laria_private' and table_name = 'ai_requests'`)[0].c;
      t.check(columns === "id,feature,user_id,store_id,model,input_tokens,output_tokens,outcome,created_at", `local: the log holds feature, account, store, model, tokens and outcome, and no content (${columns})`);
      const owner = t.account({ kind: "particular" });
      for (const [role, statement] of [["anon", "set local role anon; select count(*) from laria_private.ai_requests"], ["authenticated", "set local role authenticated; select count(*) from laria_private.ai_requests"]]) {
        const tried = x.attemptExec(statement);
        t.check(!tried.ok, `local: ${role} can't read it (${tried.error || "it could"})`);
      }
      const write = x.attempt(owner.id, "select public.record_ai_request('listing_assist', auth.uid(), null, 'claude-opus-5-5', 1, 1, 'answered') as r");
      t.check(!write.ok && /permission denied/.test(write.error), `local: a signed-in account can't write it (${write.error || "it could"})`);
    },
  },
  { id: "EASE-866", async run(t) { x.ciAsserts(t, AI_SQL, ["one row is older than 90 days", "account_anonymizations_unlink_ai_requests"]); } },
  {
    id: "EASE-867",
    server: "ai",
    timeout: 360_000,
    async run(t) {
      x.ciAsserts(t, AI_TEST, ["answers a store owner with Inventario with a link"]);
      const { owner, items } = askStore();
      const page = await t.page({ as: owner.email });
      const url = new URL(await ask(page, t, "¿qué guitarras tengo con menos de 2 unidades?"));
      t.check(url.pathname === "/mi-cuenta/tienda/inventario" && url.searchParams.get("categoria") === "guitars" && url.searchParams.get("stock") === "low" && url.searchParams.get("orden") === "available_asc",
        `the question opens Inventario (${url.pathname}${url.search})`);
      const seen = await panel(page);
      const chips = (seen?.chips || []).map((chip) => chip.text);
      t.check(chips.some((text) => /Guitarras/.test(text)) && chips.some((text) => /Stock bajo/.test(text)) && chips.some((text) => /Orden/.test(text)), `with Guitarras, Stock bajo and the order as chips (${chips.join(" · ")})`);
      t.check(seen && /No hay un filtro por número de unidades\./.test(seen.text), "Así lo entendí says there is no filter by number of units");
      const text = norm(await x.mainText(page));
      const at = (item) => text.indexOf(item.merchant_sku);
      t.check(at(items.one) >= 0 && at(items.two) > at(items.one), "the least available first (1 unit, then 2)");
      t.check(at(items.pedal) < 0 && at(items.three) < 0, "only the guitars low on stock");
      await t.shot(page, "inventario");
    },
  },
  {
    id: "EASE-868",
    server: "ai",
    timeout: 360_000,
    async run(t) {
      const { owner } = askStore();
      const page = await t.page({ as: owner.email });
      let url = new URL(await ask(page, t, "¿qué es lo más visto esta semana?"));
      let seen = await panel(page);
      t.check(url.pathname === "/mi-cuenta/tienda/estadisticas" && url.searchParams.get("periodo") === "7" && url.searchParams.get("enfoque") === "views",
        `lo más visto opens Estadísticas (${url.pathname}${url.search})`);
      t.check(seen && seen.chips.some((chip) => /7 días/.test(chip.text)) && seen.chips.some((chip) => /visto/i.test(chip.text)), `for 7 days at Lo más visto (${(seen?.chips || []).map((chip) => chip.text).join(" · ")})`);
      await t.shot(page, "estadisticas");
      url = new URL(await ask(page, t, "¿qué vendí más este mes?"));
      seen = await panel(page);
      t.check(url.pathname === "/mi-cuenta/tienda/inventario/reponer", `lo que vendí opens Reposición (${url.pathname}${url.search})`);
      t.check(seen && /Laria aún no ordena los SKU por unidades vendidas\./.test(seen.text) && /Las estadísticas solo tienen 7 días, 30 días o todo el historial\./.test(seen.text),
        "and says sales and dates have no filter");
      await t.shot(page, "reposicion");
    },
  },
  { id: "EASE-869", async run(t) { x.ciAsserts(t, AI_TEST, ['assert.deepEqual(params.messages, [{ role: "user", content: [{ type: "text", text:', "assert.equal(params.system, storeQuestion.storeQuestionSystemPrompt());", "logs the call without its content"]); } },
  { id: "EASE-870", async run(t) { x.ciAsserts(t, AI_TEST, ["the answer's schema is the site's own lists, and anything outside them is refused before a link is built", "at most 60 characters", "search.filters.q.length <= 60"]); } },
  {
    id: "EASE-871",
    server: "ai",
    timeout: 360_000,
    async run(t) {
      x.ciAsserts(t, AI_TEST, ["shows each filter as a chip that removes it, and says plainly what no filter covers"]);
      const { owner } = askStore();
      const page = await t.page({ as: owner.email });
      await ask(page, t, "¿qué guitarras tengo con menos de 2 unidades?");
      const before = await panel(page);
      await page.locator('[aria-label="Filtros que usé"]').getByRole("link").filter({ hasText: "Stock bajo" }).first().click();
      await page.waitForURL((url) => url.searchParams.get("stock") !== "low", { timeout: 30_000 }).catch(() => {});
      await h.sleep(1_000);
      const after = await panel(page);
      t.check(before && after && after.chips.length === before.chips.length - 1 && !after.chips.some((item) => /Stock bajo/.test(item.text)),
        `removing a chip drops that filter and keeps the panel (${(after?.chips || []).map((item) => item.text).join(" · ")})`);
      const params = new URL(page.url()).searchParams.toString();
      await page.locator("section[aria-labelledby=asi-lo-entendi]").getByRole("link", { name: "Cerrar" }).click();
      await page.waitForURL((url) => !url.searchParams.has("asi"), { timeout: 30_000 }).catch(() => {});
      await h.sleep(1_000);
      t.check(await page.locator("#asi-lo-entendi").count() === 0, "Cerrar hides the panel");
      const left = new URL(page.url()).searchParams;
      const kept = [...new URLSearchParams(params)].filter(([key]) => !/^(asi|falta)$/.test(key));
      t.check(kept.length > 0 && kept.every(([key, value]) => left.get(key) === value) && !left.has("asi"), `and leaves the filters (${left.toString()})`);
      const said = norm(await ask(page, t, "¿cómo está el clima hoy?", { navigates: false }));
      t.check(/^No encontré filtros/.test(said) && /por ejemplo, con «[^»]+» o «[^»]+»/.test(said) && new URL(page.url()).pathname === "/mi-cuenta/tienda",
        `a question with nothing to filter says so with examples, in place ("${said.slice(0, 170)}")`);
      await t.shot(page, "nothing");
    },
  },
  {
    id: "EASE-872",
    server: "ai",
    timeout: 300_000,
    async run(t) {
      x.ciAsserts(t, AI_TEST, ["refuses before any AI call when it is off, the account isn't a store with Inventario, or the limits are reached", "store && inventoryEnabled && aiHelpersEnabled"]);
      const particular = t.account({ kind: "particular" });
      const plainOwner = t.account({ kind: "store_owner" });
      t.store(plainOwner, {});
      const box = (page) => page.getByLabel("Tu pregunta").count();
      const p1 = await t.page({ as: particular.email });
      await t.goto(p1, "/mi-cuenta");
      t.check(await box(p1) === 0, "a Particular's Mi cuenta has no box");
      const asked = await x.call(p1, t.base, "POST", "/api/store/ask", { question: "¿qué guitarras tengo agotadas?" });
      t.check(asked.status === 403 && asked.body?.code === "AI_STORE_REQUIRED", `and the route refuses (${asked.status} ${asked.body?.code})`);
      const p2 = await t.page({ as: plainOwner.email });
      await t.goto(p2, "/mi-cuenta/tienda");
      t.check(await box(p2) === 0, "a store without Inventario has no box on Mi tienda");
      const asked2 = await x.call(p2, t.base, "POST", "/api/store/ask", { question: "¿qué guitarras tengo agotadas?" });
      t.check(asked2.status === 403 && asked2.body?.code === "AI_STORE_REQUIRED", `and the route refuses (${asked2.status} ${asked2.body?.code})`);
      const visitor = await t.page({});
      await t.goto(visitor, "/mi-cuenta/tienda");
      t.check(await box(visitor) === 0, `a signed-out visitor gets no box (${new URL(visitor.url()).pathname})`);
      const asked3 = await x.call(visitor, t.base, "POST", "/api/store/ask", { question: "¿qué guitarras tengo agotadas?" });
      t.check(asked3.status === 401, `and the route refuses (${asked3.status} ${asked3.body?.code})`);
      const logged = h.sql(`select count(*)::int as n from laria_private.ai_requests where user_id in (${L(particular.id)}, ${L(plainOwner.id)})`)[0].n;
      t.check(logged === 0, "before any AI call (nothing logged)");
    },
  },
  {
    id: "EASE-873",
    server: "ai",
    timeout: 420_000,
    async run(t) {
      x.ciAsserts(t, AI_TEST, ["refuses anything but one to four small JPEGs, and every refusal comes before the AI call"]);
      const seller = t.account({ kind: "particular" });
      const page = await t.page({ as: seller.email });
      const sent = [];
      page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/listing-assist") sent.push(request.postData() || ""); });
      await sellWithPhotos(t, page, 5);
      await h.sleep(1_500);
      t.check(sent.length === 0, "nothing is sent until the button is tapped (5 photos added, Qué es open)");
      await suggestions(page).catch(() => {});
      t.check(sent.length === 1, `one request when tapped (${sent.length})`);
      const body = JSON.parse(sent[0] || "{}");
      const list = (body.photos || []).map((photo) => Buffer.from(String(photo).replace(/^data:[^,]+,/, ""), "base64"));
      const info = list.map(jpegInfo);
      t.check(list.length >= 1 && list.length <= 4, `up to four photos (${list.length} of 5 chosen)`);
      t.check(info.length > 0 && info.every((item) => item.jpeg && Math.max(item.width, item.height) <= 1024 && item.bytes <= 600 * 1024 && !item.metadata),
        `JPEGs of at most 1024 px and 600 KB without metadata (${info.map((item) => `${item.width}x${item.height} ${Math.round(item.bytes / 1024)} KB${item.metadata ? " with metadata" : ""}`).join(", ")})`);
      await t.shot(page, "suggestions");
      const logged = () => h.sql(`select count(*)::int as n from laria_private.ai_requests where user_id = ${L(seller.id)}`)[0].n;
      const before = logged();
      const jpeg = await smallJpeg(page);
      const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
      const padded = Buffer.concat([jpeg, Buffer.alloc(700 * 1024)]);
      for (const [name, photoList] of [["a PNG", [png]], ["a 700 KB JPEG", [padded]], ["five JPEGs", [jpeg, jpeg, jpeg, jpeg, jpeg]], ["no photo", []]]) {
        const answer = await x.call(page, t.base, "POST", "/api/listing-assist", { photos: photoList.map((bytes) => bytes.toString("base64")) });
        t.check(answer.status === 400 && answer.body?.code === "AI_PHOTOS_INVALID", `${name} is refused (${answer.status} ${answer.body?.code})`);
      }
      t.check(logged() === before, "every refusal comes before any AI call (nothing logged)");
    },
  },
  { id: "EASE-874", async run(t) { x.ciAsserts(t, AI_TEST, ["the suggestion's schema and checks: the registries, the form's sizes, nothing about condition or price", "a bass is not a type of Guitarras", "parsed.title.length <= 100", "no condition or price"]); } },
  {
    id: "EASE-875",
    server: "ai",
    timeout: 420_000,
    async run(t) {
      x.ciAsserts(t, AI_TEST, ["fills one field, and", "fills only what is empty, never what the seller wrote or another instrument's name", "Reemplazar", "clash.held"]);
      const seller = t.account({ kind: "particular" });
      const page = await t.page({ as: seller.email });
      const form = await sellWithPhotos(t, page, 2);
      await form.getByLabel("Marca", { exact: true }).fill("Behringer");
      const region = await suggestions(page);
      const replace = region.getByRole("button", { name: "Reemplazar: Marca" });
      const brandRow = await replace.evaluate((button) => {
        let node = button;
        for (let level = 0; level < 4 && node.parentElement && !/Ahora:/.test(node.textContent); level += 1) node = node.parentElement;
        return node.textContent.replace(/\s+/g, " ").trim();
      }).catch(() => "");
      t.check(/Ahora: Behringer/.test(brandRow), `the brand the seller wrote shows Reemplazar with Ahora: Behringer ("${brandRow.slice(0, 120)}")`);
      await region.getByRole("button", { name: "Usar todo" }).click();
      await h.sleep(800);
      const note = norm(await region.getByRole("status").first().textContent().catch(() => ""));
      const values = { brand: await form.getByLabel("Marca", { exact: true }).inputValue(), model: await form.getByLabel("Modelo", { exact: true }).inputValue() };
      t.check(values.brand === "Behringer" && values.model === "", `Usar todo keeps Behringer and holds the model (${JSON.stringify(values)})`);
      t.check(/^Completamos lo que estaba vacío, menos lo que dice qué equipo es \(/.test(note) && /Modelo/.test(note), `and names what it left ("${note.slice(0, 160)}")`);
      await t.shot(page, "usar-todo");
      await replace.click().catch(() => {});
      await h.sleep(500);
      t.check(await form.getByLabel("Marca", { exact: true }).inputValue() === "Boss", "Reemplazar on the brand uses the suggestion");
    },
  },
  { id: "EASE-876", async run(t) { x.ciAsserts(t, AI_TEST, ["Detalles:\\n- Carcasa naranja", "withFooter.description"]); } },
  {
    id: "EASE-877",
    async run(t) {
      x.ciAsserts(t, AI_TEST, ["recognized: false", 'confidence: "certain" }).confidence, "low"']);
      sourceSays(t, "components/ai/listing-assist.tsx", "No estamos seguros de qué es. Revisa cada dato antes de usarlo.", "a low-confidence answer warns to check each field");
    },
  },
  {
    id: "EASE-878",
    server: "ai",
    timeout: 600_000,
    async run(t) {
      const { owner } = askStore();
      const seller = t.account({ kind: "particular" });
      for (const options of [{ phone: true }, { width: 1280 }]) {
        const width = options.phone ? 390 : 1280;
        const page = await t.page({ ...options, as: owner.email });
        await ask(page, t, "¿qué guitarras tengo con menos de 2 unidades?");
        t.check(await page.locator("#asi-lo-entendi").count() === 1 && await page.getByLabel("Tu pregunta").count() === 1, `${width} px: Inventario shows the question box and Así lo entendí`);
        const inventory = await t.axe(page, `${width} inventario`);
        t.check(inventory.length === 0, `${width} px: ${inventory.length} axe violations there${inventory.length ? ` (${inventory.map((v) => v.id).join(", ")})` : ""}`);
        await t.shot(page, `${width}-inventario`);
        const sell = await t.page({ ...options, as: seller.email });
        await sellWithPhotos(t, sell, 2);
        const region = await suggestions(sell);
        const form = await t.axe(sell, `${width} sugerencias`);
        t.check(form.length === 0, `${width} px: the sell form with suggestions, ${form.length} axe violations${form.length ? ` (${form.map((v) => v.id).join(", ")})` : ""}`);
        const unnamed = await region.evaluate((node) => [...node.querySelectorAll("button")].filter((button) => !(button.getAttribute("aria-label") || button.textContent.trim())).length);
        t.check(unnamed === 0, `${width} px: every suggestion button has a label`);
        await t.shot(sell, `${width}-sugerencias`);
      }
    },
  },
  {
    // Last: it spends a store's 50 questions and an account's 20 photo assists of the day (the site's 500 has room).
    id: "EASE-864",
    server: "ai",
    timeout: 600_000,
    async run(t) {
      x.ciAsserts(t, AI_TEST, ["each call takes its own daily allowance first and the site's after; a counter that can't count refuses", '[{ allowance: "limited" }, "¿Qué tengo agotado?", 429, "AI_LIMIT"]']);
      x.ciAsserts(t, AI_SQL, ["a store asks 50 questions a day, not 51", "an account gets 20 photo assists a day", "the site-wide cap is its own bucket"]);
      const { owner, store } = askStore();
      const page = await t.page({ width: 1280, as: owner.email });
      await t.goto(page, "/mi-cuenta/tienda");
      const statuses = [];
      for (let call = 0; call < 50; call += 1) statuses.push((await x.call(page, t.base, "POST", "/api/store/ask", { question: "¿qué guitarras tengo agotadas?" })).status);
      t.check(statuses.every((status) => status === 200), `local: 50 questions answered (${[...new Set(statuses)].join(", ")})`);
      const over = await x.call(page, t.base, "POST", "/api/store/ask", { question: "¿qué guitarras tengo agotadas?" });
      t.check(over.status === 429 && over.body?.code === "AI_LIMIT" && /Se renueva a las 7 p\. m\., hora de Lima\./.test(over.body?.message || ""), `local: the 51st is refused with the reset time (${over.status} "${over.body?.message}")`);
      const storeRows = h.sql(`select count(*)::int as n, count(*) filter (where feature = 'store_question' and outcome = 'answered' and model is not null and user_id = ${L(owner.id)})::int as good from laria_private.ai_requests where store_id = ${L(store.id)}`)[0];
      t.check(storeRows.n === 50 && storeRows.good === 50, `local: 50 calls logged, none for the 51st (${storeRows.n})`);
      const seller = t.account({ kind: "particular" });
      const sell = await t.page({ width: 1280, as: seller.email });
      await t.goto(sell, "/mi-cuenta");
      const jpeg = (await smallJpeg(sell)).toString("base64");
      const assists = [];
      for (let call = 0; call < 20; call += 1) assists.push((await x.call(sell, t.base, "POST", "/api/listing-assist", { photos: [jpeg] })).status);
      t.check(assists.every((status) => status === 200), `local: 20 photo assists answered (${[...new Set(assists)].join(", ")})`);
      const over2 = await x.call(sell, t.base, "POST", "/api/listing-assist", { photos: [jpeg] });
      t.check(over2.status === 429 && over2.body?.code === "AI_LIMIT" && /7 p\. m\., hora de Lima/.test(over2.body?.message || ""), `local: the 21st is refused (${over2.status} "${over2.body?.message}")`);
      const sellerRows = h.sql(`select count(*)::int as n from laria_private.ai_requests where user_id = ${L(seller.id)}`)[0].n;
      t.check(sellerRows === 20, `local: 20 calls logged, none for the 21st (${sellerRows})`);
      t.note("LARIA_AI_DAILY_CAP (the site's cap) rests on the CI assertions");
    },
  },
];

module.exports = AI_ORDER.map((id) => checks.find((check) => check.id === id));
