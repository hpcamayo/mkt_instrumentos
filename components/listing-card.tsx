import Link from "next/link";
import {
  formatPrice,
  getCategoryLabel,
  normalizeStore,
  type ListingCardData,
} from "@/lib/listings";

type ListingCardProps = {
  listing: ListingCardData;
};

export function ListingCard({ listing }: ListingCardProps) {
  const store = normalizeStore(listing);
  const photo = listing.listing_photos[0];
  const isStoreListing = listing.seller_type === "store";
  const isVerifiedStore = isStoreListing && store?.is_verified === true;

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="aspect-[4/3] bg-slate-100">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.image_url}
            alt={photo.alt_text ?? listing.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-500">
            Foto pendiente
          </div>
        )}
      </div>
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
            {isStoreListing ? "Tienda" : "Particular"}
          </span>
          {isVerifiedStore ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              Tienda verificada
            </span>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-brass">
            {getCategoryLabel(listing.category)}
          </p>
          <h2 className="line-clamp-2 text-base font-semibold leading-6 text-ink">
            <Link
              href={`/instrumentos/${listing.slug}`}
              className="underline-offset-4 hover:underline"
            >
              {listing.title}
            </Link>
          </h2>
          <p className="text-sm text-slate-600">
            {[listing.brand, listing.model].filter(Boolean).join(" ") ||
              listing.condition ||
              "Publicado recientemente"}
          </p>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-ink">
              {formatPrice(listing.price_pen)}
            </p>
            <p className="text-sm text-slate-500">
              {listing.city}, {listing.region}
            </p>
          </div>
          {store ? (
            <Link
              href={`/tiendas/${store.slug}`}
              className="text-right text-xs font-semibold text-slate-600 underline-offset-4 hover:underline"
            >
              {store.name}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
