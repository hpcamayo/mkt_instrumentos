import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CategoryLanding } from "@/components/category-landing";
import { ContentReport } from "@/components/content-report";
import { JsonLd } from "@/components/json-ld";
import { ContactModule } from "@/components/listing/contact-module";
import { ListingGallery } from "@/components/listing/listing-gallery";
import { RelatedListings, RelatedListingsSkeleton } from "@/components/listing/related-listings";
import { ReputationSection } from "@/components/listing/reputation-section";
import { RatingFigure, SellerCard, sellerKindLabel, type SellerSummary } from "@/components/listing/seller-card";
import { SpecStrip, SpecTable } from "@/components/listing/spec-table";
import { TrustNote } from "@/components/listing/trust-note";
import { ListingDetailMetadata } from "@/components/listing-detail-metadata";
import { PageContainer } from "@/components/page-container";
import { StripCurrent } from "@/components/strip-current";
import { NoticeIcon, noticeClassName } from "@/components/ui/notice";
import { Price } from "@/components/ui/price";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusTag, Tag } from "@/components/ui/tag";
import { getSpecStrip, getSpecTable } from "@/lib/listing-specs";
import { formatMonthYear, formatPublishedAgo, listingCountLabel } from "@/lib/listing-page";
import {
  buildWhatsAppUrl,
  getConditionLabel,
  getListingDisplayTitle,
  getListingSecondaryTitle,
  normalizeStore,
  parseListingFilters,
  resolveParticularSeller,
  type ListingCardData,
  type ListingDetailData,
} from "@/lib/listings";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getPublicSupabaseClient, warnMissingSupabaseEnv } from "@/lib/supabase/public-client";
import { readPublicReputation, type PublicReputation } from "@/lib/transactions";
import { fetchCatalogPage } from "@/lib/catalog";
import { getCatalogBrandsByCategory } from "@/lib/catalog-brands";
import {
  categoryLandingPath,
  categoryTypePath,
  getCategoryLandingBySlug,
  type CategoryLandingPage,
} from "@/lib/category-pages";
import { createSearchReceipt } from "@/lib/marketplace-events-server";
import { searchEventMetadata } from "@/lib/marketplace-event-payload";
import { getPageRedirect, pageHref, parsePage } from "@/lib/pagination";
import {
  buildCategoryMetadata,
  buildListingJsonLd,
  buildListingMetadata,
  categoryFilterRedirect,
} from "@/lib/seo";
import { listingBreadcrumbs } from "@/lib/shell";
import { NOINDEX_FOLLOW_ROBOTS, NOINDEX_ROBOTS } from "@/lib/site";

export const dynamic = "force-dynamic";

type ListingDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type PublicSupabaseClient = NonNullable<
  ReturnType<typeof getPublicSupabaseClient>
>;

