"use client";

import { useRef, useState } from "react";
import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { Lightbox } from "@/components/listing/lightbox";
import type { ListingPhotoData } from "@/lib/listings";

// "Fotos del local" (UX-4 L18 A): up to five square thumbnails that open the listing page's lightbox.
export function StorePhotos({ photos, storeName }: { photos: ListingPhotoData[]; storeName: string }) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const shown = photos.slice(0, 5);
  if (shown.length === 0) return null;
  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {shown.map((photo, index) => (
          <li key={photo.id ?? photo.image_url}>
            <button
              type="button"
              aria-label={`Ver foto ${index + 1} de ${shown.length} del local`}
              onClick={(event) => {
                opener.current = event.currentTarget;
                setOpenAt(index);
              }}
              className="relative block h-16 w-16 overflow-hidden rounded-control ring-1 ring-subtle hover:ring-line-strong lg:h-[72px] lg:w-[72px]"
            >
              <Image fill sizes="(max-width: 1023px) 64px, 72px" src={photo.image_url} alt="" loading="lazy" className="object-cover" />
            </button>
          </li>
        ))}
      </ul>
      {openAt !== null ? (
        <Lightbox
          photos={shown}
          title={`el local de ${storeName}`}
          start={openAt}
          onClose={() => {
            setOpenAt(null);
            opener.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}
