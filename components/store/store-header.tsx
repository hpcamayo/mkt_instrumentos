import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { PageContainer } from "@/components/page-container";
import { RatingFigure, SellerAvatar, SellerKindMark } from "@/components/listing/seller-card";
import { TrustNote } from "@/components/listing/trust-note";
import { StoreVisitLines } from "@/components/store/store-visit";
import { WhatsAppContactLink } from "@/components/whatsapp-contact-link";
import { FollowButton } from "@/components/following/follow-button";
import { buttonClasses } from "@/components/ui/button";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { formatMonthYear, listingCountLabel } from "@/lib/listing-page";
import { buildStoreWhatsAppUrl } from "@/lib/listings";
import { STORES_PATH, type Crumb } from "@/lib/shell";
import type { PublicStoreLocation } from "@/lib/store-storefront";

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

// The store breadcrumb: "Inicio / Tiendas / <tienda>" for every store, the middle item being the stores directory
// (find-13; UX-4 L19 had "Tiendas verificadas" for a verified store only, when the directory did not exist). None on
// phones.
export function storeBreadcrumbs(store: { name: string; is_verified: boolean }): Crumb[] {
  return [
    { label: "Inicio", href: "/" },
    { label: "Tiendas", href: STORES_PATH },
    { label: store.name },
  ];
}

// The store header (UX-4 L17 A, L20 A): a compact identity band on canvas. The banner shows as a 120 px strip (96 px on
// phones) only when the store uploaded one; then the logo or white initials, the name with "Tienda verificada" or
// "Tienda", the place, the description and real figures. At the right (full width on phones) the one contact button
// and the trust statement. No contact bar on the store page. When the store shows them (list-12), the street address
// with "Cómo llegar" and the opening hours follow the place. In the owner's preview (shop-04) the contact button is
// drawn but inert: nobody can be contacted through a page that is not public, and nothing is recorded.
export function StoreHeader({
  store,
  total,
  rating,
  location,
  preview = false,
  isOwner = false,
  trust,
}: {
  store: StoreHeaderData;
  // deal-trust: «Tienda destacada» and «Punto seguro Laria» (components/trust/listing-trust StoreTrustMarks).
  trust?: ReactNode;
  // The exact count of published listings; null when the query failed.
  total: number | null;
  rating: { average: number; count: number } | null;
  location?: PublicStoreLocation;
  preview?: boolean;
  isOwner?: boolean;
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
              {location ? <StoreVisitLines location={location} className="mt-2" /> : null}
              {trust}
              {store.description ? <p className="mt-3 max-w-[68ch] t-body text-ink-2">{store.description}</p> : null}
              {/* Accounts batch, save-12. Not in the owner's preview: a store that is not public cannot be followed. */}
              {preview || isOwner ? null : <div className="mt-3"><FollowButton storeId={store.id} label={store.name} /></div>}
              <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 t-ui text-ink [&>li+li]:before:mr-3 [&>li+li]:before:text-ink-3 [&>li+li]:before:content-['·']">
                {rating ? <li><RatingFigure rating={rating} /></li> : null}
                {total !== null ? <li>{listingCountLabel(total)}</li> : null}
                {since ? <li>En Laria desde {since}</li> : null}
              </ul>
            </div>
          </div>
          <div className="grid gap-2 lg:w-[360px] lg:shrink-0">
            {preview ? (
              <>
                <span aria-disabled="true" className={buttonClasses({ size: "lg", block: true, className: "pointer-events-none" })}>
                  <WhatsAppGlyph />
                  Contactar por WhatsApp
                </span>
                <p className="t-meta">En la vista previa este botón no abre WhatsApp. Funcionará cuando tu tienda sea pública.</p>
              </>
            ) : (
              <WhatsAppContactLink
                href={buildStoreWhatsAppUrl(store)}
                storeId={store.id}
                source="store"
                className={buttonClasses({ size: "lg", block: true })}
              >
                <WhatsAppGlyph />
                Contactar por WhatsApp
              </WhatsAppContactLink>
            )}
            <TrustNote surface="store" />
          </div>
        </div>
      </PageContainer>
    </section>
  );
}
