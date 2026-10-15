// Server-side check of one uploaded import photo (design §8.1 step 3). The browser may have re-encoded the photo, but
// nothing it did is trusted: the type comes from the bytes, the dimensions from the header (no full decode), and a
// file that also reads as a web page is refused. The database records the outcome (record_store_import_photo_checks).
import { createHash } from "node:crypto";

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_MIN_SIDE = 400;
export const PHOTO_MAX_SIDE = 8000;

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
  return {
    ok: true,
    mime_type: header.mime,
    bytes,
    width,
    height,
    sha256: createHash("sha256").update(input).digest("hex"),
  };
}

type Header = { mime: PhotoMime; width: number; height: number };

export function readHeader(data: Uint8Array): Header | null {
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return readJpeg(data);
  if (data.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => data[index] === value)) {
    return readPng(data);
  }
  if (data.length >= 16 && ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 4) === "WEBP") return readWebp(data);
  return null;
}

function readPng(data: Uint8Array): Header | null {
  // The first chunk must be IHDR (13 bytes): width and height are big-endian at 16 and 20.
  if (data.length < 33 || u32be(data, 8) !== 13 || ascii(data, 12, 4) !== "IHDR") return null;
  const width = u32be(data, 16);
  const height = u32be(data, 20);
  if (!width || !height) return null;
  // A complete PNG ends with IEND; anything appended after it is refused.
  if (ascii(data, data.length - 8, 4) !== "IEND") return null;
  return { mime: "image/png", width, height };
}

// Walks the marker segments up to the first frame header (SOF). No SOF before the scan, or a truncated segment,
// means it is not a usable JPEG.
function readJpeg(data: Uint8Array): Header | null {
  let offset = 2;
  while (offset + 4 <= data.length) {
    if (data[offset] !== 0xff) return null;
    let marker = data[offset + 1];
    while (marker === 0xff && offset + 2 < data.length) {
      offset += 1;
      marker = data[offset + 1];
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = u16be(data, offset + 2);
    if (length < 2 || offset + 2 + length > data.length) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (length < 7) return null;
      const height = u16be(data, offset + 5);
      const width = u16be(data, offset + 7);
      if (!width || !height) return null;
      return { mime: "image/jpeg", width, height };
    }
    offset += 2 + length;
  }
  return null;
}

function readWebp(data: Uint8Array): Header | null {
  // The RIFF size must cover exactly the file: no appended data.
  if (u32le(data, 4) + 8 !== data.length || data.length < 30) return null;
  const chunk = ascii(data, 12, 4);
  if (chunk === "VP8 ") {
    if (data[23] !== 0x9d || data[24] !== 0x01 || data[25] !== 0x2a) return null;
    return { mime: "image/webp", width: u16le(data, 26) & 0x3fff, height: u16le(data, 28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (data[20] !== 0x2f) return null;
    const bits = u32le(data, 21);
    return { mime: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    return { mime: "image/webp", width: u24le(data, 24) + 1, height: u24le(data, 27) + 1 };
  }
  return null;
}

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
