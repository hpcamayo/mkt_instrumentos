import Link from "next/link";
import { FavoriteButton } from "@/components/favorite-button";
import { ContentReport } from "@/components/content-report";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { cache, Suspense, type ReactNode } from "react";
import { ListingCard } from "@/components/listing-card";
import { CategoryLanding } from "@/components/category-landing";
import { JsonLd } from "@/components/json-ld";
import { ListingDetailGallery } from "@/components/listing-detail-gallery";
import { ListingDetailMetadata } from "@/components/listing-detail-metadata";
import { WhatsAppContactLink } from "@/components/whatsapp-contact-link";
import { PageContainer } from "@/components/page-container";
import { ReputationSummary } from "@/components/reputation-summary";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice, NoticeIcon, noticeClassName } from "@/components/ui/notice";
import { Price } from "@/components/ui/price";
import { StatusTag, Tag } from "@/components/ui/tag";
import { VerifiedMark } from "@/components/ui/verified-mark";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import {
  getFullListingSpecs,
  getKeyListingSpecs,
  type ListingSpec,
} from "@/lib/listing-specs";
import {
  buildWhatsAppUrl,
  getCategoryLabel,
  getListingDisplayTitle,
  getListingSecondaryTitle,
  getSellerTypeLabel,
  normalizeStore,
  parseListingFilters,
  resolveParticularSeller,
  type ListingCardData,
  type ListingDetailData,
} from "@/lib/listings";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getPublicSupabaseClient, warnMissingSupabaseEnv } from "@/lib/supabase/public-client";
import { parsePublicReputation, type PublicReputation } from "@/lib/transactions";
import { fetchCatalogPage } from "@/lib/catalog";
import {
  categoryLandingPath,
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
  const { data: reputationData } = reputationTarget
    ? await supabase.rpc("get_public_reputation", reputationTarget)
    : { data: null };
  return (
    <>
      <JsonLd data={buildListingJsonLd(listing)} />
      <ListingDetail listing={listing} supabase={supabase} reputation={parsePublicReputation(reputationData)} />
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
  const result = await loadCategoryPage(landing.category, page);
  if (!result.configured) return <SupabaseSetupMessage />;

  const redirectPage = getPageRedirect(page, result.count, result.error);
  if (redirectPage !== null) redirect(pageHref(path, {}, redirectPage));

  const searchReceipt = !result.error && page === 1 ? createSearchReceipt(filters, result.count ?? 0) : null;
  const searchState = searchEventMetadata(filters, result.count ?? 0);

  return (
    <CategoryLanding
      landing={landing}
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

function ListingDetail({
  listing,
  supabase,
  reputation,
}: {
  listing: ListingDetailData;
  supabase: PublicSupabaseClient;
  reputation: PublicReputation;
}) {
  const store = normalizeStore(listing);
  const particular = resolveParticularSeller(listing);
  const sellerName =
    listing.seller_type === "store" ? store?.name : particular.name;
  const displayTitle = getListingDisplayTitle(listing);
  const secondaryTitle = getListingSecondaryTitle(listing);
  const sellerTypeLabel =
    listing.seller_type === "store" && store?.is_verified === true
      ? "Tienda verificada"
      : getSellerTypeLabel(listing.seller_type);
  const sellerLocation =
    listing.seller_type === "store"
      ? [store?.district, store?.city].filter(Boolean).join(", ") ||
        `${listing.city}, ${listing.region}`
      : `${listing.city}, ${listing.region}`;
  const resolvedSellerLocation =
    listing.seller_type === "store"
      ? sellerLocation
      : [particular.city, particular.region].filter(Boolean).join(", ") ||
        sellerLocation;
  const keySpecs = getKeyListingSpecs(listing, sellerName);
  const fullSpecs = getFullListingSpecs(listing, sellerName);
  const isSold = listing.status === "sold";

  return (
    <section className="bg-canvas/70">
      <PageContainer className="py-6 sm:py-8">
        <Breadcrumb listing={listing} displayTitle={displayTitle} />
        {!isSold ? <div className="mt-3 flex justify-end"><FavoriteButton listingId={listing.id} /></div> : null}

        <div className="mt-4 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)] lg:items-start xl:gap-8">
          <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <ListingDetailGallery
              photos={listing.listing_photos}
              title={displayTitle}
            />
          </div>

          <aside className="min-w-0 space-y-5">
            <div className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
              <div className="flex flex-wrap gap-2">
                <SellerBadge
                  label={sellerTypeLabel}
                  isVerified={store?.is_verified === true}
                />
                {isSold ? (
                  <StatusTag domain="listing" status="sold" />
                ) : null}
              </div>

              <h1 className="mt-4 t-page text-ink">
                {displayTitle}
              </h1>
              {secondaryTitle ? (
                <p className="mt-2 t-ui text-ink-2">
                  {secondaryTitle}
                </p>
              ) : null}
              <p className="mt-5">
                <Price value={listing.price_pen} size="detail" />
              </p>

              <ListingDetailMetadata
                listingId={listing.id}
                publishedAt={listing.published_at}
                createdAt={listing.created_at}
                initialViewCount={listing.view_count}
                trackView={!isSold}
              />

              <KeySpecs specs={keySpecs} />

              {isSold ? (
                <p className="mt-6 rounded-panel bg-subtle p-4 t-ui font-semibold text-ink">
                  Este instrumento fue marcado como vendido y ya no está disponible para consultas de compra.
                </p>
              ) : (
                <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <WhatsAppContactLink
                    href={buildWhatsAppUrl(listing)}
                    listingId={listing.id}
                    className={buttonClasses({ block: true })}
                  >
                    <WhatsAppGlyph />
                    Contactar por WhatsApp
                  </WhatsAppContactLink>
                  {listing.seller_type === "store" && store ? (
                    <Link
                      href={`/tiendas/${store.slug}`}
                      className={buttonClasses({ variant: "secondary", block: true, className: "sm:w-auto" })}
                    >
                      Ver tienda
                    </Link>
                  ) : null}
                </div>
              )}

              <Notice tone="info" role="note" className="mt-4">
                Contacto directo por WhatsApp. Laria no procesa pagos, no retiene
                dinero, no gestiona envíos ni garantiza la transacción o el
                producto.{" "}
                <Link href="/consejos-de-seguridad" className="link font-semibold">
                  Consejos de seguridad
                </Link>
              </Notice>
              <div className="mt-3">
                <ContentReport
                  targetType="listing"
                  targetId={listing.id}
                  label="Reportar publicación"
                />
              </div>
            </div>

            <SellerTrustBox
              sellerName={sellerName}
              sellerTypeLabel={sellerTypeLabel}
              sellerLocation={resolvedSellerLocation}
              sellerVisibleSince={particular.createdAt ?? listing.created_at}
              listing={listing}
              isSold={isSold}
              sellerPublishedCount={
                <Suspense fallback="Cargando…">
                  <SellerInventory supabase={supabase} listing={listing} />
                </Suspense>
              }
            />

            <ReputationSummary reputation={reputation} title={`Reseñas de ${sellerName ?? "este vendedor"}`} />

            <DetailSection title="Descripción">
              {listing.description ? (
                <p className="max-w-[68ch] whitespace-pre-line t-body text-ink">
                  {listing.description}
                </p>
              ) : (
                <p className="t-body text-ink-2">
                  Esta publicación aún no tiene descripción.
                </p>
              )}
            </DetailSection>

            <DetailSection title="Especificaciones completas">
              <SpecsList specs={fullSpecs} />
            </DetailSection>
          </aside>
        </div>

        <Suspense
          fallback={
            <p className="py-6 t-ui text-ink-2">
              Cargando publicaciones similares…
            </p>
          }
        >
          <SimilarListings supabase={supabase} listing={listing} />
        </Suspense>
        <Suspense fallback={null}>
          <SellerListings supabase={supabase} listing={listing} />
        </Suspense>
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

function Breadcrumb({
  listing,
  displayTitle,
}: {
  listing: ListingDetailData;
  displayTitle: string;
}) {
  const categoryLabel = getCategoryLabel(listing.category);

  return (
    <nav
      aria-label="Ruta de navegación"
      className="rounded-panel border border-subtle bg-white px-4 py-3 t-ui font-semibold text-ink-2"
    >
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link
            href="/"
            className="underline-offset-4 hover:text-ink hover:underline hover:decoration-accent hover:decoration-2"
          >
            Inicio
          </Link>
        </li>
        <li aria-hidden="true" className="text-ink-3">
          /
        </li>
        <li>
          <Link
            href={categoryLandingPath(listing.category)}
            className="underline-offset-4 hover:text-ink hover:underline hover:decoration-accent hover:decoration-2"
          >
            {categoryLabel}
          </Link>
        </li>
        <li aria-hidden="true" className="text-ink-3">
          /
        </li>
        <li className="min-w-0 break-words text-ink">{displayTitle}</li>
      </ol>
    </nav>
  );
}

function SellerBadge({
  label,
  isVerified,
}: {
  label: string;
  isVerified: boolean;
}) {
  return isVerified ? <VerifiedMark /> : <Tag>{label}</Tag>;
}

function KeySpecs({ specs }: { specs: ListingSpec[] }) {
  return (
    <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4 border-y border-subtle py-5">
      {specs.map((spec) => (
        <div key={spec.label} className="min-w-0">
          <dt className="t-micro text-ink-2">
            {spec.label}
          </dt>
          <dd className="mt-1 break-words t-ui font-semibold text-ink">
            {spec.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SellerTrustBox({
  sellerName,
  sellerTypeLabel,
  sellerLocation,
  sellerVisibleSince,
  listing,
  isSold,
  sellerPublishedCount,
}: {
  sellerName?: string | null;
  sellerTypeLabel: string;
  sellerLocation: string;
  sellerVisibleSince: string;
  listing: ListingDetailData;
  isSold: boolean;
  sellerPublishedCount: ReactNode;
}) {
  const store = normalizeStore(listing);
  const isStore = listing.seller_type === "store";
  const visibleSince =
    isStore && store?.created_at
      ? formatDate(store.created_at)
      : formatDate(sellerVisibleSince);

  return (
    <section className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="t-micro text-ink-2">
            {isStore ? "Sobre la tienda" : "Sobre el vendedor"}
          </p>
          <h2 className="mt-2 t-section text-ink">
            {sellerName || "Particular"}
          </h2>
          <p className="mt-1 t-ui font-semibold text-ink-2">
            {sellerTypeLabel}
          </p>
        </div>
        {store?.is_verified === true ? (
          <VerifiedMark />
        ) : null}
      </div>

      {isStore && store?.description ? (
        <p className="mt-4 line-clamp-3 t-ui text-ink-2">
          {store.description}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <TrustSignal
          label="Ubicación"
          value={sellerLocation || "No indicada"}
        />
        <TrustSignal label="Publicaciones" value={sellerPublishedCount} />
        <TrustSignal label="Visible desde" value={visibleSince} />
      </div>

      <div className="mt-5 grid gap-3">
        {!isSold ? (
          <WhatsAppContactLink
            href={buildWhatsAppUrl(listing)}
            listingId={listing.id}
            source="seller_panel"
            className={buttonClasses({ block: true })}
          >
            <WhatsAppGlyph />
            Contactar por WhatsApp
          </WhatsAppContactLink>
        ) : null}
        {isStore && store ? (
          <Link
            href={`/tiendas/${store.slug}`}
            className={buttonClasses({ variant: "secondary", block: true })}
          >
            Ver página de la tienda
          </Link>
        ) : null}
      </div>

      <p className="mt-5 rounded-panel bg-canvas p-3 t-meta text-ink-2">
        {isSold
          ? "Este registro se conserva como historial. Laria no procesó ni garantizó la transacción."
          : "Coordina por WhatsApp, revisa el instrumento cuando sea posible y evita adelantos si no conoces al vendedor. Laria no procesa pagos, envíos ni garantías."}
      </p>
    </section>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
      <h2 className="t-section text-ink">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SpecsList({ specs }: { specs: ListingSpec[] }) {
  if (specs.length === 0) {
    return (
      <p className="t-ui text-ink-2">
        No hay especificaciones disponibles para esta publicación.
      </p>
    );
  }

  return (
    <dl className="divide-y divide-subtle rounded-panel border border-subtle t-ui">
      {specs.map((spec) => (
        <div
          key={spec.label}
          className="grid gap-1 px-4 py-3 transition even:bg-canvas/55 sm:grid-cols-[minmax(160px,0.42fr)_1fr] sm:gap-6"
        >
          <dt className="font-semibold text-ink-2">{spec.label}</dt>
          <dd className="break-words font-semibold text-ink sm:text-right">
            {spec.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TrustSignal({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-control border border-subtle bg-canvas p-3">
      <p className="t-micro text-ink-2">
        {label}
      </p>
      <p className="mt-1 t-ui font-semibold text-ink">{value}</p>
    </div>
  );
}

function RelatedListingsSection({
  title,
  emptyMessage,
  listings,
}: {
  title: string;
  emptyMessage?: string;
  listings: ListingCardData[];
}) {
  return (
    <section className="mt-8">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="t-section text-ink">{title}</h2>
      </div>
      {listings.length > 0 ? (
        <div className="grid grid-cols-1 gap-[18px] min-[460px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {listings.map((item) => (
            <ListingCard key={item.id} listing={item} source="recommendations" />
          ))}
        </div>
      ) : (
        <EmptyState headingLevel={3} title={emptyMessage ?? "No hay publicaciones disponibles por ahora"} />
      )}
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "No disponible";
  }

  return new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

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
}: {
  supabase: PublicSupabaseClient;
  listing: ListingDetailData;
}) {
  const result = await getSimilarListings(supabase, listing);
  return (
    <RelatedListingsSection
      title="Publicaciones similares"
      emptyMessage="Todavía no hay publicaciones similares"
      listings={result.listings}
    />
  );
}

async function SellerListings({
  supabase,
  listing,
}: {
  supabase: PublicSupabaseClient;
  listing: ListingDetailData;
}) {
  const result = await getMoreFromSellerListings(supabase, listing);
  return result.listings.length ? (
    <RelatedListingsSection
      title={
        listing.seller_type === "store"
          ? "Más de esta tienda"
          : "Más de este vendedor"
      }
      listings={result.listings}
    />
  ) : null;
}

async function SellerInventory({
  supabase,
  listing,
}: {
  supabase: PublicSupabaseClient;
  listing: ListingDetailData;
}) {
  const { publishedCount } = await getMoreFromSellerListings(supabase, listing);
  return publishedCount === null
    ? "No disponible"
    : `${publishedCount} ${publishedCount === 1 ? "publicación activa" : "publicaciones activas"}`;
}
