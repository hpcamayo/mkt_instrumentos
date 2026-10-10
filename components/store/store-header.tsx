import { Breadcrumbs } from "@/components/breadcrumbs";
import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { PageContainer } from "@/components/page-container";
import { RatingFigure, SellerAvatar, SellerKindMark } from "@/components/listing/seller-card";
import { TrustNote } from "@/components/listing/trust-note";
import { WhatsAppContactLink } from "@/components/whatsapp-contact-link";
import { buttonClasses } from "@/components/ui/button";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { formatMonthYear, listingCountLabel } from "@/lib/listing-page";
import { buildStoreWhatsAppUrl } from "@/lib/listings";
import type { Crumb } from "@/lib/shell";

export type StoreHeaderData = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string;
  district: string | null;
  region: string | null;
  whatsapp_phone: string;
  logo_url: string | null;
  banner_url: string | null;
  is_verified: boolean;
  created_at: string | null;
};

export const VERIFIED_STORES_HREF = "/listados?seller_type=verified_store";

// The store breadcrumb (UX-4 L19 A): "Inicio / Tiendas verificadas / <tienda>" for a verified store (the middle item is
// N7's filtered catalog), "Inicio / <tienda>" for the others; none on phones.
export function storeBreadcrumbs(store: { name: string; is_verified: boolean }): Crumb[] {
  return [
    { label: "Inicio", href: "/" },
    ...(store.is_verified ? [{ label: "Tiendas verificadas", href: VERIFIED_STORES_HREF }] : []),
    { label: store.name },
  ];
}

// The store header (UX-4 L17 A, L20 A): a compact identity band on canvas. The banner shows as a 120 px strip (96 px on
// phones) only when the store uploaded one; then the logo or white initials, the name with "Tienda verificada" or
// "Tienda", the place, the description and real figures. At the right (full width on phones) the one contact button
// and the trust statement. No contact bar on the store page.
export function StoreHeader({
  store,
  total,
  rating,
}: {
  store: StoreHeaderData;
  // The exact count of published listings; null when the query failed.
  total: number | null;
  rating: { average: number; count: number } | null;
}) {
  const place = [store.district, store.city, store.region && store.region !== store.city ? store.region : null].filter(Boolean).join(", ");
  const since = formatMonthYear(store.created_at);
  const kind = store.is_verified ? "verified" : "store";
  return (
    <section className="border-b border-line-deco bg-canvas">
      <PageContainer className="pb-5 pt-4 md:pb-6 md:pt-5">
        <Breadcrumbs items={storeBreadcrumbs(store)} />
        {store.banner_url ? (
          <div className="relative mt-3 h-24 overflow-hidden rounded-panel md:h-[120px]">
            <Image fill priority sizes="(max-width: 1440px) 100vw, 1376px" src={store.banner_url} alt="" className="object-cover" />
          </div>
        ) : null}
        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
          <div className="flex min-w-0 gap-4">
            <SellerAvatar seller={{ name: store.name, kind, logoUrl: store.logo_url }} size={96} />
            <div className="min-w-0">
              <h1 className="break-words t-page text-ink">{store.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <SellerKindMark kind={kind} />
                {place ? <span className="t-ui text-ink-2">{place}</span> : null}
              </div>
              {store.description ? <p className="mt-3 max-w-[68ch] t-body text-ink-2">{store.description}</p> : null}
              <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 t-ui text-ink [&>li+li]:before:mr-3 [&>li+li]:before:text-ink-3 [&>li+li]:before:content-['·']">
                {rating ? <li><RatingFigure rating={rating} /></li> : null}
                {total !== null ? <li>{listingCountLabel(total)}</li> : null}
                {since ? <li>En Laria desde {since}</li> : null}
              </ul>
            </div>
          </div>
          <div className="grid gap-2 lg:w-[360px] lg:shrink-0">
            <WhatsAppContactLink
              href={buildStoreWhatsAppUrl(store)}
              storeId={store.id}
              source="store"
              className={buttonClasses({ size: "lg", block: true })}
            >
              <WhatsAppGlyph />
              Contactar por WhatsApp
            </WhatsAppContactLink>
            <TrustNote surface="store" />
          </div>
        </div>
      </PageContainer>
    </section>
  );
}
