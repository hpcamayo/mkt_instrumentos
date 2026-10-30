// Helpers for checks-c.cjs (group C: the sell form, EASE-300..320, and my listings, EASE-400..432). Fixtures go
// through the functions the app calls, as their owner (sqlAs), and anything that would touch rows other than the
// case's own runs inside a transaction that is rolled back.
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const h = require("./harness.cjs");

const L = h.literal;
const ROOT = path.join(__dirname, "..", "..", "..");
const STORAGE = process.env.STORAGE_DIR || "/tmp/laria-prototype/storage";
const SAMPLES = process.env.PHOTO_DIR || "/tmp/laria-prototype/storage/listing-photos/descubrir";

// harness.sqlAs reads one output line, and json_agg puts each row on its own line: several rows come back as one jsonb
// value instead (jsonb prints on one line).
function rows(userId, query, options) {
  const [row] = h.sqlAs(userId, `select coalesce(jsonb_agg(q), '[]'::jsonb) as rows from (${query}) q`, options);
  return row ? row.rows : [];
}

// The same, for a call that may be refused: { ok, rows } or { ok: false, error } with the database's message.
function attempt(userId, query, options) {
  try {
    return { ok: true, rows: rows(userId, query, options) };
  } catch (error) {
    if (error instanceof h.LocalOnly || error instanceof h.LiveUnsafe) throw error;
    const text = `${error.stderr || ""}${error.message || ""}`;
    const line = text.split("\n").find((part) => /ERROR:/.test(part)) || text.split("\n")[0];
    return { ok: false, error: line.replace(/^.*ERROR:\s*/, "").trim() };
  }
}

// Statements and a final query in one transaction that is rolled back: nothing it does is kept. Returns the query's rows.
function rolledBack(statements, query) {
  if (h.LIVE) throw new h.LocalOnly("rolled-back fixture SQL only runs on the local stack");
  const out = execFileSync("psql", [h.PG, "-At", "-v", "ON_ERROR_STOP=1", "-c",
    `begin; select set_config('app.allow_listing_admin_fields', 'true', true); ${statements}; ` +
    `select coalesce(jsonb_agg(q), '[]'::jsonb) from (${query}) q; rollback;`], { encoding: "utf8" });
  const lines = out.split("\n").filter((line) => line.startsWith("["));
  return JSON.parse(lines[lines.length - 1] || "[]");
}

// A buyer's WhatsApp contact on a listing, as the contact route records it, some days ago.
function contact(listingId, buyerId, { daysAgo = 4, hoursAgo = 0, intent = null } = {}) {
  const [row] = h.sql(`select owner_user_id, store_id from public.listings where id = ${L(listingId)}`);
  h.exec(`insert into public.marketplace_events (event_type, listing_id, store_id, seller_user_id, actor_user_id, source, metadata, created_at)
    values ('whatsapp_contact', ${L(listingId)}, ${L(row.store_id)}, ${L(row.owner_user_id)}, ${L(buyerId)}, 'detail',
      ${L(JSON.stringify(intent ? { intent } : {}))}::jsonb, now() - make_interval(days => ${Number(daysAgo)}, hours => ${Number(hoursAgo)}))`);
}

// Width, height and the metadata blocks of a JPEG, from its markers.
function jpeg(file) {
  const data = fs.readFileSync(file);
  const info = { bytes: data.length, width: null, height: null, exif: false, gps: false, app1: 0, jpeg: data[0] === 0xff && data[1] === 0xd8 };
  let at = 2;
  while (at + 4 <= data.length && data[at] === 0xff) {
    const marker = data[at + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = data.readUInt16BE(at + 2);
    const body = data.subarray(at + 4, at + 2 + length);
    if (marker === 0xe1) {
      info.app1 += 1;
      if (body.subarray(0, 6).toString("latin1") === "Exif\0\0") {
        info.exif = true;
        // The GPS IFD pointer tag (0x8825), in either byte order.
        info.gps = body.includes(Buffer.from([0x88, 0x25])) || body.includes(Buffer.from([0x25, 0x88]));
      }
    }
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      info.height = body.readUInt16BE(1);
      info.width = body.readUInt16BE(3);
    }
    at += 2 + length;
  }
  return info;
}

