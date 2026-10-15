// STORE-3a import photos: the server-side byte check (magic bytes, header dimensions, polyglots), the browser-side
// selection and ZIP reader (names, hidden entries, caps, bombs), manifests, request parsing, and the boundaries of the
// image proxy and storage paths. Runs with `pnpm test`.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const { zipSync, strToU8 } = require("fflate");

// photos-server.ts is server-only; its request parsers are plain functions.
const load = Module._load;
Module._load = function stubServerOnly(request, ...rest) {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase/admin-client") return { getSupabaseAdminClient: () => null };
  return load.call(this, request, ...rest);
};

const { checkPhoto, readHeader } = require("@/lib/store-import/photo-check");
const { baseName, photoEntryProblem, photoTypeFromName, parseManifest, readPhotoArchive, isManifestName } = require("@/lib/store-import/photo-files");
const { parsePhotoAction, parsePhotoFiles } = require("@/lib/store-import/photos-server");

// ------------------------------------------------------------------ fixtures

function jpeg(width, height, { trailer = "", pad = 1000 } = {}) {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  const sos = [0xff, 0xda, 0x00, 0x0c, 0x03, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0];
  return Buffer.concat([Buffer.from([0xff, 0xd8, ...app0, ...sof, ...sos]), Buffer.alloc(pad, 0x55), Buffer.from([0xff, 0xd9]), Buffer.from(trailer, "latin1")]);
}

function png(width, height, { trailer = "" } = {}) {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4, "latin1");
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = 8;
  ihdr[17] = 2;
  const idat = Buffer.concat([Buffer.from([0, 0, 0, 4]), Buffer.from("IDAT", "latin1"), Buffer.alloc(4, 1), Buffer.alloc(4)]);
  const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, idat, iend, Buffer.from(trailer, "latin1")]);
}

function webp(kind, width, height, { extra = 0 } = {}) {
  let chunk;
  if (kind === "VP8 ") {
    chunk = Buffer.alloc(30);
    chunk.write("VP8 ", 0, "latin1");
    chunk.writeUInt32LE(22, 4);
    chunk[11] = 0x9d; chunk[12] = 0x01; chunk[13] = 0x2a;
    chunk.writeUInt16LE(width, 14);
    chunk.writeUInt16LE(height, 16);
  } else if (kind === "VP8L") {
    chunk = Buffer.alloc(18);
    chunk.write("VP8L", 0, "latin1");
    chunk.writeUInt32LE(10, 4);
    chunk[8] = 0x2f;
    chunk.writeUInt32LE(((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14), 9);
  } else {
    chunk = Buffer.alloc(28);
    chunk.write("VP8X", 0, "latin1");
    chunk.writeUInt32LE(10, 4);
    chunk.writeUIntLE(width - 1, 12, 3);
    chunk.writeUIntLE(height - 1, 15, 3);
  }
  const body = Buffer.concat([Buffer.from("WEBP", "latin1"), chunk]);
  const header = Buffer.alloc(8);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(body.length + extra, 4);
  return Buffer.concat([header, body]);
}

function streamOf(bytes, chunk = 7000) {
  return new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += chunk) controller.enqueue(bytes.subarray(offset, offset + chunk));
      controller.close();
    },
  });
}

async function readZip(entries, remaining) {
  const photos = [];
  const result = await readPhotoArchive(streamOf(zipSync(entries)), {
    remaining,
    onPhoto: async (photo) => { photos.push(photo); },
  });
  return { ...result, names: photos.map((photo) => photo.name), photos };
}

// ------------------------------------------------------------------ server-side check

