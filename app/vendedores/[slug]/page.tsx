import type { SupabaseClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ListingCard } from "@/components/listing-card";
import { ReputationSection } from "@/components/listing/reputation-section";
import { SellerAvatar } from "@/components/listing/seller-card";
import { PageContainer } from "@/components/page-container";
import { SellerLevelMark } from "@/components/trust/seller-level-mark";
import { EmptyState } from "@/components/ui/empty-state";
import { Tag } from "@/components/ui/tag";
import { monthYearLong, readSellerPage } from "@/lib/deal-trust";
import { verifiedSalesLabel } from "@/lib/listing-page";
import { DISCOVERABLE_STOCK_FILTER, type ListingCardData } from "@/lib/listings";
import { NOINDEX_FOLLOW_ROBOTS } from "@/lib/site";
import { getRequestReads } from "@/lib/supabase/public-read-client";
import { readPublicReputation } from "@/lib/transactions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type SellerPageProps = { params: Promise<{ slug: string }> };

// The grid of the store page: two columns on phones up to five from 1280 px.
const GRID = "grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-x-5 md:gap-y-8 lg:grid-cols-4 xl:grid-cols-5";
const GRID_SIZES = "(max-width: 767px) 50vw, (max-width: 1023px) 33vw, (max-width: 1279px) 25vw, 270px";
const PAGE_LISTINGS = 40;

const LISTING_SELECT = `
  id,
  title,
  slug,
  category,
  brand,
  model,
  condition,
  price_pen,
  previous_price_pen,
  price_dropped_at,
  instrument_type,
  attributes,
  published_at,
  view_count,
  city,
  region,
  seller_type,
  stock_state,
  created_at,
  stores (
    name,
    slug,
    status,
    is_verified
  ),
  photo_count:listing_photo_count,
  listing_photos (
    id,
    listing_id,
    image_url,
    alt_text,
    sort_order
  )
`;

// get_seller_page answers only for a Particular who has an approved or sold publication and didn't hide the page. A
// failed read throws ("Algo salió mal · Reintentar"); a missing page is a 404 for everyone.
const loadSellerPage = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return null;
  const { supabase } = getRequestReads();
  if (!supabase) return null;
  const { data, error } = await (supabase as unknown as SupabaseClient).rpc("get_seller_page", { p_slug: slug });
  if (error) throw new Error(`The seller page could not be read: ${error.message}`);
  return readSellerPage(data);
});

export async function generateMetadata({ params }: SellerPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadSellerPage(slug);
  // FD-deal-trust-8: a person's page stays out of search engines; it is for the people they send it to.
  if (!page) return { title: "Perfil no disponible", robots: NOINDEX_FOLLOW_ROBOTS };
  return {
    title: `${page.firstName} en Laria`,
    description: `Publicaciones, ventas confirmadas y reseñas de ${page.firstName}, que vende en Laria.`,
    robots: NOINDEX_FOLLOW_ROBOTS,
    alternates: { canonical: `/vendedores/${page.slug}` },
  };
}

// «Perfil del vendedor» (sell-09): a Particular's page, with what Laria recorded and nothing personal: the first name,
// the city, since when, the sales both sides confirmed, the seller level, the reviews and the active publications. No
// phone, no surname, no address. The person can hide it from "Compras y ventas".
export default async function SellerProfilePage({ params }: SellerPageProps) {
  const { slug } = await params;
  const page = await loadSellerPage(slug);
  if (!page) notFound();
  const { supabase } = getRequestReads();
  if (!supabase) notFound();

  const [listingsResult, reputationResult] = await Promise.all([
    supabase
      // public_listings: the cards' photo_count reads a row of public columns (lib/catalog.ts).
      .from("public_listings")
      .select(LISTING_SELECT)
      .eq("status", "approved")
      .eq("seller_type", "individual")
      .eq("owner_user_id", page.userId)
      .or(DISCOVERABLE_STOCK_FILTER)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("sort_order", { foreignTable: "listing_photos", ascending: true })
      .limit(1, { foreignTable: "listing_photos" })
      .limit(PAGE_LISTINGS)
      .returns<ListingCardData[]>(),
    supabase.rpc("get_public_reputation", { p_subject_user_id: page.userId, p_limit: 5 }),
  ]);
  const listings = (listingsResult.data ?? []) as ListingCardData[];
  const reputation = reputationResult.error ? null : readPublicReputation(reputationResult.data);
  const since = monthYearLong(page.memberSince);

  return (
    <>
      <section className="border-b border-line-deco bg-canvas">
        <PageContainer className="pb-5 pt-4 md:pb-6 md:pt-5">
          <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: page.firstName }]} />
          <div className="mt-4 flex min-w-0 gap-4">
            <SellerAvatar seller={{ name: page.firstName, kind: "particular" }} size={64} />
            <div className="min-w-0">
              <h1 className="break-words t-page text-ink">{page.firstName}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <Tag>Particular</Tag>
                {page.city ? <span className="t-ui text-ink-2">{page.city}</span> : null}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 t-ui text-ink [&>li+li]:before:mr-3 [&>li+li]:before:text-ink-3 [&>li+li]:before:content-['·']">
                {since ? <li>En Laria desde {since}</li> : null}
                {page.verifiedSales > 0 ? <li>{verifiedSalesLabel(page.verifiedSales)}</li> : null}
                <li>{page.activeListings === 1 ? "1 publicación activa" : `${page.activeListings} publicaciones activas`}</li>
              </ul>
              {page.level ? <SellerLevelMark level={page.level} className="mt-2" /> : null}
            </div>
          </div>
        </PageContainer>
      </section>
      <PageContainer as="section" className="grid gap-10 pb-12 pt-6 lg:gap-14 lg:pt-8">
        <section aria-labelledby="publicaciones-titulo">
          <h2 id="publicaciones-titulo" className="t-section text-ink">Publicaciones</h2>
          {listingsResult.error ? (
            <p className="mt-3 t-body text-ink-2">No se pudieron cargar las publicaciones. Intenta nuevamente.</p>
          ) : listings.length > 0 ? (
            <div className={`mt-4 ${GRID}`}>
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} headingLevel={3} sizes={GRID_SIZES} />
              ))}
            </div>
          ) : (
            <EmptyState
              headingLevel={3}
              title={`${page.firstName} no tiene publicaciones activas`}
              description="Las ventas confirmadas y las reseñas siguen aquí."
              className="mt-4"
            />
          )}
        </section>
        <ReputationSection reputation={reputation} title={`Reseñas de ${page.firstName}`} subject={{ user: page.userId }} className="min-w-0 max-w-3xl" />
        <p className="max-w-[68ch] t-meta">
          Laria muestra lo que registró: ventas que comprador y vendedor confirmaron y sus reseñas. No revisa los
          instrumentos ni garantiza una compra.
        </p>
      </PageContainer>
    </>
  );
}