// Phone-sized test photos: gps (4032 x 3024, 5.5 to 8.5 MB, Apple EXIF with a GPS position in Lima) and big (4800 x
// 3600, about 10 MB, same EXIF). Made once per machine from a sample photo, with Pillow.
const PHOTO_SCRIPT = `
import io, os, sys
from PIL import Image
out, src_path = sys.argv[1], sys.argv[2]
src = Image.open(src_path).convert("RGB")
def build(size, amp):
    return Image.blend(src.resize(size, Image.LANCZOS), Image.effect_noise(size, amp).convert("RGB"), 0.35)
def exif():
    e = Image.Exif(); e[0x010F] = "Apple"; e[0x0110] = "iPhone 15"
    e[0x8825] = {1: "S", 2: (12.0, 2.0, 46.0), 3: "W", 4: (77.0, 1.0, 42.0), 5: 0, 6: 150.0}
    return e.tobytes()
def save(img, name, lo, hi):
    for q in (98, 96, 95, 93, 90, 88, 85, 80, 75, 70):
        buf = io.BytesIO(); img.save(buf, "JPEG", quality=q, exif=exif(), subsampling=0)
        if lo <= buf.tell() <= hi:
            open(os.path.join(out, name), "wb").write(buf.getvalue()); return True
    return False
for amp in (40, 60, 80, 100, 128):
    if save(build((4032, 3024), amp), "gps-6mb.jpg", 5.5e6, 8.5e6): break
for amp in (60, 80, 100, 128):
    if save(build((4800, 3600), amp), "big-10mb.jpg", 9.5e6, 11.5e6): break
`;
function phonePhoto(kind) {
  const dir = path.join(os.tmpdir(), "ease-c-photos");
  const file = path.join(dir, kind === "big" ? "big-10mb.jpg" : "gps-6mb.jpg");
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync("python3", ["-I", "-c", PHOTO_SCRIPT, dir, samples(1)[0]], { stdio: "pipe" });
  }
  return file;
}

// Sample photos (1440 x 1080 JPEGs) from the local stack's storage.
function samples(count, offset = 0) {
  const files = fs.readdirSync(SAMPLES).filter((name) => name.endsWith(".jpg")).sort();
  return Array.from({ length: count }, (_, n) => path.join(SAMPLES, files[(offset + n) % files.length]));
}

// Objects a user uploaded (storage.objects, written by the local gateway), newest first.
const objects = (userId, bucket, since = "-infinity") => h.sql(`select bucket_id, name, created_at, metadata from storage.objects
  where coalesce(owner_id, owner::text) = ${L(userId)} and bucket_id = ${L(bucket)} and created_at > ${L(since)}::timestamptz order by created_at desc`);