test("valid JPEG, PNG and WebP pass with type and dimensions from the header", () => {
  const cases = [
    [jpeg(1200, 900), "image/jpeg", 1200, 900],
    [png(800, 600), "image/png", 800, 600],
    [webp("VP8 ", 1000, 700), "image/webp", 1000, 700],
    [webp("VP8L", 640, 480), "image/webp", 640, 480],
    [webp("VP8X", 4000, 3000), "image/webp", 4000, 3000],
  ];
  for (const [bytes, mime, width, height] of cases) {
    const result = checkPhoto(new Uint8Array(bytes));
    assert.equal(result.ok, true, mime);
    assert.equal(result.mime_type, mime);
    assert.equal(result.width, width);
    assert.equal(result.height, height);
    assert.match(result.sha256, /^[0-9a-f]{64}$/);
  }
});

test("the type comes from the bytes, not the name", () => {
  assert.equal(readHeader(new Uint8Array(png(800, 800))).mime, "image/png");
  assert.equal(readHeader(new Uint8Array(Buffer.from("GIF89a" + "x".repeat(40), "latin1"))), null);
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic", "latin1"), Buffer.alloc(100)]);
  assert.deepEqual(checkPhoto(new Uint8Array(heic)), { ok: false, code: "PHOTO_NOT_IMAGE", bytes: heic.length });
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><script>alert(1)</script></svg>');
  assert.equal(checkPhoto(new Uint8Array(svg)).code, "PHOTO_NOT_IMAGE");
  assert.equal(checkPhoto(new Uint8Array(0)).code, "PHOTO_NOT_IMAGE");
});

test("dimensions must be 400–8000 px per side", () => {
  assert.equal(checkPhoto(new Uint8Array(jpeg(399, 900))).code, "PHOTO_DIMENSIONS");
  assert.equal(checkPhoto(new Uint8Array(jpeg(900, 8001))).code, "PHOTO_DIMENSIONS");
  assert.equal(checkPhoto(new Uint8Array(png(8000, 400))).ok, true);
  assert.equal(checkPhoto(new Uint8Array(webp("VP8X", 16000, 16000))).code, "PHOTO_DIMENSIONS");
});

test("over 5 MB is refused before reading", () => {
  const big = Buffer.concat([jpeg(1000, 1000), Buffer.alloc(5 * 1024 * 1024)]);
  assert.equal(checkPhoto(new Uint8Array(big)).code, "PHOTO_TOO_LARGE");
});

test("polyglots and appended data are refused", () => {
  assert.equal(checkPhoto(new Uint8Array(jpeg(1000, 1000, { trailer: "<html><script>alert(1)</script></html>" }))).code, "PHOTO_SUSPICIOUS");
  assert.equal(checkPhoto(new Uint8Array(jpeg(1000, 1000, { trailer: "<!DOCTYPE HTML>" }))).code, "PHOTO_SUSPICIOUS");
  assert.equal(checkPhoto(new Uint8Array(jpeg(1000, 1000, { trailer: "<?php echo 1; ?>" }))).code, "PHOTO_SUSPICIOUS");
  // Bytes after IEND or past the RIFF size are not part of the image.
  assert.equal(checkPhoto(new Uint8Array(png(900, 900, { trailer: "anything" }))).code, "PHOTO_NOT_IMAGE");
  assert.equal(checkPhoto(new Uint8Array(Buffer.concat([webp("VP8X", 900, 900), Buffer.from("tail")]))).code, "PHOTO_NOT_IMAGE");
  assert.equal(checkPhoto(new Uint8Array(webp("VP8X", 900, 900, { extra: 10 }))).code, "PHOTO_NOT_IMAGE");
});

test("truncated or malformed headers are not images", () => {
  const full = jpeg(1000, 1000);
  assert.equal(checkPhoto(new Uint8Array(full.subarray(0, 25))).code, "PHOTO_NOT_IMAGE", "cut inside the segments");
  const noFrame = Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 0, 0, 0, 0, 0, 0, 0xff, 0xd9]);
  assert.equal(checkPhoto(new Uint8Array(noFrame)).code, "PHOTO_NOT_IMAGE", "scan before any frame header");
  const zero = png(0, 900);
  assert.equal(checkPhoto(new Uint8Array(zero)).code, "PHOTO_NOT_IMAGE");
  const lying = jpeg(1000, 1000);
  lying[2 + 18 + 2] = 0xff; // segment length runs past the end
  lying[2 + 18 + 3] = 0xff;
  assert.equal(checkPhoto(new Uint8Array(lying)).code, "PHOTO_NOT_IMAGE");
});

