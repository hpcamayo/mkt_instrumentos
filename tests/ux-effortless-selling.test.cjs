// Effortless Laria, selling batch (docs/ux-effortless/selling.md).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

function segment(marker, payload) {
  const length = payload.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...payload];
}

test("FIX 02: a JPEG that cannot be redrawn loses its EXIF, XMP and comments but keeps JFIF and the image", () => {
  const { stripJpegMetadata } = require("../components/selling/prepare-photo.ts");
  const exif = [...Buffer.from("Exif\0\0GPS-LAT-12.04")];
  const bytes = Uint8Array.from([
    0xff, 0xd8,
    ...segment(0xe0, [...Buffer.from("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(0xe1, exif),
    ...segment(0xfe, [...Buffer.from("comment")]),
    ...segment(0xdb, [0, 1, 2, 3]),
    0xff, 0xda, 0, 4, 9, 9, 0x12, 0x34, 0xff, 0xd9,
  ]);
  const stripped = Buffer.from(stripJpegMetadata(bytes));
  assert.equal(stripped.includes(Buffer.from("GPS")), false);
  assert.equal(stripped.includes(Buffer.from("comment")), false);
  assert.equal(stripped.includes(Buffer.from("JFIF")), true);
  assert.deepEqual([...stripped.subarray(0, 2)], [0xff, 0xd8]);
  assert.deepEqual([...stripped.subarray(-2)], [0xff, 0xd9]);
  assert.equal(stripJpegMetadata(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), null, "not a JPEG");
  assert.equal(stripJpegMetadata(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff])), null, "a broken segment length is refused");
});

test("FIX 02: create and edit both prepare photos before upload and no longer refuse photos over 5 MB", () => {
  const prepare = source("components/selling/prepare-photo.ts");
  assert.match(prepare, /MAX_PHOTO_SIDE = 2400/);
  assert.match(prepare, /toBlob\(resolve, "image\/jpeg"/);
  const edit = source("components/listing-edit-form.tsx");
  assert.match(edit, /prepareListingPhoto\(photo\.file\)/);
  assert.doesNotMatch(edit, /5 MB o menos/);
});

test("FIX 05: after publishing a SKU the next listing starts without it, with ways back to the SKU and on to the next one", () => {
  const page = source("app/mi-cuenta/tienda/publicar/page.tsx");
  assert.match(page, /requested === "siguiente"/);
  assert.match(page, /\.is\("listing_id", null\)/);
  assert.match(page, /\.eq\("inventory_status", "active"\)/);
  const form = source("components/sell-listing-form.tsx");
  assert.match(form, /setInventorySku\(undefined\)/);
  assert.match(form, /Volver al SKU/);
  assert.match(form, /Publicar el siguiente SKU sin publicación/);
});

test("POST 05, 07, 09, 11: shot lists, titles from brand and model, starters and hints", () => {
  const guidance = require("../lib/sell-guidance.ts");
  assert.ok(guidance.shotList("guitars").some((shot) => shot.id === "frente"));
  assert.ok(guidance.shotList("no-such-category").length >= 3);
  assert.equal(guidance.titleFromBrandModel("Fender", "Player Stratocaster"), "Fender Player Stratocaster");
  assert.equal(guidance.titleFromBrandModel("Fender", "fender stratocaster"), "fender stratocaster");
  assert.equal(guidance.titleFromBrandModel(" ", "SM58"), "SM58");
  assert.equal(guidance.addStarter("Buen estado.", "Incluye estuche"), "Buen estado.\nIncluye estuche");
  assert.equal(guidance.addStarter("Buen estado.\nIncluye estuche", "Incluye estuche"), "Buen estado.\nIncluye estuche");
  assert.ok(guidance.descriptionStarters("amplifiers").includes("Potencia: "));
  const fields = (input) => guidance.sellHints({ photoCount: 4, shots: [], title: "Fender Strat", description: "Muy buena", price: 1500, ...input }).map((hint) => hint.field);
  assert.deepEqual(fields({}), []);
  assert.deepEqual(fields({ photoCount: 2 }), ["photos"]);
  assert.deepEqual(fields({ photoCount: 2, shots: ["frente", "reverso"] }), []);
  assert.deepEqual(fields({ description: "Llámame al 987 654 321" }), ["description"]);
  assert.deepEqual(fields({ description: "ver instagram @guitarras_lima" }), ["description"]);
  assert.deepEqual(fields({ title: "FENDER STRATOCASTER" }), ["title"]);
  assert.deepEqual(fields({ price: 5 }), ["price_pen"]);
});

test("POST 01, 02, 13: drafts round-trip, never reuse photo slots, and 'similar' keeps only shared details", () => {
  const drafts = require("../lib/sell-draft.ts");
  const values = drafts.emptyValues({ category: "guitars", instrumentType: "electric_guitar", brand: "Fender", model: "Strat", title: "Fender Strat", price: "1500", city: "Lima", region: "Lima", description: "Texto" });
  const similar = drafts.similarValues(values);
  assert.equal(similar.brand, "Fender");
  assert.equal(similar.model, "");
  assert.equal(similar.price, "");
  assert.equal(similar.title, "");
  const base = drafts.emptyValues({ city: "Lima", region: "Lima" });
  assert.equal(drafts.hasContent({ values: base, photos: [], soundClip: null }, base), false);
  assert.equal(drafts.hasContent({ values: { ...base, brand: "Ibanez" }, photos: [], soundClip: null }, base), true);
  assert.equal(drafts.localDraftKey("u1", "store_listing", "sku1"), "laria:venta:u1:store_listing:sku1");
  assert.equal(drafts.parseLocalDraft("{broken"), null);
  assert.equal(drafts.parseLocalDraft(JSON.stringify({ version: 2, values: {}, photos: [] })), null);
  const local = { version: 1, savedAt: "2026-10-19T00:00:00Z", submission: { id: "d1", token: "t", folder: "u1/d1" }, nextSlot: 6, values, photos: [{ path: "u1/d1/0.jpg", slot: 0, shot: "frente" }, { path: "u1/d1/5.jpg", slot: 5 }], soundClip: { path: "u1/d1/sonido-3.webm", duration: 8, type: "audio/webm" }, onServer: true };
  const row = drafts.serverDraftRow(local, "listing", "store-ignored");
  assert.equal(row.store_id, null);
  assert.deepEqual(row.photos, [{ path: "u1/d1/0.jpg", shot: "frente" }, { path: "u1/d1/5.jpg" }]);
  const back = drafts.draftFromServer({ ...row, updated_at: local.savedAt }, local.submission);
  assert.equal(back.nextSlot, 6, "the next photo never reuses slot 5 or the clip's slot");
  assert.deepEqual(back.photos.map((photo) => photo.slot), [0, 5]);
  assert.equal(back.values.brand, "Fender");
  assert.equal(drafts.savedAgo("2026-10-19T00:00:00Z", Date.parse("2026-10-19T00:03:00Z")), "guardado hace 3 min");
});

test("POST 14: the review wait is shown only from real data, in plain words", () => {
  const sell = source("components/sell-listing-form.tsx");
  assert.match(sell, /export function reviewWaitText/);
  const sql = source("supabase/migrations/20261104120200_ux_selling_store_defaults_sku_details.sql");
  assert.match(sql, /listing_review_wait_minutes/);
  assert.match(sql, /< 20|>= 20/);
});

test("POST 16: sound clips are optional, at most 20 seconds, never autoplay, and the Admin queue plays them", () => {
  const field = source("components/selling/sound-clip-field.tsx");
  assert.match(field, /MAX_CLIP_SECONDS = 20/);
  for (const file of ["components/selling/sound-clip-field.tsx", "components/selling/listing-sound-clip.tsx", "components/admin-workbench.tsx"]) {
    const text = source(file);
    assert.match(text, /preload="none"/, file);
    assert.doesNotMatch(text, /autoPlay|autoplay/, file);
  }
  assert.match(source("app/instrumentos/[slug]/page.tsx"), /<ListingSoundClip listingId=\{listing\.id\} \/>/);
  assert.match(source("components/admin-workbench.tsx"), /sound_clip_url/);
});

test("big-06: photos come first and upload while the seller fills in the rest, on every screen size", () => {
  const sell = source("components/sell-listing-form.tsx");
  assert.match(sell, /\{ title: "Fotos", fields: \["photos"\] \}/);
  assert.match(sell, /upload\(key, slot, file\)/, "uploads start as soon as a photo is added");
  assert.match(sell, /createQueue\(3\)/);
  assert.doesNotMatch(sell, /lg:hidden[^"]*"[^>]*PhotoStep/, "the photo step is not phone-only");
});

test("SHOP 06 and STOCK 09: store defaults prefill the form and SKUs remember their listing details", () => {
  const sell = source("components/sell-listing-form.tsx");
  assert.match(sell, /storeDefaults\?\.condition/);
  assert.match(sell, /descriptionFooter/);
  assert.match(sell, /sku\?\.details/);
  assert.match(source("components/inventory/sku-listing-details.tsx"), /update_inventory_listing_details/);
  assert.match(source("app/mi-cuenta/tienda/valores-por-defecto/page.tsx"), /StoreDefaultsForm/);
});

test("POST 15: the approval e-mail opens the live listing", () => {
  assert.match(source("lib/email/templates.ts"), /Tu publicación está en línea[\s\S]{0,300}\/instrumentos\/\$\{listing\.slug\}/);
});

test("fast-04: upload progress is announced politely, not every percent", () => {
  const photos = source("components/selling/photo-step.tsx");
  assert.match(photos, /role="status">\{photoSummary\(photos\)\}/);
  assert.match(photos, /Subiendo \$\{Math\.min\(done \+ 1, photos\.length\)\} de \$\{photos\.length\} fotos…/);
  assert.match(photos, /"Fotos subidas"/);
  const clip = source("components/selling/sound-clip-field.tsx");
  assert.doesNotMatch(clip, /aria-live="polite"/);
  assert.match(clip, /<span aria-hidden> \{Math\.round\(clip\.progress \* 100\)\}%<\/span>/);
});

test("big-12: photos shared from the gallery are added like picked ones, and the marker is dropped", () => {
  const sell = source("components/sell-listing-form.tsx");
  assert.match(sell, /import \{ SHARED_PHOTOS_PARAM, takeSharedPhotos \} from "@\/lib\/share-target";/);
  assert.match(sell, /get\(SHARED_PHOTOS_PARAM\) === "1"/);
  assert.match(sell, /const shared = await takeSharedPhotos\(\);\n\s+if \(cancelled\) return;\n\s+dropSharedParam\(\);/);
  assert.match(sell, /addPhotos\(shared\)/);
  assert.match(sell, /url\.searchParams\.delete\(SHARED_PHOTOS_PARAM\)/);
});
