// Browser side of import photos (design §8.1, §8.2): which files in a selection or ZIP are photos, reading a ZIP one
// entry at a time with hard caps, and the optional manifest. Nothing here is trusted by the server: names only become
// display text and matching hints, and every uploaded object is checked again server-side.
import { Unzip, UnzipInflate, type UnzipFile } from "fflate";

export const PHOTO_MAX_FILES = 600; // D-3, per import
export const PHOTO_MAX_FILE_BYTES = 5 * 1024 * 1024; // D-3, per photo
export const PHOTO_SLOT_BATCH = 10; // photos per upload round (the server takes up to 25)
export const PHOTO_MAX_ARCHIVE_ENTRIES = 5000; // entries looked at in one ZIP, photos or not
const ZIP_READ_SLICE = 64 * 1024;

export type PhotoMimeType = "image/jpeg" | "image/png" | "image/webp";

export type SkipReason = "hidden" | "not_image" | "too_large" | "over_limit" | "unreadable";

export const SKIP_LABELS: Record<SkipReason, string> = {
  hidden: "Archivo del sistema",
  not_image: "No es una foto JPG, PNG o WebP",
  too_large: "Pesa más de 5 MB",
  over_limit: "Se superó el máximo de 600 fotos",
  unreadable: "No se pudo leer",
};

// Only the last segment of a path inside an archive or a selection, for display and matching.
export function baseName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "";
}

export function photoTypeFromName(name: string): PhotoMimeType | null {
  const extension = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return null;
}

export function isManifestName(name: string) {
  return /\.(csv|txt)$/i.test(baseName(name));
}

// Why an archive entry or selected file is not a photo to upload, or null when it is one.
export function photoEntryProblem(path: string): SkipReason | "directory" | null {
  if (!path || /[\\/]$/.test(path)) return "directory";
  // "." and ".." are path noise (only the base name is ever used); other dot-names are system files.
  const segments = path.split(/[\\/]/).filter((segment) => segment && segment !== "." && segment !== "..");
  if (segments.some((segment) => segment === "__MACOSX" || segment.startsWith("."))) return "hidden";
  if (/^(thumbs\.db|desktop\.ini)$/i.test(segments[segments.length - 1] ?? "")) return "hidden";
  return photoTypeFromName(path) ? null : "not_image";
}

export type ManifestEntry = { sku: string; order: number | null };

// A manifest is a small CSV: archivo;SKU;orden (comma, semicolon or tab; header optional). Returns entries keyed by
// lower-cased base file name, and the lines it could not use.
export function parseManifest(text: string): { entries: Map<string, ManifestEntry>; problems: string[] } {
  const entries = new Map<string, ManifestEntry>();
  const problems: string[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r\n|\n|\r/).filter((line) => line.trim());
  const delimiter = [";", "\t", ","].find((candidate) => lines[0]?.includes(candidate)) ?? ";";
  lines.slice(0, 2000).forEach((line, index) => {
    const cells = line.split(delimiter).map((cell) => cell.trim().replace(/^"(.*)"$/, "$1").trim());
    if (index === 0 && /archivo|file|foto|sku/i.test(cells[0] ?? "") && !photoTypeFromName(cells[0] ?? "")) return;
    const [file, sku, order] = cells;
    const name = baseName(file ?? "");
    if (!name || !sku || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(sku)) {
      problems.push(`Línea ${index + 1}`);
      return;
    }
    const position = order && /^\d{1,2}$/.test(order) && Number(order) >= 1 && Number(order) <= 10 ? Number(order) : null;
    entries.set(name.toLowerCase(), { sku, order: position });
  });
  return { entries, problems };
}

export type ArchivePhoto = { name: string; type: PhotoMimeType; data: Uint8Array };
export type ArchiveSkip = { name: string; reason: SkipReason };

// Reads a ZIP from a stream, one entry at a time, and hands each photo to `onPhoto` before reading on (so at most one
// slice of the archive is in memory beyond what onPhoto keeps). Entries are capped by declared and actual size; a
// lying header or a bomb stops at 5 MB for that entry. Only the base name of an entry is kept. A manifest is chosen as
// its own file, not read from inside the ZIP, so it is known before the first photo is sent.
export async function readPhotoArchive(
  stream: ReadableStream<Uint8Array>,
  handlers: {
    onPhoto: (photo: ArchivePhoto) => Promise<void>;
    remaining?: number;
  },
): Promise<{ photos: number; skipped: ArchiveSkip[]; invalid: boolean }> {
  const skipped: ArchiveSkip[] = [];
  const ready: ArchivePhoto[] = [];
  let remaining = handlers.remaining ?? PHOTO_MAX_FILES;
  let entries = 0;
  let photos = 0;
  let invalid = false;

  const unzipper = new Unzip();
  unzipper.register(UnzipInflate);
  unzipper.onfile = (file: UnzipFile) => {
    entries += 1;
    if (entries > PHOTO_MAX_ARCHIVE_ENTRIES) return;
    const name = baseName(file.name);
    const problem = photoEntryProblem(file.name);
    if (problem === "directory" || problem === "hidden") return;
    if (problem) {
      skipped.push({ name, reason: problem });
      return;
    }
    const cap = PHOTO_MAX_FILE_BYTES;
    if (remaining <= 0) {
      skipped.push({ name, reason: "over_limit" });
      return;
    }
    if ((file.originalSize ?? 0) > cap) {
      skipped.push({ name, reason: "too_large" });
      return;
    }
    remaining -= 1;
    const chunks: Uint8Array[] = [];
    let produced = 0;
    let stopped = false;
    file.ondata = (error, data, final) => {
      if (stopped) return;
      if (error) {
        stopped = true;
        skipped.push({ name, reason: "unreadable" });
        return;
      }
      produced += data.length;
      if (produced > cap) {
        stopped = true;
        file.terminate();
        skipped.push({ name, reason: "too_large" });
        remaining += 1;
        return;
      }
      chunks.push(data);
      if (!final) return;
      ready.push({ name, type: photoTypeFromName(name)!, data: join(chunks, produced) });
    };
    try {
      file.start();
    } catch {
      skipped.push({ name, reason: "unreadable" });
      remaining += 1;
    }
  };

  const reader = stream.getReader();
  let pending: Uint8Array = new Uint8Array(0);
  let finished = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) pending = pending.length ? join([pending, value], pending.length + value.length) : value;
      while (pending.length >= ZIP_READ_SLICE || (done && pending.length)) {
        const slice = pending.subarray(0, ZIP_READ_SLICE);
        pending = pending.subarray(slice.length);
        finished = done && pending.length === 0;
        unzipper.push(slice, finished);
        while (ready.length) {
          await handlers.onPhoto(ready.shift()!);
          photos += 1;
        }
      }
      if (done) {
        if (!finished) unzipper.push(new Uint8Array(0), true);
        break;
      }
      if (entries > PHOTO_MAX_ARCHIVE_ENTRIES) break;
    }
  } catch {
    invalid = true;
  } finally {
    reader.releaseLock();
  }
  while (ready.length) {
    await handlers.onPhoto(ready.shift()!);
    photos += 1;
  }
  if (!photos && !skipped.length) invalid = true;
  return { photos, skipped, invalid };
}

function join(chunks: Uint8Array[], length: number) {
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