// ------------------------------------------------------------------ browser selection and archives

test("only the base name is kept and system files are skipped", () => {
  assert.equal(baseName("../../fotos/DS1-004__01.jpg"), "DS1-004__01.jpg");
  assert.equal(baseName("C:\\Users\\tienda\\DS1__02.JPG"), "DS1__02.JPG");
  assert.equal(photoEntryProblem("__MACOSX/fotos/._DS1__01.jpg"), "hidden");
  assert.equal(photoEntryProblem("fotos/.DS_Store"), "hidden");
  assert.equal(photoEntryProblem("fotos/Thumbs.db"), "hidden");
  assert.equal(photoEntryProblem("fotos/"), "directory");
  assert.equal(photoEntryProblem("fotos/notas.pdf"), "not_image");
  assert.equal(photoEntryProblem("fotos/imagen.heic"), "not_image");
  assert.equal(photoEntryProblem("fotos/imagen.svg"), "not_image");
  assert.equal(photoEntryProblem("fotos/DS1__01.JPEG"), null);
  assert.equal(photoTypeFromName("a.webp"), "image/webp");
  assert.equal(isManifestName("fotos.csv"), true);
});

test("a ZIP is read entry by entry with names reduced to their base", async () => {
  const result = await readZip({
    "fotos/DS1-004__01.jpg": new Uint8Array(jpeg(900, 900)),
    "../../evil/DS1-004__02.png": new Uint8Array(png(900, 900)),
    "__MACOSX/fotos/._DS1-004__01.jpg": strToU8("mac"),
    "fotos/.hidden.jpg": strToU8("x"),
    "fotos/leeme.txt": strToU8("hola"),
    "fotos/sub/": new Uint8Array(0),
    "stored/CAB__01.webp": [new Uint8Array(webp("VP8X", 900, 900)), { level: 0 }],
  });
  assert.deepEqual(result.names.sort(), ["CAB__01.webp", "DS1-004__01.jpg", "DS1-004__02.png"]);
  assert.deepEqual(result.skipped, [{ name: "leeme.txt", reason: "not_image" }]);
  assert.equal(result.invalid, false);
  const stored = result.photos.find((photo) => photo.name === "CAB__01.webp");
  assert.equal(stored.type, "image/webp");
  assert.equal(checkPhoto(stored.data).ok, true, "bytes come through intact");
});

test("a compression bomb stops at 5 MB for that entry and the rest still read", async () => {
  const result = await readZip({
    "bomba__01.jpg": [new Uint8Array(40 * 1024 * 1024), { level: 9 }],
    "ok__01.jpg": new Uint8Array(jpeg(900, 900)),
  });
  assert.deepEqual(result.names, ["ok__01.jpg"]);
  assert.deepEqual(result.skipped, [{ name: "bomba__01.jpg", reason: "too_large" }]);
});

test("the photo cap counts across the archive", async () => {
  const entries = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`f${index}__01.jpg`, new Uint8Array(jpeg(900, 900))]));
  const result = await readZip(entries, 3);
  assert.equal(result.names.length, 3);
  assert.equal(result.skipped.filter((item) => item.reason === "over_limit").length, 2);
});

test("a file that is not a ZIP is reported, not thrown", async () => {
  const result = await readPhotoArchive(streamOf(new Uint8Array(Buffer.from("not a zip at all, just text"))), { onPhoto: async () => {} });
  assert.equal(result.invalid, true);
  assert.equal(result.photos, 0);
});

