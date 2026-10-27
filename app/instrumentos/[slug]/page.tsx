import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CategoryLanding } from "@/components/category-landing";
import { ContentReport } from "@/components/content-report";
import { JsonLd } from "@/components/json-ld";
import { ContactModule } from "@/components/listing/contact-module";
import { StoreTermsLine } from "@/components/store-floor/store-terms";
import { TryoutEntry } from "@/components/store-floor/tryout-entry";
import { QuickQuestions, SignInHint } from "@/components/listing/contact-extras";
import { OwnerBar, RestockAlert, SimilarAlert } from "@/components/listing/listing-viewer";
import { ListingGallery } from "@/components/listing/listing-gallery";
import { RELATED_ROW_MAX, RelatedListings, RelatedListingsSkeleton } from "@/components/listing/related-listings";
import { ShareListing } from "@/components/listing/share-button";
import { ListingGuideLink } from "@/components/discovery/listing-guide-link";
import { ListingMarks } from "@/components/discovery/listing-marks";
import { ComboPanel } from "@/components/listing-details/combo";
import { CompanionList, type Companion } from "@/components/listing-details/companions";
import { ConditionExplainer } from "@/components/listing-details/condition-explainer";
import { SaleTermsSummary } from "@/components/listing-details/sale-terms-summary";
import { comboSellerKey, readBundleOffer, type BundleOffer } from "@/lib/combo";
import { answeredQuestionIds, PRICE_MODE_LABELS } from "@/lib/sale-terms";
import { whatsAppNumber } from "@/lib/seller-contact";
import { ListingRepairLine } from "@/components/services/service-entry-points";
import { ListingQuestions } from "@/components/listing/listing-questions";
import { ReputationSection } from "@/components/listing/reputation-section";
import { RatingFigure, SellerCard, sellerKindLabel, type SellerSummary } from "@/components/listing/seller-card";
import { SpecTable } from "@/components/listing/spec-table";
import { ListingProvenance, SellerTrust } from "@/components/trust/listing-trust";
import { SafeMeetup } from "@/components/trust/safe-meetup";
import { TrackRecordChip } from "@/components/trust/track-record-chip";
import { getListingTrust } from "@/lib/listing-trust";
import { guidePath, guidesForListing } from "@/lib/discovery/buying-guides";
import { publicStoreLocation } from "@/lib/store-storefront";
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
import { needsSafetySheet, quickQuestions, tradeQuestion } from "@/lib/contact-message";
import { isEntityId } from "@/lib/marketplace-event-payload";
import {
  DISCOVERABLE_STOCK_FILTER,
  buildWhatsAppUrl,
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
import { ListingSellingExtras } from "@/components/offers/listing-selling-extras";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { warnMissingSupabaseEnv, type getPublicSupabaseClient } from "@/lib/supabase/public-client";
import { getRequestReads, optionalReadSignal } from "@/lib/supabase/public-read-client";
import { READ_BUDGETS, budgetSignal } from "@/lib/request-deadline";
import { readPublicReputation, type PublicReputation } from "@/lib/transactions";
import {
  assistedCommerceEnabled,
  buildPurchaseWhatsAppUrl,
  installmentLine,
  readInstallmentOffer,
  readPurchaseRequest,
  type InstallmentOffer,
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
import { restockNote } from "@/lib/store-floor/arrivals";
import { ListingReachMarks } from "@/components/store-reach/listing-reach-marks";

export const dynamic = "force-dynamic";
// A hard stop well past the read budgets (lib/request-deadline.ts), far below Vercel's 300 s default.
export const maxDuration = 30;

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
// A failed read throws, so the visitor gets the "Algo salió mal · Reintentar" page (app/error.tsx), never a 404 that
// would say the listing does not exist.
const loadPublicListing = cache(async (slug: string) => {
  const { supabase, deadline } = getRequestReads();
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
        restock_expected_on,
        warranty_months,
        warranty_provider,
        returns_days,
        returns_note,
        installments_max,
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
        price_mode,
        delivery_pickup,
        pickup_area,
        can_try,
        lima_delivery,
        ships_provinces,
        shipping_carriers,
        shipping_payment,
        accepts_trades,
        trade_wants,
        trade_categories,
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
          created_at,
          public_address,
          opening_hours
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
    // The service-role client keeps postgrest-js's retries for its other callers; this public read opts out.
    .retry(false)
    .abortSignal(budgetSignal(deadline, READ_BUDGETS.coreMs))
    .maybeSingle()
    .returns<ListingDetailData>();

  if (error) throw new Error(`The listing could not be read: ${error.message}`);
  if (!data) return { configured: true as const, listing: null };

  if (data.status === "sold" && normalizeStore(data)?.status && normalizeStore(data)?.status !== "active") {
    return { configured: true as const, listing: null };
  }
  if (data.status === "approved") {
    const { data: isPublic, error: publicError } = await supabase.rpc("listing_is_public", {
      p_listing_id: data.id,
    });
    if (publicError) throw new Error(`The listing could not be checked: ${publicError.message}`);
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

  const { supabase } = getRequestReads();
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
  const [reputationResult, reviewPageResult, factsResult, purchase, combo, installments] = await Promise.all([
    reputationTarget ? supabase.rpc("get_public_reputation", reputationTarget) : null,
    reviewSubject
      ? supabase.rpc("get_public_review_page", { p_subject_user_id: reviewSubject.user, p_subject_store_id: reviewSubject.store, p_offset: 0, p_limit: 1 })
      : null,
    supabase.rpc("get_public_seller_facts", { p_listing_id: listing.id }),
    loadPurchaseRequest(supabase, listing),
    loadListingCombo(supabase, listing),
    loadInstallments(supabase, listing),
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
        combo={combo}
        installments={purchase ? installments : null}
      />
    </>
  );
}

// buy-01: the seller's declared combo discount and, for a store, what it attaches to this listing. Both are optional
// extras: a failed read leaves them out.
async function loadListingCombo(supabase: PublicSupabaseClient, listing: ListingDetailData): Promise<{ offer: BundleOffer | null; companions: Companion[] }> {
  if (listing.status !== "approved") return { offer: null, companions: [] };
  const offerQuery = supabase.from("seller_bundle_offers").select("discount_percent,min_items");
  const [offerResult, companionResult] = await Promise.all([
    listing.store_id
      ? offerQuery.eq("store_id", listing.store_id).maybeSingle()
      : listing.owner_user_id ? offerQuery.eq("owner_user_id", listing.owner_user_id).maybeSingle() : null,
    listing.store_id
      ? supabase
        .from("listing_companions")
        .select("sort_order, companion:listings!listing_companions_companion_id_fkey(id,title,slug,price_pen,stock_state,listing_photos(image_url,alt_text,sort_order))")
        .eq("listing_id", listing.id)
        .order("sort_order")
        .abortSignal(optionalReadSignal(getRequestReads().deadline))
      : null,
  ]);
  const offer = offerResult && !offerResult.error ? readBundleOffer(offerResult.data) : null;
  type CompanionRow = { companion: { id: string; title: string; slug: string; price_pen: number | null; stock_state: string | null; listing_photos: { image_url: string; alt_text: string | null; sort_order: number }[] | null } | null };
  const companions = companionResult && !companionResult.error
    ? ((companionResult.data ?? []) as unknown as CompanionRow[]).flatMap(({ companion }) => {
      if (!companion || companion.stock_state === "out_of_stock") return [];
      const photo = [...(companion.listing_photos ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0];
      return [{ id: companion.id, title: companion.title, slug: companion.slug, price_pen: companion.price_pen, photo: photo ? { url: photo.image_url, alt: photo.alt_text } : null }];
    })
    : [];
  return { offer, companions };
}

async function findListingSlug(id: string) {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  const { data } = await client.from("listings").select("slug").eq("id", id).in("status", ["approved", "sold"])
    .retry(false)
    .abortSignal(budgetSignal(getRequestReads().deadline, READ_BUDGETS.coreMs))
    .maybeSingle();
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

// store-floor, buy-09: the store's interest-free installments, read live (the listing's installments_max only says
// whether to ask). Shown with "Solicitar compra", so under the same conditions; a failed call shows none.
async function loadInstallments(supabase: PublicSupabaseClient, listing: ListingDetailData): Promise<InstallmentOffer | null> {
  if (!assistedCommerceEnabled() || !listing.installments_max || !listing.store_id || listing.status !== "approved"
    || listing.seller_type !== "store" || isOutOfStock(listing)) {
    return null;
  }
  const { data, error } = await (supabase as unknown as SupabaseClient).rpc("get_store_installment_offer", { p_store_id: listing.store_id });
  const offer = error ? null : readInstallmentOffer(data);
  return offer && (!offer.minPricePen || (listing.price_pen ?? 0) >= offer.minPricePen) ? offer : null;
}

const loadCategoryPage = cache(async (category: string, page: number) => {
  const { supabase } = getRequestReads();
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
  const [result, catalogBrands] = await Promise.all([loadCategoryPage(landing.category, page), getCatalogBrandsByCategory(optionalReadSignal(getRequestReads().deadline))]);
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
  combo,
  installments,
}: {
  listing: ListingDetailData;
  supabase: PublicSupabaseClient;
  reputation: PublicReputation | null;
  breakdown: ReviewPage["breakdown"] | null;
  reviewSubject: { user?: string; store?: string } | null;
  facts: SellerFacts | null;
  purchase: PurchaseRequest | null;
  combo: { offer: BundleOffer | null; companions: Companion[] };
  installments: InstallmentOffer | null;
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
  // sell-07, talk-02, sell-06: the price mode beside the price; quick questions the listing already answers are left
  // out, and a listing that takes trades adds "Te propongo un cambio".
  const priceMode = listing.price_mode === "fixed" || listing.price_mode === "negotiable" ? listing.price_mode : null;
  const answered = answeredQuestionIds(listing);
  const questions = [
    ...quickQuestions(listing.seller_type).filter((question) => !answered.includes(question.id)),
    ...(listing.accepts_trades ? [tradeQuestion(listing.seller_type)] : []),
  ];
  // buy-01: the combo is per seller; a listing without units cannot go into one.
  const sellerKey = comboSellerKey(listing);
  const comboSeller = sellerKey && !outOfStock ? { key: sellerKey, name: seller.name, type: listing.seller_type } : null;
  // deal-trust (safe-03): the meetup sheet links the type's try-out checklist (discovery's guides) when there is one.
  const tryOutGuide = isStore ? undefined : guidesForListing(listing.category, listing.instrument_type).find((guide) => guide.kind === "revisar");
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
              {/* discovery batch (disc-04, disc-05): Hecho a mano, a pedido, equipo de artista */}
              <Suspense fallback={null}><ListingMarks listingId={listing.id} /></Suspense>
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <Price value={listing.price_pen} previous={visiblePreviousPrice(listing, now)} size="detail" />
                {/* sell-07: the seller's word on the price. */}
                {priceMode && listing.price_pen !== null ? <Tag tone="line">{PRICE_MODE_LABELS[priceMode]}</Tag> : null}
                {outOfStock ? <StatusTag domain="stock" status={listing.restock_expected_on ? "restock_expected" : "out_of_stock"} /> : null}
              </p>
              {/* store-floor, buy-09: the store's interest-free installments on this price. */}
              {installments ? <p className="mt-1 t-ui font-semibold text-ink">{installmentLine(listing.price_pen, installments.maxInstallments)}</p> : null}
              {outOfStock ? (
                <p className="mt-2 t-ui text-ink-2">
                  {/* store-floor, reach-08: "Por llegar" with the store's estimated date. */}
                  {restockNote(listing.restock_expected_on)}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                {/* sell-10: tap the condition to read what it means on the scale. */}
                {listing.condition ? <ConditionExplainer condition={listing.condition} className="order-last" /> : null}
                <ListingDetailMetadata listingId={listing.id} trackView={!isSold}>
                  {place} · {formatPublishedAgo(published, now)}{updated ? ` · ${updated}` : ""}
                </ListingDetailMetadata>
              </div>
              {/* store-floor, reach-09: the store's warranty and returns. */}
              {isStore && !isSold ? <StoreTermsLine terms={listing} storeName={store?.name ?? null} className="mt-3" /> : null}
              {isSold ? null : <ListingReachMarks listing={listing} />}{/* Feature ideas, store-reach batch (reach-04, reach-05). */}
              {/* A seller's recent "sigue disponible" (my listings check-ins) answers the quiet-listing note (list-04). */}
              {availabilityConfirmed ? (
                <p className="mt-1 t-meta">Quien vende confirmó que sigue disponible el {availabilityConfirmed}.</p>
              ) : quiet ? (
                <p className="mt-2 t-meta">Esta publicación tiene un tiempo: consulta si sigue disponible.</p>
              ) : null}
              {isSold ? null : <SaleTermsSummary terms={listing} className="mt-5" />}
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
                {outOfStock ? <RestockAlert listingId={listing.id} arriving={Boolean(listing.restock_expected_on)} className="order-3 lg:order-2" /> : null}
                <div className="order-3 grid gap-3 lg:order-2">
                  {purchase ? null : <QuickQuestions listingId={listing.id} questions={questions} />}
                  <TrackRecordChip listingId={listing.id} />
                  <SignInHint />
                </div>
                <ContactModule
                  listingId={listing.id}
                  href={contactHref}
                  purchase={Boolean(purchase)}
                  maxQuantity={purchase?.maxQuantity}
                  safety={needsSafetySheet(listing.price_pen, Boolean(purchase))}
                  className="order-3 lg:order-3"
                />
                {/* store-floor, buy-07: "Reservar una prueba" when the store takes try-outs. */}
                {isStore && store && listing.store_id && !outOfStock ? (
                  <Suspense fallback={null}>
                    <TryoutEntry supabase={supabase} storeId={listing.store_id} storeName={store.name} listingId={listing.id} className="order-3 lg:order-3" />
                  </Suspense>
                ) : null}
                <ListingSellingExtras listingId={listing.id} title={displayTitle} contactHref={contactHref} className="order-3 lg:order-3" />
                <ShareListing
                  url={absoluteUrl(`/instrumentos/${listing.slug}`)}
                  title={listing.title}
                  priceLabel={listing.price_pen !== null ? formatPrice(listing.price_pen) : null}
                  storyImageUrl={`/instrumentos/${listing.slug}/historia`}
                  variant="module"
                  className="order-5 lg:order-3"
                />
                {comboSeller && !purchase ? (
                  <ComboPanel
                    seller={comboSeller}
                    item={{ id: listing.id, title: listing.title, slug: listing.slug, price_pen: listing.price_pen }}
                    offer={combo.offer}
                    whatsappNumber={whatsAppNumber(resolveContactPhone(listing))}
                    className="order-5 lg:order-3"
                  />
                ) : null}
                {isStore ? null : (
                  <SafeMeetup
                    title={displayTitle}
                    url={absoluteUrl(`/instrumentos/${listing.slug}`)}
                    sellerFirstName={particular.name?.trim().split(/\s+/)[0] || null}
                    city={listing.city}
                    region={listing.region}
                    tryOutHref={tryOutGuide ? guidePath(tryOutGuide.slug) : undefined}
                    className="order-5 lg:order-3"
                  />
                )}
              </>
            )}
            <div className="order-3 empty:hidden lg:order-3"><PurchaseCheckin listingId={listing.id} /></div>

            <a href="#vendedor" className="order-4 -my-1 flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 rounded-control py-1 lg:hidden">
              <span className="t-ui font-semibold text-ink underline decoration-line-deco underline-offset-[3px]">{seller.name}</span>
              <span className="t-meta">{sellerKindLabel(seller.kind)}</span>
              {seller.rating ? <span className="t-meta"><RatingFigure rating={seller.rating} /></span> : null}
            </a>

            {purchase ? <AcceptedPaymentMethods methods={purchase.methods} installments={installments} className="order-6 lg:order-4" /> : null}

            <SellerCard
              seller={seller}
              visit={isStore && store ? publicStoreLocation(store) : undefined}
              sold={isSold}
              now={now}
              className="order-9 lg:order-5"
              trust={<Suspense fallback={null}><SellerTrust listingId={listing.id} /></Suspense>}
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
            <Suspense fallback={null}><ListingProvenance listingId={listing.id} className="order-7 min-w-0" /></Suspense>

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

            {isSold ? null : <CompanionList companions={combo.companions} seller={comboSeller} className="order-8" />}

            {/* discovery batch (disc-02): the buying guide and try-out checklist for this kind of instrument */}
            {isSold ? null : <ListingGuideLink category={listing.category} instrumentType={listing.instrument_type} className="order-8 min-w-0" />}

            {/* feature-ideas services (bet-02): one quiet line to the repair shops on worn or broken gear */}
            <Suspense fallback={null}><ListingRepairLine condition={listing.condition} sold={isSold} className="order-8 min-w-0" /></Suspense>

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
  // deal-trust (sell-09): a Particular's strip links to their seller page when they have one.
  const sellerPageSlug = storeHref ? null : (await getListingTrust(listing.id))?.sellerPageSlug ?? null;
  return (
    <RelatedListings
      id="mas-del-vendedor"
      title={listing.seller_type === "store" ? "Más de esta tienda" : "Más de este vendedor"}
      link={storeHref ? { href: storeHref, label: "Ver la tienda" } : sellerPageSlug ? { href: `/vendedores/${sellerPageSlug}`, label: "Ver perfil" } : null}
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
