// Browser side of import photos (design §8.1, §8.2): which files in a selection or ZIP are photos, reading a ZIP one
// entry at a time with hard caps, and the optional manifest. Nothing here is trusted by the server: names only become
// display text and matching hints, and every uploaded object is checked again server-side.
import { Inflate, Unzip, type AsyncFlateStreamHandler, type FlateError, type UnzipDecoder, type UnzipFile } from "fflate";

export const PHOTO_MAX_FILES = 600; // D-3, per import
export const PHOTO_MAX_FILE_BYTES = 5 * 1024 * 1024; // D-3, per photo
export const PHOTO_SLOT_BATCH = 10; // photos per upload round (the server takes up to 25)
export const PHOTO_MAX_ARCHIVE_ENTRIES = 5000; // entries looked at in one ZIP, photos or not
// The ZIP reader takes the archive 16 KiB at a time and inflates an entry in slices small enough that, even at
// deflate's ~1:1032 ceiling, one slice cannot produce more than what is left of the entry's 5 MB budget (and never
// below 1 KiB, about 1 MiB of output). The running total is checked after every slice, so whatever an entry's header
// claims, no single step produces more than the cap and the entry stops within about 1 MiB of it.
const ZIP_READ_STEP = 16 * 1024;
const DEFLATE_MAX_RATIO = 1032;
const INFLATE_MIN_SLICE = 1024;

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

// Deflate for ZIP entries, inflated in budget-sized slices (above) and stoppable: terminate() (an entry over its cap,
// or one that is not wanted) stops the inflating. fflate's own UnzipInflate inflates whatever chunk it is handed in
// one go, whatever it expands to, and cannot be stopped.
class SlicedInflate implements UnzipDecoder {
  static compression = 8;
  ondata: AsyncFlateStreamHandler = () => {};
  private stopped = false;
  private produced = 0;
  private readonly inflater = new Inflate((data, final) => {
    this.produced += data.length;
    this.ondata(null, data, final);
  });

  push(data: Uint8Array, final: boolean) {
    for (let offset = 0, size = 0; !this.stopped; offset += size) {
      size = Math.max(INFLATE_MIN_SLICE, Math.floor((PHOTO_MAX_FILE_BYTES - this.produced) / DEFLATE_MAX_RATIO));
      const last = offset + size >= data.length;
      try {
        this.inflater.push(data.subarray(offset, offset + size), final && last);
      } catch (error) {
        this.stopped = true;
        this.ondata(error as FlateError, new Uint8Array(0), final);
      }
      if (last) return;
    }
  }

  terminate() {
    this.stopped = true;
  }
}

// fflate keeps every byte of an entry that is never started, so an unwanted entry is started into nothing and stopped
// at once: its bytes are dropped as they stream past and it is never inflated.
function discard(file: UnzipFile) {
  file.ondata = () => {};
  try {
    file.start();
    file.terminate();
  } catch {
    // Unknown compression method: fflate cannot start it and keeps its bytes until the reader is done.
  }
}

// Reads a ZIP from a stream, one small step at a time, and hands each photo to `onPhoto` before reading on (so at most
// one read of the archive and the photos finished in one step are in memory beyond what onPhoto keeps). Entries are
// capped by declared and actual size; a declared size is only a shortcut, never trusted: a lying header, an entry
// without sizes (data descriptor) or a bomb stops within about 1 MiB of 5 MB for that entry. Only the base name of an
// entry is kept. A manifest is chosen as its own file, not read from inside the ZIP, so it is known before the first
// photo is sent.
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
  unzipper.register(SlicedInflate);
  unzipper.onfile = (file: UnzipFile) => {
    entries += 1;
    if (entries > PHOTO_MAX_ARCHIVE_ENTRIES) return discard(file);
    const name = baseName(file.name);
    const problem = photoEntryProblem(file.name);
    if (problem === "directory" || problem === "hidden") return discard(file);
    if (problem) {
      skipped.push({ name, reason: problem });
      return discard(file);
    }
    const cap = PHOTO_MAX_FILE_BYTES;
    if (remaining <= 0) {
      skipped.push({ name, reason: "over_limit" });
      return discard(file);
    }
    if ((file.originalSize ?? 0) > cap) {
      skipped.push({ name, reason: "too_large" });
      return discard(file);
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
      while (pending.length >= ZIP_READ_STEP || (done && pending.length)) {
        const slice = pending.subarray(0, ZIP_READ_STEP);
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
