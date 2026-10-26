import { readReviewPhotos } from "@/lib/deal-trust";

// The approved photos of a review (safe-06), in one line of small squares under its text. Each opens the photo itself.
// Plain <img>: the private bucket is served by /api/review-photos/[id], which next/image can't optimize.
export function ReviewPhotoStrip({ photos, className }: { photos: unknown; className?: string }) {
  const items = readReviewPhotos(photos).slice(0, 3);
  if (items.length === 0) return null;
  return (
    <ul aria-label="Fotos de quien compró" className={className ? `flex flex-wrap gap-2 ${className}` : "flex flex-wrap gap-2"}>
      {items.map((photo, index) => (
        <li key={photo.id}>
          <a href={`/api/review-photos/${photo.id}`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-control border border-subtle focus-visible:outline-offset-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- the private bucket is served by a checked route */}
            <img
              src={`/api/review-photos/${photo.id}`}
              alt={`Foto ${index + 1} de ${items.length} de la reseña`}
              width={72}
              height={72}
              loading="lazy"
              decoding="async"
              className="h-[72px] w-[72px] bg-canvas object-cover"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
