import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { MapPin } from "lucide-react";
import Link from "next/link";
import { VerifiedIcon } from "@/components/ui/verified-mark";
import { PageContainer } from "@/components/page-container";
import { ListingImpressionBoundary } from "@/components/marketplace-telemetry";
import { FavoriteButton } from "@/components/favorite-button";

export type FeaturedListing = {
  id: string;
  title: string;
  slug: string;
  price: string;
  location: string;
  imageUrl: string | null;
  imageAlt: string;
  isVerifiedStore: boolean;
};

// UI placeholder only; replace with real data when feature/data is implemented.
const placeholderListings: FeaturedListing[] = [
  {
    id: "ui-placeholder-1",
    title: "Fender Stratocaster",
    slug: "",
    price: "S/ 3,900",
    location: "Lima, PE",
    imageUrl: null,
    imageAlt: "Guitarra electrica",
    isVerifiedStore: false,
  },
  {
    id: "ui-placeholder-2",
    title: "Amplificador valvular",
    slug: "",
    price: "S/ 2,400",
    location: "Arequipa, PE",
    imageUrl: null,
    imageAlt: "Amplificador",
    isVerifiedStore: true,
  },
  {
    id: "ui-placeholder-3",
    title: "Pedal delay digital",
    slug: "",
    price: "S/ 520",
    location: "Cusco, PE",
    imageUrl: null,
    imageAlt: "Pedal de efectos",
    isVerifiedStore: false,
  },
  {
    id: "ui-placeholder-4",
    title: "Monitor de estudio",
    slug: "",
    price: "S/ 1,100",
    location: "Trujillo, PE",
    imageUrl: null,
    imageAlt: "Monitor de estudio",
    isVerifiedStore: true,
  },
];

export function FeaturedListings({
  listings,
}: {
  listings: FeaturedListing[];
}) {
  const hasRealListings = listings.length > 0;
  const visibleListings = hasRealListings ? listings : placeholderListings;

  return (
    <section className="bg-canvas py-10 md:py-14">
      <PageContainer>
        <div className="mb-7 flex items-center justify-between gap-4">
          <div>
            <p className="t-micro text-ink-2">
              Destacados para ti
            </p>
            <h2 className="mt-2 t-page text-ink">
              Instrumentos recientes
            </h2>
          </div>
          <Link
            href="/listados"
            className="link hidden t-ui font-semibold md:inline-flex"
          >
            Ver todos →
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {visibleListings.map((listing) => (
            hasRealListings ? <ListingImpressionBoundary key={listing.id} listingId={listing.id}>
              <ListingPreviewCard listing={listing} isPlaceholder={false} />
            </ListingImpressionBoundary> : <div key={listing.id}>
              <ListingPreviewCard
                listing={listing}
                isPlaceholder={!hasRealListings}
              />
            </div>
          ))}
        </div>

        {!hasRealListings ? (
          <p className="mt-4 text-center t-ui text-ink-2">
            Vista previa visual. Pronto apareceran publicaciones aprobadas.
          </p>
        ) : null}

        <div className="mt-8 text-center md:hidden">
          <Link
            href="/listados"
            className="link inline-flex t-ui font-semibold"
          >
            Ver todos los anuncios
          </Link>
        </div>
      </PageContainer>
    </section>
  );
}

function ListingPreviewCard({
  listing,
  isPlaceholder,
}: {
  listing: FeaturedListing;
  isPlaceholder: boolean;
}) {
  const content = (
    <article className="group overflow-hidden rounded-panel border border-subtle bg-white transition-colors duration-120 hover:border-line-strong">
      <div className="relative aspect-[4/3] bg-subtle">
        {listing.imageUrl ? (
          <Image
            width={800}
            height={600}
            sizes="(max-width: 459px) 100vw, (max-width: 767px) 50vw, (max-width: 1279px) 33vw, 320px"
            src={listing.imageUrl}
            alt={listing.imageAlt}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-canvas px-4 text-center t-ui font-semibold text-ink-2">
            {listing.imageAlt}
          </div>
        )}

        <span className="absolute left-3 top-3 rounded-tag bg-white px-2 py-0.5 t-meta font-semibold text-ink">
          {isPlaceholder ? "Vista previa" : "Nuevo"}
        </span>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 t-card-title text-ink underline-offset-4 group-hover:underline group-hover:decoration-accent group-hover:decoration-2">
            {listing.title}
          </h3>
          <span className="shrink-0 text-right t-card-price text-ink">
            {listing.price}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 t-meta">
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {listing.location}
          </span>
          {listing.isVerifiedStore ? (
            <span className="flex items-center gap-1 font-semibold text-ink">
              <VerifiedIcon className="h-3.5 w-3.5" />
              Tienda verificada
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );

  if (isPlaceholder) {
    return content;
  }

  return (
    <div className="relative"><Link href={`/instrumentos/${listing.slug}`} className="block">
      {content}
    </Link><div className="absolute right-3 top-3"><FavoriteButton listingId={listing.id} /></div></div>
  );
}
