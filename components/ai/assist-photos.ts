"use client";

import { LISTING_ASSIST_MAX_PHOTO_BYTES, LISTING_ASSIST_PHOTO_SIDE } from "@/lib/ai/listing-assist";

// big-07: the copies of the seller's photos that "Completar con IA" sends, made in the browser only when the button is
// tapped: a JPEG of at most 1024 px on its longest side (redrawn, so without the photo's metadata), as base64. A photo
// the browser can't decode yet (an iPhone photo still being converted) is skipped.
export async function assistPhoto(source: Blob): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  const scale = Math.min(1, LISTING_ASSIST_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return null;
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= LISTING_ASSIST_MAX_PHOTO_BYTES) return base64(blob);
  }
  return null;
}

function base64(blob: Blob) {
  return new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result.slice(reader.result.indexOf(",") + 1) : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}
