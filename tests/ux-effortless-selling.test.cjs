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