const relatedListingSelect = `
  id,
  title,
  slug,
  category,
  brand,
  model,
  condition,
  price_pen,
  instrument_type,
  attributes,
  published_at,
  view_count,
  city,
  region,
  seller_type,
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

// Shared by generateMetadata and the page so one request performs one detail lookup.
const loadPublicListing = cache(async (slug: string) => {
  const supabase = getPublicSupabaseClient();
  const detailClient = getSupabaseAdminClient();

  if (!supabase || !detailClient) {
    return { configured: false as const, listing: null };
  }

  const { data, error } = await detailClient
    .from("listings")
    .select(
      `
        id,
        status,
        sold_at,
        store_id,
        owner_user_id,
        title,
        slug,
        description,
        category,
        brand,
        model,
        condition,
        price_pen,
        instrument_type,
        attributes,
        published_at,
        view_count,
        city,
        region,
        seller_type,
        contact_name,
        whatsapp_phone,
        created_at,
        profiles!listings_owner_user_id_fkey (
          full_name,
          phone,
          city,
          region,
          created_at
        ),
        stores (
          name,
          slug,
          status,
          is_verified,
          description,
          city,
          district,
          whatsapp_phone,
          logo_url,
          created_at
        ),
        photo_count:listing_photo_count,
        listing_photos (
          id,
          listing_id,
          image_url,
          alt_text,
          sort_order
        )
      `,
    )
    .in("status", ["approved", "sold"])
    .eq("slug", slug)
    .order("sort_order", {
      foreignTable: "listing_photos",
      ascending: true,
    })
    .maybeSingle()
    .returns<ListingDetailData>();

  if (error || !data) {
    return { configured: true as const, listing: null };
  }

  if (data.status === "sold" && normalizeStore(data)?.status && normalizeStore(data)?.status !== "active") {
    return { configured: true as const, listing: null };
  }
  if (data.status === "approved") {
    const { data: isPublic } = await supabase.rpc("listing_is_public", {
      p_listing_id: data.id,
    });
    if (!isPublic) return { configured: true as const, listing: null };
  }

  return { configured: true as const, listing: data as ListingDetailData };
});

export async function generateMetadata({ params, searchParams }: ListingDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const landing = getCategoryLandingBySlug(slug);
  if (landing) {
    const resolvedSearchParams = await searchParams;
    // Filtered category URLs redirect to /listados; skip the inventory query.
    if (categoryFilterRedirect(landing, resolvedSearchParams)) {
      return { title: landing.heading, robots: NOINDEX_FOLLOW_ROBOTS };
    }
    const page = parsePage(resolvedSearchParams.page);
    const { count, error } = await loadCategoryPage(landing.category, page);
    return buildCategoryMetadata(landing, page, error ? null : count);
  }

  const { listing } = await loadPublicListing(slug);
  if (!listing) {
    return { title: "Publicación no disponible", robots: NOINDEX_ROBOTS };
  }
  return buildListingMetadata(listing);
}

export default async function ListingDetailPage({
  params,
  searchParams,
}: ListingDetailPageProps) {
  const { slug } = await params;
  const landing = getCategoryLandingBySlug(slug);
  if (landing) {
    return renderCategoryLanding(landing, await searchParams);
  }

  const supabase = getPublicSupabaseClient();
  const { configured, listing } = await loadPublicListing(slug);

  if (!configured || !supabase) {
    return <SupabaseSetupMessage />;
  }

  if (!listing) {
    notFound();
  }

  const reputationTarget = listing.store_id
    ? { p_subject_store_id: listing.store_id, p_limit: 5 }
    : listing.owner_user_id
      ? { p_subject_user_id: listing.owner_user_id, p_limit: 5 }
      : null;
  // A failed reputation call leaves the reviews (and the rating figure) out instead of claiming there are none.
  const reputationResult = reputationTarget
    ? await supabase.rpc("get_public_reputation", reputationTarget)
    : null;
  const reputation = reputationResult && !reputationResult.error ? readPublicReputation(reputationResult.data) : null;
  return (
    <>
      <JsonLd data={buildListingJsonLd(listing)} />
      <ListingDetail listing={listing} supabase={supabase} reputation={reputation} />
    </>
  );
}

const loadCategoryPage = cache(async (category: string, page: number) => {
  const supabase = getPublicSupabaseClient();
  if (!supabase) return { configured: false as const, count: null, data: null, error: null };
  const filters = parseListingFilters({ category });
  const result = await fetchCatalogPage(supabase, filters, page);
  return { configured: true as const, count: result.count, data: result.data, error: result.error };
});

async function renderCategoryLanding(
  landing: CategoryLandingPage,
  searchParams: Record<string, string | string[] | undefined>,
) {
  const path = `/instrumentos/${landing.slug}`;
  // Filtering happens in the canonical catalog; forward filter parameters there.
  const forwarded = categoryFilterRedirect(landing, searchParams);
  if (forwarded) redirect(forwarded);

  const page = parsePage(searchParams.page);
  const filters = parseListingFilters({ category: landing.category });
  const [result, catalogBrands] = await Promise.all([loadCategoryPage(landing.category, page), getCatalogBrandsByCategory()]);
  if (!result.configured) return <SupabaseSetupMessage />;

  const redirectPage = getPageRedirect(page, result.count, result.error);
  if (redirectPage !== null) redirect(pageHref(path, {}, redirectPage));

  const searchReceipt = !result.error && page === 1 ? createSearchReceipt(filters, result.count ?? 0) : null;
  const searchState = searchEventMetadata(filters, result.count ?? 0);

  return (
    <CategoryLanding
      landing={landing}
      brands={catalogBrands[landing.category] ?? []}
      filters={filters}
      listings={(result.data ?? []) as ListingCardData[]}
      totalCount={result.count ?? 0}
      page={page}
      errorMessage={result.error?.message}
      searchReceipt={searchReceipt}
      searchSignature={JSON.stringify(searchState.filters)}
    />
  );
}

// The listing page (docs/ux-redesign/ux-4-listing-store.md § Listing page, answers L1–L21). From 1024 px two columns:
// the gallery, "Especificaciones", "Descripción" and the reviews on the left (7 of 12); the decision column on the
// right (identity, spec strip, the contact module, the trust statement, the seller card, "Reportar publicación"). Below
// 1024 px one column, in the brief's order: the column wrappers become `contents` and each block takes its `order`;
// the contact module becomes the bar at the bottom of the screen. Nothing is sticky.
function ListingDetail({
  listing,
  supabase,
  reputation,
}: {
  listing: ListingDetailData;
  supabase: PublicSupabaseClient;
  reputation: PublicReputation | null;
}) {
  const store = normalizeStore(listing);
  const particular = resolveParticularSeller(listing);
  const isStore = listing.seller_type === "store";
  const displayTitle = getListingDisplayTitle(listing);
  const secondaryTitle = getListingSecondaryTitle(listing);
  const isSold = listing.status === "sold";
  const place = `${listing.city}, ${listing.region}`;
  const seller: SellerSummary = {
    name: (isStore ? store?.name : particular.name) || (isStore ? "Tienda" : "Particular"),
    kind: isStore ? (store?.is_verified === true ? "verified" : "store") : "particular",
    place: isStore
      ? [store?.district, store?.city].filter(Boolean).join(", ") || place
      : [particular.city, particular.region].filter(Boolean).join(", ") || place,
    logoUrl: isStore ? store?.logo_url ?? null : null,
    storeHref: isStore && store ? `/tiendas/${store.slug}` : null,
    rating:
      reputation && reputation.review_count > 0 && reputation.average_rating !== null
        ? { average: reputation.average_rating, count: reputation.review_count }
        : null,
    since: formatMonthYear(isStore ? store?.created_at : particular.createdAt ?? listing.created_at),
  };
  const strip = getSpecStrip(listing);
  const typeHref = listing.instrument_type
    ? categoryTypePath(listing.category, listing.instrument_type)
    : categoryLandingPath(listing.category);

  return (
    <section className="bg-surface">
      <StripCurrent value={listing.category} />
      <PageContainer className="pb-10 pt-3 md:pt-5 lg:pb-14">
        <Breadcrumbs items={listingBreadcrumbs(listing, displayTitle)} phoneBackLink />

        <div className="mt-2 flex min-w-0 flex-col gap-6 md:mt-4 lg:grid lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-x-8 lg:gap-y-10">
          <div className="order-1 min-w-0 lg:col-span-7 lg:row-start-1">
            <ListingGallery photos={listing.listing_photos} title={displayTitle} />
          </div>

          <div className="contents lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1 lg:flex lg:min-w-0 lg:flex-col lg:gap-6 lg:self-start">
            <div className="order-2 min-w-0 lg:order-1">
              {isSold ? <div className="mb-3"><StatusTag domain="listing" status="sold" /></div> : null}
              <h1 className="t-page text-ink">
                {displayTitle}
              </h1>
              {secondaryTitle ? <p className="mt-1 t-ui text-ink-2">{secondaryTitle}</p> : null}
              <p className="mt-3">
                <Price value={listing.price_pen} size="detail" />
              </p>
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                {listing.condition ? <Tag>{getConditionLabel(listing.condition)}</Tag> : null}
                <ListingDetailMetadata listingId={listing.id} trackView={!isSold}>
                  {place} · {formatPublishedAgo(listing.published_at ?? listing.created_at, Date.now())}
                </ListingDetailMetadata>
              </p>
            </div>

            {isSold ? (
              <div className="order-3 grid gap-2 rounded-panel bg-canvas p-4 lg:order-3">
                <p className="t-ui font-semibold text-ink">
                  Este instrumento fue marcado como vendido y ya no está disponible para consultas de compra.
                </p>
                <Link href="#similares" className="link w-fit t-ui font-semibold">Ver publicaciones similares</Link>
              </div>
            ) : (
              <ContactModule listingId={listing.id} href={buildWhatsAppUrl(listing)} className="order-3 lg:order-3" />
            )}

            <a href="#vendedor" className="order-4 -my-1 flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 rounded-control py-1 lg:hidden">
              <span className="t-ui font-semibold text-ink underline decoration-line-deco underline-offset-[3px]">{seller.name}</span>
              <span className="t-meta">{sellerKindLabel(seller.kind)}</span>
              {seller.rating ? <span className="t-meta"><RatingFigure rating={seller.rating} /></span> : null}
            </a>

            <SpecStrip specs={strip} className="order-5 lg:order-2" />

            {isSold ? null : <TrustNote surface="listing" className="order-6 lg:order-4" />}

            <SellerCard
              seller={seller}
              sold={isSold}
              className="order-9 lg:order-5"
              listingCount={
                <Suspense fallback={<li aria-hidden="true"><Skeleton className="inline-block h-[18px] w-28 align-middle" /></li>}>
                  <SellerInventory supabase={supabase} listing={listing} />
                </Suspense>
              }
            />

            <div className="order-10 lg:order-6">
              <ContentReport targetType="listing" targetId={listing.id} label="Reportar publicación" icon />
            </div>
          </div>

          <div className="contents lg:col-span-7 lg:col-start-1 lg:row-start-2 lg:flex lg:min-w-0 lg:flex-col lg:gap-10">
            <SpecTable specs={getSpecTable(listing)} className="order-7 min-w-0" />

            <section aria-labelledby="descripcion" className="order-8 min-w-0">
              <h2 id="descripcion" className="t-section text-ink">Descripción</h2>
              {listing.description ? (
                <p className="mt-3 max-w-[68ch] whitespace-pre-line break-words t-body text-ink">
                  {listing.description}
                </p>
              ) : (
                <p className="mt-3 t-body text-ink-2">
                  Esta publicación aún no tiene descripción.
                </p>
              )}
            </section>

            <ReputationSection
              reputation={reputation}
              title={`Reseñas de ${seller.name}`}
              className="order-11 min-w-0"
            />
          </div>
        </div>

        <div className="mt-10 grid gap-10 lg:mt-14 lg:gap-14">
          <Suspense fallback={<RelatedListingsSkeleton />}>
            <SimilarListings supabase={supabase} listing={listing} href={typeHref} />
          </Suspense>
          <Suspense fallback={<RelatedListingsSkeleton />}>
            <SellerListings supabase={supabase} listing={listing} storeHref={seller.storeHref ?? null} />
          </Suspense>
        </div>
        {isSold ? null : <div aria-hidden="true" className="contact-bar-spacer" />}
      </PageContainer>
    </section>
  );
}

async function getSimilarListings(
  supabase: PublicSupabaseClient,
  listing: ListingDetailData,
) {
  const primaryFilterColumn = listing.instrument_type
    ? "instrument_type"
    : "category";
  const primaryFilterValue = listing.instrument_type ?? listing.category;
  const primaryQuery = supabase
    .from("listings")
    .select(relatedListingSelect)
    .eq("status", "approved")
    .neq("id", listing.id)
    .eq(primaryFilterColumn, primaryFilterValue)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("sort_order", {
      foreignTable: "listing_photos",
      ascending: true,
    })
    .limit(1, { foreignTable: "listing_photos" })
    .limit(12);

  const { data: primaryData } = await primaryQuery.returns<ListingCardData[]>();
  let listings = sortSimilarListings(
    (primaryData ?? []) as ListingCardData[],
    listing,
  ).slice(0, 4);

  if (listings.length < 4 && listing.brand) {
    const currentIds = new Set([
      listing.id,
      ...listings.map((item) => item.id),
    ]);
    const { data: brandData } = await supabase
      .from("listings")
      .select(relatedListingSelect)
      .eq("status", "approved")
      .neq("id", listing.id)
      .eq("brand", listing.brand)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("sort_order", {
        foreignTable: "listing_photos",
        ascending: true,
      })
      .limit(1, { foreignTable: "listing_photos" })
      .limit(8)
      .returns<ListingCardData[]>();

    const brandListings = ((brandData ?? []) as ListingCardData[]).filter(
      (item) => !currentIds.has(item.id),
    );

    listings = [...listings, ...brandListings].slice(0, 4);
  }

  return {
    listings,
  };
}

function sortSimilarListings(
  listings: ListingCardData[],
  sourceListing: ListingDetailData,
) {
  return [...listings].sort((listingA, listingB) => {
    const listingABrandMatch = hasSameBrand(listingA, sourceListing);
    const listingBBrandMatch = hasSameBrand(listingB, sourceListing);

    if (listingABrandMatch !== listingBBrandMatch) {
      return listingABrandMatch ? -1 : 1;
    }

    return getListingSortTime(listingB) - getListingSortTime(listingA);
  });
}

function hasSameBrand(
  listing: ListingCardData,
  sourceListing: ListingDetailData,
) {
  const sourceBrand = sourceListing.brand?.trim().toLocaleLowerCase("es-PE");
  const listingBrand = listing.brand?.trim().toLocaleLowerCase("es-PE");

  return Boolean(sourceBrand && listingBrand && sourceBrand === listingBrand);
}

function getListingSortTime(listing: ListingCardData) {
  const date = new Date(listing.published_at ?? listing.created_at);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

const getMoreFromSellerListings = cache(
  async function getMoreFromSellerListings(
    supabase: PublicSupabaseClient,
    listing: ListingDetailData,
  ) {
    const baseQuery = supabase
      .from("listings")
      .select(relatedListingSelect, { count: "exact" })
      .eq("status", "approved")
      .neq("id", listing.id);

    const query =
      listing.seller_type === "store" && listing.store_id
        ? baseQuery.eq("store_id", listing.store_id)
        : listing.owner_user_id
          ? baseQuery.eq("owner_user_id", listing.owner_user_id)
          : baseQuery
              .eq("seller_type", "individual")
              .eq("whatsapp_phone", listing.whatsapp_phone);

    const { count, data } = await query
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("sort_order", {
        foreignTable: "listing_photos",
        ascending: true,
      })
      .limit(1, { foreignTable: "listing_photos" })
      .limit(4)
      .returns<ListingCardData[]>();
    const listings = (data ?? []) as ListingCardData[];

    return {
      listings,
      publishedCount:
        count === null ? null : count + (listing.status === "approved" ? 1 : 0),
    };
  },
);

function SupabaseSetupMessage() {
  warnMissingSupabaseEnv();
  return (
    <section className="bg-canvas/70">
      <PageContainer className="py-8">
        <div className={noticeClassName("warning", "max-w-3xl p-5")}>
          <NoticeIcon tone="warning" />
          <div>
            <h1 className="t-section text-ink">
              Esta publicación no está disponible por ahora
            </h1>
            <p className="mt-2">
              Intenta nuevamente en unos minutos.
            </p>
          </div>
        </div>
      </PageContainer>
    </section>
  );
}

async function SimilarListings({
  supabase,
  listing,
  href,
}: {
  supabase: PublicSupabaseClient;
  listing: ListingDetailData;
  href: string;
}) {
  const result = await getSimilarListings(supabase, listing);
  return (
    <RelatedListings
      id="similares"
      title="Publicaciones similares"
      link={{ href, label: "Ver todo" }}
      listings={result.listings}
    />
  );
}

async function SellerListings({
  supabase,
  listing,
  storeHref,
}: {
  supabase: PublicSupabaseClient;
  listing: ListingDetailData;
  storeHref: string | null;
}) {
  const result = await getMoreFromSellerListings(supabase, listing);
  return (
    <RelatedListings
      id="mas-del-vendedor"
      title={listing.seller_type === "store" ? "Más de esta tienda" : "Más de este vendedor"}
      link={storeHref ? { href: storeHref, label: "Ver la tienda" } : null}
      listings={result.listings}
    />
  );
}

// "N publicaciones" on the seller card: the seller's active publications today; left out when the count failed.
async function SellerInventory({
  supabase,
  listing,
}: {
  supabase: PublicSupabaseClient;
  listing: ListingDetailData;
}) {
  const { publishedCount } = await getMoreFromSellerListings(supabase, listing);
  return publishedCount === null ? null : <li>{listingCountLabel(publishedCount)}</li>;
}
