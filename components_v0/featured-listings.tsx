import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { ImageOff, MapPin } from "lucide-react";
import Link from "next/link";
import { VerifiedIcon } from "@/components/ui/verified-mark";
import { PageContainer } from "@/components/page-container";
import { ListingImpressionBoundary } from "@/components/marketplace-telemetry";
import { FavoriteButton } from "@/components/favorite-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Price } from "@/components/ui/price";

export type FeaturedListing = {
  id: string;
  title: string;
  slug: string;
  pricePen: number | null;
  location: string;
  imageUrl: string | null;
  imageAlt: string;
  condition: string | null;
  isVerifiedStore: boolean;
};

export function FeaturedListings({
  listings,
}: {
  listings: FeaturedListing[];
}) {
  return (
    <section className="bg-canvas py-10 md:py-14">
      <PageContainer>
        <div className="mb-7 flex items-center justify-between gap-4">
          <h2 className="t-page text-ink">
            Recién publicados
          </h2>
          <Link
            href="/listados"
            className="link hidden t-ui font-semibold md:inline-flex"
          >
            Ver todos →
          </Link>
        </div>

        {listings.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {listings.map((listing) => (
              <ListingImpressionBoundary key={listing.id} listingId={listing.id}>
                <ListingPreviewCard listing={listing} />
              </ListingImpressionBoundary>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Aún no hay publicaciones"
            description="Las primeras publicaciones aparecerán aquí."
            actions={<Button href="/vender" variant="secondary">Publicar un instrumento</Button>}
            headingLevel={3}
          />
        )}

        <div className="mt-8 text-center md:hidden">
          <Link
            href="/listados"
            className="link inline-flex t-ui font-semibold"
          >
            Ver todas las publicaciones
          </Link>
        </div>
      </PageContainer>
    </section>
  );
}

function ListingPreviewCard({ listing }: { listing: FeaturedListing }) {
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
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-canvas px-4 text-center">
            <ImageOff className="h-8 w-8 text-ink-3" aria-hidden="true" />
            <span className="t-meta font-semibold">Sin foto</span>
          </div>
        )}

        {listing.condition ? (
          <span className="absolute left-3 top-3 max-w-[calc(100%-4.5rem)] truncate rounded-tag bg-white px-2 py-0.5 t-meta font-semibold text-ink">
            {listing.condition}
          </span>
        ) : null}
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 t-card-title text-ink underline-offset-4 group-hover:underline group-hover:decoration-accent group-hover:decoration-2">
            {listing.title}
          </h3>
          <Price value={listing.pricePen} className="shrink-0 justify-end text-right" />
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

  return (
    <div className="relative"><Link href={`/instrumentos/${listing.slug}`} className="block">
      {content}
    </Link><div className="absolute right-3 top-3"><FavoriteButton listingId={listing.id} /></div></div>
  );
}
