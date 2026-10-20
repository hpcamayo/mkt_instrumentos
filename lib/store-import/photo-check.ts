// Server-side check of one uploaded import photo (design §8.1 step 3). The browser may have re-encoded the photo, but
// nothing it did is trusted: the type comes from the bytes, the dimensions from the header, and a file that also reads
// as a web page is refused. The database records the outcome (record_store_import_photo_checks).
//
// "From the bytes" means the whole file: each format is walked from its signature to its real end (JPEG segments and
// scans up to EOI, every PNG chunk with its CRC, every WebP chunk), so a truncated image, a forged ending or anything
// appended after the image (another file, an archive, a script) is refused. Then, once the dimensions are within
// bounds, the compressed image data is read through as a decoder reads it, so a file whose structure is intact but
// whose data stops short (an empty IDAT, a scan cut after one byte before a forged EOI) is refused too (Codex re-check
// R3): every JPEG scan decodes to the end of its blocks, PNG data inflates to exactly the rows IHDR implies, a WebP
// stream parses to its last macroblock or pixel. Pixels are never reconstructed. Real photos up to 5 MB take well
// under a second; a file crafted to be slow, up to about 2 s (each walk's file gives its bounds).
import { createHash } from "node:crypto";
import { jpegScansComplete, type JpegSegment } from "@/lib/store-import/photo-jpeg-data";
import { pngImageDataComplete, type PngImage } from "@/lib/store-import/photo-png-data";
import { webpImageDataComplete, type WebpImage } from "@/lib/store-import/photo-webp-data";

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_MIN_SIDE = 400;
export const PHOTO_MAX_SIDE = 8000;

// Bounds on the walk. Every step moves forward, so a 5 MB file ends the walk anyway; these keep a crafted file from
// making it long. Real files stay far below them (one IDAT per row of an interlaced 8000-row PNG is ~15,000 chunks).
const JPEG_MAX_SEGMENTS = 10_000;
const PNG_MAX_CHUNKS = 50_000;
const WEBP_MAX_CHUNKS = 100;

export type PhotoMime = "image/jpeg" | "image/png" | "image/webp";

export type PhotoCheck =
  | { ok: true; mime_type: PhotoMime; bytes: number; width: number; height: number; sha256: string }
  | { ok: false; code: PhotoRejectCode; bytes: number };

export type PhotoRejectCode = "PHOTO_NOT_IMAGE" | "PHOTO_TOO_LARGE" | "PHOTO_DIMENSIONS" | "PHOTO_SUSPICIOUS";

// Markup that makes a file usable as an HTML/SVG/script document if a browser ever sniffed it. Real photo metadata
// (EXIF, ICC, XMP) does not contain these.
const MARKUP = ["<script", "<html", "<!doctype html", "<iframe", "<body", "<?php", "<svg", "<object", "<embed"];

export function checkPhoto(input: Uint8Array): PhotoCheck {
  const bytes = input.byteLength;
  if (bytes === 0) return { ok: false, code: "PHOTO_NOT_IMAGE", bytes };
  if (bytes > PHOTO_MAX_BYTES) return { ok: false, code: "PHOTO_TOO_LARGE", bytes };
  const header = readHeader(input);
  if (!header) return { ok: false, code: "PHOTO_NOT_IMAGE", bytes };
  if (containsMarkup(input)) return { ok: false, code: "PHOTO_SUSPICIOUS", bytes };
  const { width, height } = header;
  if (width < PHOTO_MIN_SIDE || height < PHOTO_MIN_SIDE || width > PHOTO_MAX_SIDE || height > PHOTO_MAX_SIDE) {
    return { ok: false, code: "PHOTO_DIMENSIONS", bytes };
  }
  if (!imageDataComplete(header)) return { ok: false, code: "PHOTO_NOT_IMAGE", bytes };
  return {
    ok: true,
    mime_type: header.mime,
    bytes,
    width,
    height,
    sha256: createHash("sha256").update(input).digest("hex"),
  };
}

// `complete` reads the image data through (photo-*-data.ts); it is only run once the dimensions are known to be in
// bounds, since its work grows with them.
type Header = { mime: PhotoMime; width: number; height: number; complete: () => boolean };

