import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CategoryLanding } from "@/components/category-landing";
import { ContentReport } from "@/components/content-report";
import { JsonLd } from "@/components/json-ld";
import { ContactModule } from "@/components/listing/contact-module";
import { QuickQuestions, SignInHint } from "@/components/listing/contact-extras";
import { OwnerBar, RestockAlert, SimilarAlert } from "@/components/listing/listing-viewer";
import { ListingGallery } from "@/components/listing/listing-gallery";
import { RELATED_ROW_MAX, RelatedListings, RelatedListingsSkeleton } from "@/components/listing/related-listings";
import { ShareListing } from "@/components/listing/share-button";
import { ListingQuestions } from "@/components/listing/listing-questions";
import { ReputationSection } from "@/components/listing/reputation-section";
import { RatingFigure, SellerCard, sellerKindLabel, type SellerSummary } from "@/components/listing/seller-card";
import { SpecTable } from "@/components/listing/spec-table";
import { ListingDetailMetadata } from "@/components/listing-detail-metadata";
import { AcceptedPaymentMethods } from "@/components/payment/accepted-payment-methods";
import { PageContainer } from "@/components/page-container";
import { PurchaseCheckin } from "@/components/purchase-checkin";
import { StripCurrent } from "@/components/strip-current";
import { NoticeIcon, noticeClassName } from "@/components/ui/notice";
import { Price } from "@/components/ui/price";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusTag, Tag } from "@/components/ui/tag";
import { getSpecStrip, getSpecTable } from "@/lib/listing-specs";
import {
  formatMonthYear,
  formatPublishedAgo,
  formatUpdatedAgo,
  isQuietListing,
  keySpecLine,
  listingCountLabel,
  rankSimilarListings,
  readReviewPage,
  readSellerFacts,
  visiblePreviousPrice,
  type ReviewPage,
  type SellerFacts,
} from "@/lib/listing-page";
import { needsSafetySheet, quickQuestions } from "@/lib/contact-message";
import { isEntityId } from "@/lib/marketplace-event-payload";
import {
  DISCOVERABLE_STOCK_FILTER,
  buildWhatsAppUrl,
  getConditionLabel,
  getListingDisplayTitle,
  getListingSecondaryTitle,
  isOutOfStock,
  normalizeStore,
  parseListingFilters,
  resolveContactPhone,
  resolveParticularSeller,
  type ListingCardData,
  type ListingDetailData,
} from "@/lib/listings";
import { ListingSoundClip } from "@/components/selling/listing-sound-clip";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getPublicSupabaseClient, warnMissingSupabaseEnv } from "@/lib/supabase/public-client";
import { readPublicReputation, type PublicReputation } from "@/lib/transactions";
import {
  assistedCommerceEnabled,
  buildPurchaseWhatsAppUrl,
  readPurchaseRequest,
  type PurchaseRequest,
} from "@/lib/payment-methods";
import { fetchCatalogPage } from "@/lib/catalog";
import { getCatalogBrandsByCategory } from "@/lib/catalog-brands";
import {
  categoryLandingPath,
  categoryTypePath,
  getCategoryLandingBySlug,
  legacyCategoryRedirect,
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
import { formatPrice } from "@/lib/price";
import { absoluteUrl, NOINDEX_FOLLOW_ROBOTS, NOINDEX_ROBOTS } from "@/lib/site";

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
  previous_price_pen,
  price_dropped_at,
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
        stock_state,
        paused_until,
        availability_confirmed_at,
        sold_at,
        content_changed_at,
        previous_price_pen,
        price_dropped_at,
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
  // A retired category landing only redirects (below); it has no metadata of its own.
  if (legacyCategoryRedirect(slug)) return { robots: NOINDEX_FOLLOW_ROBOTS };
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
  const moved = legacyCategoryRedirect(slug);
  if (moved) permanentRedirect(moved);
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
    // A notification links to /instrumentos/<listing id> (questions, restock): send it to the listing's address.
    const moved = isEntityId(slug) ? await findListingSlug(slug) : null;
    if (moved) redirect(`/instrumentos/${moved}`);
    notFound();
  }

  const reputationTarget = listing.store_id
    ? { p_subject_store_id: listing.store_id, p_limit: 5 }
    : listing.owner_user_id
      ? { p_subject_user_id: listing.owner_user_id, p_limit: 5 }
      : null;
  const reviewSubject = listing.store_id
    ? { store: listing.store_id }
    : listing.owner_user_id
      ? { user: listing.owner_user_id }
      : null;
  // fast-01: every call the page waits for runs at once. A failed reputation call leaves the reviews (and the rating
  // figure) out instead of claiming there are none; failed facts or breakdown leave only those parts out.
  const [reputationResult, reviewPageResult, factsResult, purchase] = await Promise.all([
    reputationTarget ? supabase.rpc("get_public_reputation", reputationTarget) : null,
    reviewSubject
      ? supabase.rpc("get_public_review_page", { p_subject_user_id: reviewSubject.user, p_subject_store_id: reviewSubject.store, p_offset: 0, p_limit: 1 })
      : null,
    supabase.rpc("get_public_seller_facts", { p_listing_id: listing.id }),
    loadPurchaseRequest(supabase, listing),
  ]);
  const reputation = reputationResult && !reputationResult.error ? readPublicReputation(reputationResult.data) : null;
  const reviewPage = reviewPageResult && !reviewPageResult.error ? readReviewPage(reviewPageResult.data) : null;
  const facts = factsResult.error ? null : readSellerFacts(factsResult.data);
  return (
    <>
      <JsonLd data={buildListingJsonLd(listing)} />
      <ListingDetail
        listing={listing}
        supabase={supabase}
        reputation={reputation}
        breakdown={reviewPage?.breakdown ?? null}
        reviewSubject={reviewSubject}
        facts={facts}
        purchase={purchase}
      />
    </>
  );
}