test("a manifest maps file, SKU and order; bad lines are listed", () => {
  const { entries, problems } = parseManifest("\uFEFFarchivo;SKU;orden\nfrente.JPG;DS1-004;1\nC:\\x\\lateral.jpg;DS1-004;2\nsin-orden.png;CAB-3;\nmalo.jpg;con espacio;1\nfuera.jpg;CAB-3;11\n");
  assert.deepEqual(entries.get("frente.jpg"), { sku: "DS1-004", order: 1 });
  assert.deepEqual(entries.get("lateral.jpg"), { sku: "DS1-004", order: 2 });
  assert.deepEqual(entries.get("sin-orden.png"), { sku: "CAB-3", order: null });
  assert.deepEqual(entries.get("fuera.jpg"), { sku: "CAB-3", order: null });
  assert.equal(entries.has("malo.jpg"), false);
  assert.deepEqual(problems, ["Línea 5"]);
  assert.equal(parseManifest("a.jpg,SKU-1,2").entries.get("a.jpg").order, 2, "comma lists work, header optional");
});

// ------------------------------------------------------------------ request parsing

test("upload and arrange requests are validated before reaching the database", () => {
  assert.equal(parsePhotoFiles({ files: [] }), null);
  assert.equal(parsePhotoFiles({ files: Array.from({ length: 26 }, () => ({ name: "a.jpg", type: "image/jpeg", bytes: 1 })) }), null);
  assert.equal(parsePhotoFiles({ files: [{ name: "a.jpg", type: "image/jpeg", bytes: 1.5 }] }), null);
  assert.deepEqual(parsePhotoFiles({ files: [{ name: "a.jpg", type: "image/jpeg", bytes: 10, manifest_sku: "X", manifest_order: 2 }] }),
    [{ name: "a.jpg", type: "image/jpeg", bytes: 10, manifest_sku: "X", manifest_order: 2 }]);
  const id = "8b6b1f8e-6c43-4a8e-9c2f-0d2f5e0b9a11";
  assert.deepEqual(parsePhotoAction({ action: "place", assetId: id, row: 4 }), { action: "place", assetId: id, row: 4 });
  assert.deepEqual(parsePhotoAction({ action: "place", assetId: id, row: null }), { action: "place", assetId: id, row: null });
  assert.equal(parsePhotoAction({ action: "place", assetId: "../x", row: 4 }), null);
  assert.equal(parsePhotoAction({ action: "place", assetId: id }), null);
  assert.equal(parsePhotoAction({ action: "order", row: 2, assetIds: Array(11).fill(id) }), null);
  assert.deepEqual(parsePhotoAction({ action: "reset" }), { action: "reset" });
});

// ------------------------------------------------------------------ boundaries in code

test("the image proxy maps import photos only to the photo bucket", () => {
  const proxy = fs.readFileSync("app/api/listing-images/[...path]/route.ts", "utf8");
  assert.match(proxy, /\/import-photos\\\//);
  assert.match(proxy, /from\("store-import-photos"\)/);
  assert.doesNotMatch(proxy, /"store-imports"/);
  assert.match(proxy, /asset\.status !== "validated"/);
  assert.match(proxy, /Content-Security-Policy/);
  const thumbnail = fs.readFileSync("app/api/store/imports/[id]/photos/[assetId]/route.ts", "utf8");
  assert.match(thumbnail, /data\.status !== "validated"/);
  assert.doesNotMatch(thumbnail, /getSupabaseAdminClient/, "thumbnails use the owner's own session");
});

test("only the completion step uses the service role, and the server never unzips", () => {
  const server = fs.readFileSync("lib/store-import/photos-server.ts", "utf8");
  assert.equal((server.match(/getSupabaseAdminClient\(\)/g) ?? []).length, 1);
  for (const file of ["lib/store-import/photos-server.ts", "lib/store-import/photo-check.ts"]) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /fflate|unzip/i, `${file} must not open archives`);
  }
  const migration = fs.readFileSync("supabase/migrations/20261026120000_store_import_photos.sql", "utf8");
  assert.match(migration, /grant execute on function public\.record_store_import_photo_checks\(uuid, uuid, jsonb\) to service_role;/);
  assert.doesNotMatch(migration, /record_store_import_photo_checks\(uuid, uuid, jsonb\) to authenticated/);
});