// An exception from a data walk means the data could not be read through, so the photo is not accepted.
function imageDataComplete(header: Header) {
  try {
    return header.complete();
  } catch {
    return false;
  }
}

// The type and dimensions of a JPEG, PNG or WebP whose structure is whole and ends exactly where the file ends, with
// the check of its image data; null otherwise.
export function readHeader(data: Uint8Array): Header | null {
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return readJpeg(data);
  if (data.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => data[index] === value)) {
    return readPng(data);
  }
  if (data.length >= 16 && ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 4) === "WEBP") return readWebp(data);
  return null;
}

// ------------------------------------------------------------------ JPEG

// Frame headers accepted (SOF0–SOF15 except DHT C4, JPG C8 and DAC CC).
const JPEG_FRAMES = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

// Segments a decoder reads or skips between the frame and scan headers: DHT, DAC, DQT, DNL, DRI, APP0–15 and COM.
function isJpegTableOrMisc(marker: number) {
  return marker === 0xc4 || marker === 0xcc || (marker >= 0xdb && marker <= 0xdd) || (marker >= 0xe0 && marker <= 0xef)
    || marker === 0xfe;
}

// Walks the marker segments from SOI to EOI: one frame header with its dimensions, at least one scan (each followed
// by its entropy-coded data; progressive files have several, with tables between them), and EOI as the last two
// bytes of the file. Any other marker (a second SOI or frame, reserved or unsupported codes) is refused.
function readJpeg(data: Uint8Array): Header | null {
  let offset = 2;
  let frame: Omit<Header, "complete"> | null = null;
  let scans = 0;
  const decoderSegments: JpegSegment[] = [];
  for (let segments = 0; segments < JPEG_MAX_SEGMENTS; segments += 1) {
    // A marker is 0xFF, optionally more 0xFF fill bytes, then its code.
    if (data[offset] !== 0xff) return null;
    while (data[offset] === 0xff) offset += 1;
    if (offset >= data.length) return null;
    const marker = data[offset];
    offset += 1;
    if (marker === 0xd9) {
      if (!frame || !scans || offset !== data.length) return null;
      return { ...frame, complete: () => jpegScansComplete(data, decoderSegments) };
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue; // RSTn and TEM stand alone
    if (offset + 2 > data.length) return null;
    const length = u16be(data, offset);
    const end = offset + length;
    if (length < 2 || end > data.length) return null;
    if (JPEG_FRAMES.has(marker)) {
      if (frame) return null;
      frame = readJpegFrame(data, offset, length);
      if (!frame) return null;
      decoderSegments.push({ marker, start: offset + 2, end, scanEnd: end });
    } else if (marker === 0xda) {
      // Ns components, two bytes each, then Ss, Se and Ah/Al.
      const components = data[offset + 2];
      if (!frame || components < 1 || components > 4 || length !== 6 + 2 * components) return null;
      const scanEnd = skipEntropyCodedData(data, end);
      // -1: the file ends inside the scan. A scan without a single byte of image data is not an image either.
      if (scanEnd <= end) return null;
      scans += 1;
      decoderSegments.push({ marker, start: offset + 2, end, scanEnd });
      offset = scanEnd;
      continue;
    } else if (!isJpegTableOrMisc(marker)) {
      return null;
    } else if (marker === 0xc4 || marker === 0xdb || marker === 0xdd) {
      decoderSegments.push({ marker, start: offset + 2, end, scanEnd: end }); // DHT, DQT and DRI matter to the data walk
    }
    offset = end;
  }
  return null;
}

// SOFn: length, precision, height, width, Nf components of three bytes each.
function readJpegFrame(data: Uint8Array, offset: number, length: number): Omit<Header, "complete"> | null {
  const components = data[offset + 7];
  if (length < 8 || components < 1 || components > 4 || length !== 8 + 3 * components) return null;
  const height = u16be(data, offset + 3);
  const width = u16be(data, offset + 5);
  if (!width || !height) return null;
  return { mime: "image/jpeg", width, height };
}

// Entropy-coded data runs until a marker: inside it, 0xFF is followed by 0x00 (a stuffed 0xFF byte) or by a restart
// marker RST0–7, possibly after more 0xFF fill bytes. Returns where the marker that ends the scan starts, or -1 when
// the file ends first.
function skipEntropyCodedData(data: Uint8Array, start: number) {
  let index = data.indexOf(0xff, start);
  while (index !== -1) {
    let next = index + 1;
    while (data[next] === 0xff) next += 1;
    if (next >= data.length) return -1;
    const code = data[next];
    if (code !== 0x00 && (code < 0xd0 || code > 0xd7)) return index;
    index = data.indexOf(0xff, next + 1);
  }
  return -1;
}

// ------------------------------------------------------------------ PNG

// Bit depths allowed for each colour type (PNG specification, table 11.1).
const PNG_BIT_DEPTHS: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };

