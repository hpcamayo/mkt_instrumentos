// big-12 (docs/ux-effortless/speed.md): photos shared to the installed app from the phone's gallery. The service
// worker (public/sw.js) receives the share, keeps the files in Cache Storage on the device and opens /compartir,
// which sends the seller to their listing form with ?compartido=1. The form takes the photos from here as if they
// had been picked. Nothing reaches the server until the form uploads them.
export const SHARE_CACHE = "laria-compartido-v1";
export const SHARED_PHOTOS_PARAM = "compartido";
// Headers the service worker writes on each stored photo.
export const SHARED_PHOTO_HEADERS = { name: "X-Laria-Name", order: "X-Laria-Order", sharedAt: "X-Laria-Shared-At" } as const;
// A share waits one day at most, so an abandoned one never resurfaces in a later listing.
export const SHARED_PHOTO_MAX_AGE_MS = 24 * 60 * 60 * 1000;

let taking: Promise<File[]> | null = null;

// The shared photos in the order they were shared, once per page load: the device copy is deleted as it is read, and
// a second call (React's development double effects) gets the same files.
export function takeSharedPhotos(): Promise<File[]> {
  taking ??= readSharedPhotos(true);
  return taking;
}

// The same photos without taking them (the /compartir page counts them before it opens the form).
export function peekSharedPhotos(): Promise<File[]> {
  return readSharedPhotos(false);
}

async function readSharedPhotos(remove: boolean): Promise<File[]> {
  if (typeof caches === "undefined") return [];
  try {
    const cache = await caches.open(SHARE_CACHE);
    const photos: Array<{ order: number; file: File }> = [];
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      const sharedAt = Number(response?.headers.get(SHARED_PHOTO_HEADERS.sharedAt));
      const fresh = Number.isFinite(sharedAt) && Date.now() - sharedAt <= SHARED_PHOTO_MAX_AGE_MS;
      if (response && fresh) {
        const blob = await response.blob();
        const name = decodeName(response.headers.get(SHARED_PHOTO_HEADERS.name));
        photos.push({ order: Number(response.headers.get(SHARED_PHOTO_HEADERS.order)) || 0, file: new File([blob], name, { type: blob.type, lastModified: sharedAt }) });
      }
      if (remove || !fresh) await cache.delete(request);
    }
    return photos.sort((a, b) => a.order - b.order).map((photo) => photo.file);
  } catch {
    return [];
  }
}

function decodeName(value: string | null) {
  try {
    return value ? decodeURIComponent(value) : "foto.jpg";
  } catch {
    return "foto.jpg";
  }
}
