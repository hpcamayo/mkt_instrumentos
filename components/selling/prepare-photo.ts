"use client";

// Every listing photo goes through here before upload (FIX 02, docs/ux-effortless/selling.md): the browser redraws it
// as a JPEG of at most 2400 px on its longest side, which drops the EXIF block (and with it the GPS position many
// phones write) and brings a 12 MB phone photo well under the 5 MB bucket limit. Same approach as the store import's
// preparePhoto (components/store-import/photo-upload.ts), but strict: a JPEG that cannot be redrawn has its metadata
// segments cut out instead of being sent as is.

export const MAX_PHOTO_SIDE = 2400;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
// What a seller may pick before shrinking; anything larger is almost certainly not a photo.
export const MAX_SOURCE_PHOTO_BYTES = 40 * 1024 * 1024;

export type PreparedPhoto = { file: File; width: number; height: number; dark: boolean };

export class PhotoPrepareError extends Error {}

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

// iPhone photos (POST 04). Some browsers report no type for them, so the extension counts too.
export function isHeicPhoto(file: Pick<File, "type" | "name">) {
  return /^image\/hei[cf](-sequence)?$/.test(file.type) || (!file.type && /\.hei[cf]$/i.test(file.name));
}

export function isAcceptedPhotoType(type: string, name = "") {
  return ACCEPTED.includes(type) || isHeicPhoto({ type, name });
}

// What the file pickers accept: the three stored types plus HEIC, which is converted here.
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

// Safari decodes HEIC itself; elsewhere libheif (heic2any) converts it to JPEG, loaded only when a HEIC photo arrives.
async function decodableSource(source: File): Promise<Blob> {
  if (!isHeicPhoto(source)) return source;
  try {
    const bitmap = await createImageBitmap(source);
    bitmap.close();
    return source;
  } catch {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({ blob: source, toType: "image/jpeg", quality: 0.92 });
    return Array.isArray(converted) ? converted[0] : converted;
  }
}

export async function prepareListingPhoto(source: File): Promise<PreparedPhoto> {
  if (source.size > MAX_SOURCE_PHOTO_BYTES) throw new PhotoPrepareError("Esta foto es demasiado pesada. Prueba con otra.");
  const name = source.name.replace(/\.[^.]+$/, "") || "foto";
  try {
    const bitmap = await createImageBitmap(await decodableSource(source), { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const dark = isDark(canvas);
    for (const quality of [0.88, 0.8, 0.7]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_UPLOAD_BYTES) {
        return { file: new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: source.lastModified }), width: canvas.width, height: canvas.height, dark };
      }
    }
  } catch {
    // Not decodable here: fall through to the byte-level path below.
  }
  if (source.type === "image/jpeg" && source.size <= MAX_UPLOAD_BYTES) {
    const stripped = stripJpegMetadata(new Uint8Array(await source.arrayBuffer()));
    if (stripped) return { file: new File([stripped as BlobPart], `${name}.jpg`, { type: "image/jpeg", lastModified: source.lastModified }), width: 0, height: 0, dark: false };
  }
  if ((source.type === "image/png" || source.type === "image/webp") && source.size <= MAX_UPLOAD_BYTES) {
    // PNG and WebP from phones carry no camera position in practice; send them unchanged when they cannot be redrawn.
    return { file: source, width: 0, height: 0, dark: false };
  }
  throw new PhotoPrepareError("No pudimos preparar esta foto en tu navegador. Prueba con otra o tómala de nuevo.");
}

// Removes APP1–APP15 segments (EXIF, XMP, maker notes) and comments from a JPEG, keeping APP0 (JFIF) and the image.
// Returns null when the bytes are not a JPEG this walker understands.
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    // Start of scan: the rest is image data.
    if (marker === 0xda) {
      kept.push(bytes.subarray(offset));
      break;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    const metadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!metadata) kept.push(bytes.subarray(offset, offset + 2 + length));
    offset += 2 + length;
  }
  const total = kept.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let position = 0;
  for (const part of kept) {
    output.set(part, position);
    position += part.length;
  }
  return output;
}

// Average brightness on a 64 px copy; below this a buyer can't see the instrument well.
function isDark(source: HTMLCanvasElement) {
  try {
    const sample = document.createElement("canvas");
    sample.width = 64;
    sample.height = 64;
    const context = sample.getContext("2d");
    if (!context) return false;
    context.drawImage(source, 0, 0, 64, 64);
    const { data } = context.getImageData(0, 0, 64, 64);
    let sum = 0;
    for (let index = 0; index < data.length; index += 4) {
      sum += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    }
    return sum / (data.length / 4) < 60;
  } catch {
    return false;
  }
}