// Walks every chunk (length, type, data, CRC): IHDR first, a PLTE before the image data of a palette image, one run
// of consecutive IDAT chunks, and an empty IEND that is the last thing in the file. Ancillary chunks (lowercase first
// letter) are skipped; an unknown critical chunk is refused, as a decoder would.
function readPng(data: Uint8Array): Header | null {
  let offset = 8;
  let header: Omit<Header, "complete"> | null = null;
  let image: PngImage | null = null;
  const idat: [number, number][] = [];
  let colorType = -1;
  let palette = false;
  let imageData: "none" | "reading" | "done" = "none";
  for (let chunks = 0; chunks < PNG_MAX_CHUNKS; chunks += 1) {
    if (offset + 12 > data.length) return null;
    const length = u32be(data, offset);
    const type = ascii(data, offset + 4, 4);
    const start = offset + 8;
    const end = start + length;
    if (length > 0x7fffffff || end + 4 > data.length || !/^[A-Za-z]{4}$/.test(type)) return null;
    if (crc32(data, offset + 4, end) !== u32be(data, end)) return null;
    if (!header && type !== "IHDR") return null;
    if (imageData === "reading" && type !== "IDAT") imageData = "done";
    if (type === "IHDR") {
      if (header || length !== 13) return null;
      header = readPngHeader(data, start);
      if (!header) return null;
      colorType = data[start + 9];
      image = { ...header, bitDepth: data[start + 8], colorType, interlaced: data[start + 12] === 1 };
    } else if (type === "PLTE") {
      if (palette || imageData !== "none" || length === 0 || length > 768 || length % 3) return null;
      palette = true;
    } else if (type === "IDAT") {
      if (imageData === "done" || (colorType === 3 && !palette)) return null;
      imageData = "reading";
      idat.push([start, end]);
    } else if (type === "IEND") {
      if (length !== 0 || imageData === "none" || end + 4 !== data.length || !header || !image) return null;
      const pixels = image;
      return { ...header, complete: () => pngImageDataComplete(data, pixels, idat) };
    } else if (type.charCodeAt(0) < 0x61) {
      return null;
    }
    offset = end + 4;
  }
  return null;
}

// IHDR: width, height, bit depth, colour type, compression, filter and interlace methods.
function readPngHeader(data: Uint8Array, start: number): Omit<Header, "complete"> | null {
  const width = u32be(data, start);
  const height = u32be(data, start + 4);
  if (!width || !height || width > 0x7fffffff || height > 0x7fffffff) return null;
  if (!PNG_BIT_DEPTHS[data[start + 9]]?.includes(data[start + 8])) return null;
  if (data[start + 10] !== 0 || data[start + 11] !== 0 || data[start + 12] > 1) return null;
  return { mime: "image/png", width, height };
}

// CRC-32 as PNG uses it (ISO 3309), table-driven so it does not depend on the runtime's zlib.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array, start: number, end: number) {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) crc = CRC_TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ------------------------------------------------------------------ WebP