function diskPath(bucket, name) {
  if (h.LIVE) {
    const file = path.join(os.tmpdir(), "ease-owned-images", h.live.RUN, bucket, name);
    const bytes = h.live.photoBytes(bucket, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    return file;
  }
  const file = path.join(STORAGE, bucket, name);
  if (!fs.existsSync(file)) {
    const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n").filter(Boolean).map((line) => {
      const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)];
    }));
    const origin = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
    if (!["localhost", "127.0.0.1"].includes(origin.hostname)) throw new Error("image inspection requires a local Supabase");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    execFileSync("curl", ["-fsS", "--max-time", "30", "-H", `Authorization: Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      `${origin.origin}/storage/v1/object/authenticated/${bucket}/${name.split("/").map(encodeURIComponent).join("/")}`, "-o", file]);
  }
  return file;
}
// The stored file of a public photo URL (…/storage/v1/object/public/<bucket>/<name>).
function photoFile(url) {
  const match = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec(url || "");
  return match ? diskPath(match[1], decodeURIComponent(match[2])) : null;
}

// ------------------------------------------------------------------ the sell form

const sellForm = (page) => page.locator("form").filter({ has: page.getByRole("navigation", { name: "Pasos para publicar" }) });

async function continueStep(page) {
  await sellForm(page).getByRole("button", { name: "Continuar", exact: true }).click();
  await page.waitForTimeout(400);
}

// Steps 1 to 3 of Publicar, for a Particular: photos, guitar, brand and model, condition, price, description.
async function fillSell(page, { photos = samples(2), category = "Guitarras", type = "Guitarras eléctricas", brand = "Fender",
  model = "Player Stratocaster", title = null, condition = "Usado - buen estado", price = "1800",
  description = "Guitarra en muy buen estado, con estuche y cuerdas nuevas, lista para tocar.", stopAfter = 3 } = {}) {
  const form = sellForm(page);
  await form.waitFor({ timeout: 30_000 });
  if (category) {
    const chip = form.getByRole("button", { name: category, exact: true });
    if ((await chip.getAttribute("aria-pressed")) !== "true") await chip.click();
  }
  if (photos.length) await page.locator("#venta-fotos").setInputFiles(photos);
  await waitUploads(page, 60_000, photos.length);
  if (stopAfter === 1) return;
  await continueStep(page);
  if (type) await chooseType(form, type);
  if (brand !== null) await form.getByLabel("Marca", { exact: true }).fill(brand);
  if (model !== null) await form.getByLabel("Modelo", { exact: true }).fill(model);
  if (title !== null) await form.getByLabel("Título", { exact: true }).fill(title);
  if (stopAfter === 2) return;
  await continueStep(page);
  if (condition) await form.locator(`input[name="condition"][value="${condition}"]`).check({ force: true });
  if (price !== null) await form.getByLabel("Precio en soles").fill(String(price));
  if (description !== null) await form.locator("#venta-description").fill(description);
}

// The instrument type radio whose label starts with the given text (Guitarras eléctricas, Amplificadores…).
async function chooseType(form, type) {
  const radios = form.locator('input[name="instrument_type"]');
  await radios.first().waitFor({ timeout: 15_000 });
  const labels = await radios.evaluateAll((nodes) => nodes.map((node) => (node.closest("label")?.innerText || "").trim()));
  const index = labels.findIndex((label) => label.startsWith(type));
  if (index < 0) throw new Error(`no instrument type ${type} (${labels.join(" | ")})`);
  await radios.nth(index).check({ force: true });
}

// Every photo shows Subida (or Reintentar after an error).
async function waitUploads(page, timeout = 60_000, expected = 0) {
  const complete = await until(async () => {
    const busy = await page.getByText(/Subiendo \d+%|Preparando…/).count();
    const uploaded = await page.getByText("Subida", { exact: true }).count();
    return busy === 0 && uploaded >= expected;
  }, { timeout });
  if (!complete) throw new Error(`Photo uploads did not finish (${await page.getByText("Subida", { exact: true }).count()} of ${expected})`);
}

// Step 4: accept the rules and press Publicar; wait for the confirmation.
async function publish(page) {
  const form = sellForm(page);
  const rules = form.locator("#venta-marketplace_rules");
  if (await rules.count()) await rules.check({ force: true });
  await form.getByRole("button", { name: "Publicar", exact: true }).click();
  await page.getByRole("button", { name: "Publicar uno parecido" }).waitFor({ timeout: 60_000 });
}

// The newest listing of an owner (with photos), as Publicar created it.
function newestListing(ownerId) {
  const [row] = h.sql(`select l.*, (select coalesce(json_agg(p.image_url order by p.sort_order), '[]') from public.listing_photos p where p.listing_id = l.id) as photos
    from public.listings l where l.owner_user_id = ${L(ownerId)} order by l.created_at desc limit 1`);
  return row || null;
}

// ------------------------------------------------------------------ e-mails

// Renders a marketplace e-mail with lib/email/templates.ts (the worker's renderer) in a child process.
function renderEmail(payload, baseUrl = h.BASE) {
  const code = `const { renderMarketplaceEmail } = require(${JSON.stringify(path.join(ROOT, "lib/email/templates.ts"))});
    const input = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
    process.stdout.write(JSON.stringify(renderMarketplaceEmail(input.payload, input.baseUrl)));`;
  const out = execFileSync(process.execPath, ["--require", path.join(ROOT, "tests/setup-alias.cjs"), "-e", code],
    { cwd: ROOT, input: JSON.stringify({ payload, baseUrl }), encoding: "utf8" });
  return JSON.parse(out);
}

function emailPayload(eventType, { listing = null, transaction = null, reason, email = "ease@laria.test", name = "Prueba" } = {}) {
  return {
    delivery_id: "00000000-0000-4000-8000-0000000000c1", event_type: eventType, attempt_count: 0, recipient_email: email,
    recipient_name: name, context: reason ? { reason } : {}, listing, store: null, transaction, search_alert: null,
  };
}

// ------------------------------------------------------------------ pages

async function mainText(page) {
  const text = await page.locator("main").first().innerText({ timeout: 15_000 }).catch(() => page.locator("body").innerText());
  return text.replace(/[ \t ]+/g, " ");
}

// Waits until fn() is truthy (polling), or the timeout passes; returns the last value.
async function until(fn, { timeout = 15_000, every = 300 } = {}) {
  const end = Date.now() + timeout;
  let value;
  do {
    value = await fn();
    if (value) return value;
    await h.sleep(every);
  } while (Date.now() < end);
  return value;
}

const adminId = () => h.sql(`select id from auth.users where email = ${L(h.DEMO.admin)}`)[0].id;

// Opens one item of an Admin queue and selects it. publicaciones: pending listings by created_at; revisiones: pending
// revisions by submitted_at; 20 a page, so the page is worked out from the item's place.
async function adminItem(t, page, queue, id, title) {
  const rank = queue === "revisiones"
    ? h.sql(`select count(*)::int as n from public.listing_revisions r, public.listing_revisions me where me.id = ${L(id)}
        and r.status = 'pending' and (r.submitted_at, r.id) < (me.submitted_at, me.id)`)[0].n
    : h.sql(`select count(*)::int as n from public.listings l, public.listings me where me.id = ${L(id)}
        and l.status = 'pending' and (l.created_at, l.id) < (me.created_at, me.id)`)[0].n;
  const first = Math.floor(rank / 20) + 1;
  for (const number of [first, first - 1, first + 1].filter((n) => n >= 1)) {
    await t.goto(page, `/admin?cola=${queue}&pagina=${number}`);
    const item = page.locator("button[aria-controls='moderation-detail']").filter({ hasText: title });
    if (await item.count()) {
      await item.first().click();
      await page.locator("#moderation-detail").getByRole("button", { name: new RegExp(`: ${id}$`) }).first().waitFor({ timeout: 15_000 });
      return page.locator("#moderation-detail");
    }
  }
  throw new Error(`${title} is not in the ${queue} queue near page ${first}`);
}

// A SKU through create_inventory_item, as the owner (fields: merchant_sku, product_name, unit_price_pen…).
function sku(owner, fields, quantity = 2) {
  const [row] = h.sqlAs(owner.id, `select public.create_inventory_item(${L(JSON.stringify(fields))}::jsonb, ${Number(quantity)}, ${L(`c-${h.tag()}`)}) as r`);
  return row.r.item;
}

module.exports = {
  L, ROOT, STORAGE, rows, attempt, rolledBack, contact, jpeg, phonePhoto, samples, objects, diskPath, photoFile, sellForm,
  continueStep, fillSell, chooseType, waitUploads, publish, newestListing, renderEmail, emailPayload, mainText, until, adminId, adminItem, sku,
};
