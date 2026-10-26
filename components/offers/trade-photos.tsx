import { tradePhotoUrl } from "@/lib/selling-tools";

// The photos of a request, read through /api/trade-photos (private bucket, checked per viewer).
export function TradePhotos({ photos, title }: { photos: string[]; title: string }) {
  if (!photos.length) return null;
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Fotos">
      {photos.map((path, index) => (
        <li key={path}>
          <a href={tradePhotoUrl(path)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-control border border-subtle bg-canvas">
            {/* eslint-disable-next-line @next/next/no-img-element -- a private photo served per viewer, not optimizable */}
            <img src={tradePhotoUrl(path)} alt={`${title}, foto ${index + 1}`} loading="lazy" className="aspect-square w-full object-cover" />
          </a>
        </li>
      ))}
    </ul>
  );
}