// RIFF container: the RIFF size covers exactly the rest of the file, and the chunks inside it are walked by size, an
// odd-sized chunk being followed by one pad byte. A simple file is a single VP8 (lossy) or VP8L (lossless) chunk. An
// extended file starts with VP8X and holds exactly one VP8 or VP8L image (ALPH, ICCP, EXIF, XMP and unknown chunks
// are skipped) whose size matches the VP8X canvas. Animated WebP (the VP8X flag, ANIM or ANMF) is refused: a listing
// photo is a still image. A lossy image is decoded with the last ALPH chunk before it, as libwebp does.
function readWebp(data: Uint8Array): Header | null {
  if (u32le(data, 4) + 8 !== data.length) return null;
  let offset = 12;
  let canvas: { width: number; height: number } | null = null;
  let image: Omit<Header, "complete"> | null = null;
  let stream: WebpImage | null = null;
  let alpha: [number, number] | null = null;
  for (let chunks = 0; offset < data.length; chunks += 1) {
    if (chunks >= WEBP_MAX_CHUNKS || offset + 8 > data.length) return null;
    const type = ascii(data, offset, 4);
    const size = u32le(data, offset + 4);
    const start = offset + 8;
    const next = start + size + (size & 1);
    if (next > data.length) return null;
    if (chunks === 0 && type === "VP8X") {
      if (size !== 10 || data[start] & 0x02) return null;
      canvas = { width: u24le(data, start + 4) + 1, height: u24le(data, start + 7) + 1 };
    } else if (type === "VP8 " || type === "VP8L") {
      // One image; in a simple file it is the only chunk.
      if (image || (chunks > 0 && !canvas)) return null;
      image = type === "VP8 " ? readVp8(data, start, size) : readVp8l(data, start, size);
      if (!image) return null;
      stream = { lossless: type === "VP8L", start, end: start + size, width: image.width, height: image.height };
    } else if (!canvas || type === "VP8X" || type === "ANIM" || type === "ANMF") {
      return null;
    } else if (type === "ALPH" && !image) {
      alpha = [start, start + size];
    }
    offset = next;
  }
  if (!image || !stream || (canvas && (canvas.width !== image.width || canvas.height !== image.height))) return null;
  const pixels = stream;
  return { ...image, complete: () => webpImageDataComplete(data, pixels, pixels.lossless ? null : alpha) };
}

// VP8 key frame header, checked as libwebp does: a key frame, a known profile, shown, a first partition that fits
// the chunk, the start code 9d 01 2a, then 14-bit width and height.
function readVp8(data: Uint8Array, start: number, size: number): Omit<Header, "complete"> | null {
  if (size < 10) return null;
  const bits = u24le(data, start);
  if (bits & 1 || ((bits >> 1) & 7) > 3 || !((bits >> 4) & 1) || bits >> 5 >= size) return null;
  if (data[start + 3] !== 0x9d || data[start + 4] !== 0x01 || data[start + 5] !== 0x2a) return null;
  const width = u16le(data, start + 6) & 0x3fff;
  const height = u16le(data, start + 8) & 0x3fff;
  return width && height ? { mime: "image/webp", width, height } : null;
}

// VP8L header: signature 0x2f, then 14-bit width − 1, 14-bit height − 1, the alpha bit and a 3-bit version that must
// be 0.
function readVp8l(data: Uint8Array, start: number, size: number): Omit<Header, "complete"> | null {
  if (size < 5 || data[start] !== 0x2f) return null;
  const bits = u32le(data, start + 1);
  if (bits >>> 29) return null;
  return { mime: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
}

// ------------------------------------------------------------------ helpers

function containsMarkup(data: Uint8Array) {
  // Latin-1 keeps one character per byte, so a byte-level search works on the decoded text.
  const text = Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("latin1").toLowerCase();
  return MARKUP.some((marker) => text.includes(marker));
}

function ascii(data: Uint8Array, offset: number, length: number) {
  if (offset < 0 || offset + length > data.length) return "";
  return String.fromCharCode(...data.subarray(offset, offset + length));
}
const u16be = (d: Uint8Array, o: number) => (d[o] << 8) | d[o + 1];
const u16le = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8);
const u24le = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8) | (d[o + 2] << 16);
const u32be = (d: Uint8Array, o: number) => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
const u32le = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