async function findListingSlug(id: string) {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  const { data } = await client.from("listings").select("slug").eq("id", id).in("status", ["approved", "sold"]).maybeSingle();
  return data?.slug && data.slug !== id ? data.slug : null;
}

// PAY-1 (design §11.1): "Solicitar compra" and the accepted payment methods, only while the pilot is on, the listing has
// units and its verified store shows at least one approved method. A failed call leaves the ordinary contact.
async function loadPurchaseRequest(supabase: PublicSupabaseClient, listing: ListingDetailData): Promise<PurchaseRequest | null> {
  if (!assistedCommerceEnabled() || listing.status !== "approved" || listing.seller_type !== "store" || isOutOfStock(listing)) {
    return null;
  }
  const { data, error } = await supabase.rpc("get_listing_purchase_request", { p_listing_id: listing.id });
  return error ? null : readPurchaseRequest(data);
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
// the gallery, "Especificaciones", "Descripción", the questions and the reviews on the left (7 of 12); the decision
// column on the right (identity, the quick questions, the contact module, the seller card, "Reportar publicación").
// Below 1024 px one column, in the brief's order: the column wrappers become `contents` and each block takes its
// `order`; the contact module becomes the bar at the bottom of the screen. Nothing is sticky.
// Effortless Laria (docs/ux-effortless/listing.md): the key specs in one line under the title (list-03, replacing the
// spec strip), dates people say (list-04), a real price drop (list-05), the one limitation line (list-02, the trust
// note is gone), quick questions and the visitor hint (talk-02, talk-05), the seller's facts (list-10, trust-03), every
// review (list-06), "Avísame" (list-11), the owner's shortcuts (mine-05) and eight similar listings (list-07).
function ListingDetail({
  listing,
  supabase,
  reputation,
  breakdown,
  reviewSubject,
  facts,
  purchase,
}: {
  listing: ListingDetailData;
  supabase: PublicSupabaseClient;
  reputation: PublicReputation | null;
  breakdown: ReviewPage["breakdown"] | null;
  reviewSubject: { user?: string; store?: string } | null;
  facts: SellerFacts | null;
  purchase: PurchaseRequest | null;
}) {
  const now = Date.now();
  const store = normalizeStore(listing);
  const particular = resolveParticularSeller(listing);
  const isStore = listing.seller_type === "store";
  const displayTitle = getListingDisplayTitle(listing);
  const secondaryTitle = getListingSecondaryTitle(listing);
  const isSold = listing.status === "sold";
  const outOfStock = !isSold && isOutOfStock(listing);
  // mine-08: a recent "Sí, sigue disponible" is shown; the first publication date never changes.
  const confirmedAt = listing.availability_confirmed_at ? Date.parse(listing.availability_confirmed_at) : NaN;
  const availabilityConfirmed = !isSold && Number.isFinite(confirmedAt) && Date.now() - confirmedAt < 30 * 24 * 60 * 60 * 1000
    ? new Date(confirmedAt).toLocaleDateString("es-PE", { day: "numeric", month: "long", timeZone: "America/Lima" })
    : null;
  const paused = !isSold && listing.paused_until && listing.paused_until > new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }) ? listing.paused_until : null;
  const place = `${listing.city}, ${listing.region}`;
  const published = listing.published_at ?? listing.created_at;
  const updated = formatUpdatedAgo(listing.content_changed_at, published, now);
  const quiet = !isSold && !outOfStock && isQuietListing(published, listing.content_changed_at, now);
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
    facts,
  };
  const specLine = keySpecLine(getSpecStrip(listing, 5));
  const contactHref = purchase ? buildPurchaseWhatsAppUrl(resolveContactPhone(listing), listing, purchase.sku) : buildWhatsAppUrl(listing);
  const typeHref = listing.instrument_type
    ? categoryTypePath(listing.category, listing.instrument_type)
    : categoryLandingPath(listing.category);
  const alertFilters = {
    category: listing.category,
    ...(listing.instrument_type ? { instrument_type: listing.instrument_type } : {}),
    ...(listing.brand?.trim() ? { brand: listing.brand.trim() } : {}),
  };

  return (
    <section className="bg-surface">
      <StripCurrent value={listing.category} />
      <PageContainer className="pb-10 pt-3 md:pt-5 lg:pb-14">
        <Breadcrumbs items={listingBreadcrumbs(listing, displayTitle)} phoneBackLink />

        <OwnerBar listingId={listing.id} sold={isSold} className="mt-2 md:mt-3" />

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
              {specLine ? <p className="mt-1 t-ui font-semibold text-ink">{specLine}</p> : null}
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <Price value={listing.price_pen} previous={visiblePreviousPrice(listing, now)} size="detail" />
                {outOfStock ? <StatusTag domain="stock" status="out_of_stock" /> : null}
              </p>
              {outOfStock ? (
                <p className="mt-2 t-ui text-ink-2">
                  Sin unidades disponibles por ahora. Te avisamos cuando vuelva, o consulta a la tienda.
                </p>
              ) : null}
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                {listing.condition ? <Tag>{getConditionLabel(listing.condition)}</Tag> : null}
                <ListingDetailMetadata listingId={listing.id} trackView={!isSold}>
                  {place} · {formatPublishedAgo(published, now)}{updated ? ` · ${updated}` : ""}
                </ListingDetailMetadata>
              </p>
              {/* A seller's recent "sigue disponible" (my listings check-ins) answers the quiet-listing note (list-04). */}
              {availabilityConfirmed ? (
                <p className="mt-1 t-meta">Quien vende confirmó que sigue disponible el {availabilityConfirmed}.</p>
              ) : quiet ? (
                <p className="mt-2 t-meta">Esta publicación tiene un tiempo: consulta si sigue disponible.</p>
              ) : null}
            </div>

            {isSold ? (
              <div className="order-3 grid gap-3 rounded-panel bg-canvas p-4 lg:order-3">
                <p className="t-ui font-semibold text-ink">
                  Este instrumento fue marcado como vendido y ya no está disponible para consultas de compra.
                </p>
                <SimilarAlert filters={alertFilters} />
                <Link href="#similares" className="link w-fit t-ui font-semibold">Ver publicaciones similares</Link>
              </div>
            ) : paused ? (
              // mine-12 (ux my-listings): the seller is away; contact returns on the date they set.
              <div className="order-3 grid gap-1 rounded-panel bg-canvas p-4 lg:order-3">
                <p className="t-ui font-semibold text-ink">Vuelve el {formatPausedUntil(paused)}</p>
                <p className="t-ui text-ink-2">Quien vende pausó sus publicaciones y no está respondiendo mensajes hasta esa fecha.</p>
              </div>
            ) : (
              <>
                {outOfStock ? <RestockAlert listingId={listing.id} className="order-3 lg:order-2" /> : null}
                <div className="order-3 grid gap-3 lg:order-2">
                  {purchase ? null : <QuickQuestions listingId={listing.id} questions={quickQuestions(listing.seller_type)} />}
                  <SignInHint />
                </div>
                <ContactModule
                  listingId={listing.id}
                  href={contactHref}
                  purchase={Boolean(purchase)}
                  safety={needsSafetySheet(listing.price_pen, Boolean(purchase))}
                  className="order-3 lg:order-3"
                />
                <ShareListing
                  url={absoluteUrl(`/instrumentos/${listing.slug}`)}
                  title={listing.title}
                  priceLabel={listing.price_pen !== null ? formatPrice(listing.price_pen) : null}
                  storyImageUrl={`/instrumentos/${listing.slug}/historia`}
                  variant="module"
                  className="order-5 lg:order-3"
                />
              </>
            )}
            <div className="order-3 empty:hidden lg:order-3"><PurchaseCheckin listingId={listing.id} /></div>

            <a href="#vendedor" className="order-4 -my-1 flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 rounded-control py-1 lg:hidden">
              <span className="t-ui font-semibold text-ink underline decoration-line-deco underline-offset-[3px]">{seller.name}</span>
              <span className="t-meta">{sellerKindLabel(seller.kind)}</span>
              {seller.rating ? <span className="t-meta"><RatingFigure rating={seller.rating} /></span> : null}
            </a>

            {purchase ? <AcceptedPaymentMethods methods={purchase.methods} className="order-6 lg:order-4" /> : null}

            <SellerCard
              seller={seller}
              sold={isSold}
              now={now}
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

            <ListingSoundClip listingId={listing.id} />

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

            <div className="order-11 min-w-0">
              <ListingQuestions
                listingId={listing.id}
                sold={isSold}
                loginHref={`/login?next=${encodeURIComponent(`/instrumentos/${listing.slug}#preguntas`)}`}
              />
            </div>

            <ReputationSection
              reputation={reputation}
              title={`Reseñas de ${seller.name}`}
              breakdown={breakdown}
              subject={reviewSubject}
              className="order-12 min-w-0"
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

// "Publicaciones similares" (list-07): candidates of the same type (or category), plus the same brand in the category
// when that is thin, ranked by brand, a price within 30% and the city (lib/listing-page.ts). Eight at most.
async function getSimilarListings(
  supabase: PublicSupabaseClient,
  listing: ListingDetailData,
) {
  const primaryFilterColumn = listing.instrument_type ? "instrument_type" : "category";
  const primaryFilterValue = listing.instrument_type ?? listing.category;
  const base = () =>
    supabase
      .from("listings")
      .select(relatedListingSelect)
      .eq("status", "approved")
      .or(DISCOVERABLE_STOCK_FILTER)
      .neq("id", listing.id)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("sort_order", { foreignTable: "listing_photos", ascending: true })
      .limit(1, { foreignTable: "listing_photos" });

  const [primary, brand] = await Promise.all([
    base().eq(primaryFilterColumn, primaryFilterValue).limit(40).returns<ListingCardData[]>(),
    listing.brand ? base().eq("category", listing.category).ilike("brand", listing.brand).limit(16).returns<ListingCardData[]>() : null,
  ]);
  const candidates = [...((primary.data ?? []) as ListingCardData[]), ...((brand?.data ?? []) as ListingCardData[])];
  return { listings: rankSimilarListings(candidates, listing, RELATED_ROW_MAX) };
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
      .or(DISCOVERABLE_STOCK_FILTER)
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
      layout="row"
      emptyText={listing.status === "sold" ? "Ahora no hay otras publicaciones de este tipo." : undefined}
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

function formatPausedUntil(isoDate: string) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
