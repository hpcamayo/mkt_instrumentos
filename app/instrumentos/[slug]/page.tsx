import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ListingCard } from "@/components/listing-card";
import { ListingDetailGallery } from "@/components/listing-detail-gallery";
import { ListingDetailMetadata } from "@/components/listing-detail-metadata";
import { PageContainer } from "@/components/page-container";
import {
  getFullListingSpecs,
  getKeyListingSpecs,
  type ListingSpec,
} from "@/lib/listing-specs";
import {
  buildWhatsAppUrl,
  formatPrice,
  getCategoryLabel,
  getListingDisplayTitle,
  getSellerTypeLabel,
  normalizeStore,
  type ListingCardData,
  type ListingDetailData,
} from "@/lib/listings";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";

export const dynamic = "force-dynamic";

type ListingDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

type PublicSupabaseClient = NonNullable<
  ReturnType<typeof getPublicSupabaseClient>
>;

type ListingDetailViewData = {
  listing: ListingDetailData;
  similarListings: ListingCardData[];
  moreFromSellerListings: ListingCardData[];
  sellerPublishedCount: number | null;
};

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
  listing_photos (
    id,
    listing_id,
    image_url,
    alt_text,
    sort_order
  )
`;

export default async function ListingDetailPage({
  params,
}: ListingDetailPageProps) {
  const { slug } = await params;
  const supabase = getPublicSupabaseClient();

  if (!supabase) {
    return <SupabaseSetupMessage />;
  }

  const { data, error } = await supabase
    .from("listings")
    .select(
      `
        id,
        store_id,
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
        listing_photos (
          id,
          listing_id,
          image_url,
          alt_text,
          sort_order
        )
      `,
    )
    .eq("status", "approved")
    .eq("slug", slug)
    .order("sort_order", {
      foreignTable: "listing_photos",
      ascending: true,
    })
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const listing = data as ListingDetailData;
  const [{ listings: similarListings }, sellerListings] = await Promise.all([
    getSimilarListings(supabase, listing),
    getMoreFromSellerListings(supabase, listing),
  ]);

  return (
    <ListingDetail
      listing={listing}
      similarListings={similarListings}
      moreFromSellerListings={sellerListings.listings}
      sellerPublishedCount={sellerListings.publishedCount}
    />
  );
}

function ListingDetail({
  listing,
  similarListings,
  moreFromSellerListings,
  sellerPublishedCount,
}: ListingDetailViewData) {
  const store = normalizeStore(listing);
  const sellerName =
    listing.seller_type === "store" ? store?.name : listing.contact_name;
  const displayTitle = getListingDisplayTitle(listing);
  const sellerTypeLabel =
    listing.seller_type === "store" && store?.is_verified === true
      ? "Tienda verificada"
      : getSellerTypeLabel(listing.seller_type);
  const sellerLocation =
    listing.seller_type === "store"
      ? [store?.district, store?.city].filter(Boolean).join(", ") ||
        `${listing.city}, ${listing.region}`
      : `${listing.city}, ${listing.region}`;
  const keySpecs = getKeyListingSpecs(listing, sellerName);
  const fullSpecs = getFullListingSpecs(listing, sellerName);

  return (
    <PageContainer as="section" className="py-5 sm:py-6">
      <Breadcrumb listing={listing} displayTitle={displayTitle} />

      <div className="mt-4 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)] lg:items-start xl:gap-8">
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <ListingDetailGallery
            photos={listing.listing_photos}
            title={displayTitle}
          />
        </div>

        <aside className="min-w-0 space-y-5">
          <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
            <div className="flex flex-wrap gap-2">
              <SellerBadge label={sellerTypeLabel} isVerified={store?.is_verified === true} />
            </div>

            <h1 className="mt-4 text-2xl font-bold leading-tight text-ink sm:text-3xl">
              {displayTitle}
            </h1>
            {displayTitle !== listing.title ? (
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {listing.title}
              </p>
            ) : null}
            <p className="mt-4 text-3xl font-bold text-ink sm:text-4xl">
              {formatPrice(listing.price_pen)}
            </p>

            <ListingDetailMetadata
              listingId={listing.id}
              publishedAt={listing.published_at}
              createdAt={listing.created_at}
              initialViewCount={listing.view_count}
            />

            <KeySpecs specs={keySpecs} />

            <div className="mt-6 grid gap-3">
              <a
                href={buildWhatsAppUrl(listing)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Preguntar por WhatsApp
              </a>
              {listing.seller_type === "store" && store ? (
                <Link
                  href={`/tiendas/${store.slug}`}
                  className="inline-flex w-full items-center justify-center rounded-md border border-slate-300 px-4 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100"
                >
                  Ver página de la tienda
                </Link>
              ) : null}
            </div>

            <p className="mt-4 text-xs leading-5 text-slate-500">
              Contacto directo por WhatsApp. Laria no procesa pagos, envíos ni
              garantías.
            </p>
          </div>

          <SellerTrustBox
            sellerName={sellerName}
            sellerTypeLabel={sellerTypeLabel}
            sellerLocation={sellerLocation}
            listing={listing}
            sellerPublishedCount={sellerPublishedCount}
          />
        </aside>
      </div>

      <div className="mt-8 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)] xl:gap-8">
        <div className="min-w-0 space-y-6">
          <DetailSection title="Descripción">
            {listing.description ? (
              <p className="whitespace-pre-line text-sm leading-7 text-slate-600 sm:text-base">
                {listing.description}
              </p>
            ) : (
              <p className="text-sm leading-6 text-slate-500">
                Este listado aún no tiene descripción.
              </p>
            )}
          </DetailSection>

          <DetailSection title="Especificaciones completas">
            <SpecsList specs={fullSpecs} />
          </DetailSection>
        </div>

        <div className="min-w-0 space-y-6">
          <SellerAboutSection
            listing={listing}
            sellerName={sellerName}
            sellerTypeLabel={sellerTypeLabel}
            sellerLocation={sellerLocation}
            sellerPublishedCount={sellerPublishedCount}
          />
        </div>
      </div>

      <RelatedListingsSection
        title="Artículos similares"
        emptyMessage="Todavía no hay artículos similares publicados."
        listings={similarListings}
      />

      {moreFromSellerListings.length > 0 ? (
        <RelatedListingsSection
          title={
            listing.seller_type === "store"
              ? "Más de esta tienda"
              : "Más de este vendedor"
          }
          listings={moreFromSellerListings}
        />
      ) : null}
    </PageContainer>
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

  const { data: primaryData } = await primaryQuery;
  let listings = sortSimilarListings(
    (primaryData ?? []) as ListingCardData[],
    listing,
  ).slice(0, 4);

  if (listings.length < 4 && listing.brand) {
    const currentIds = new Set([listing.id, ...listings.map((item) => item.id)]);
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
      .limit(8);

    const brandListings = ((brandData ?? []) as ListingCardData[]).filter(
      (item) => !currentIds.has(item.id),
    );

    listings = [...listings, ...brandListings].slice(0, 4);
  }

  const photoCounts = await getListingPhotoCounts(
    supabase,
    listings.map((item) => item.id),
  );

  return {
    listings: listings.map((item) => ({
      ...item,
      photo_count: photoCounts.get(item.id) ?? item.listing_photos.length,
    })),
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
    .limit(4);
  const listings = (data ?? []) as ListingCardData[];
  const photoCounts = await getListingPhotoCounts(
    supabase,
    listings.map((item) => item.id),
  );

  return {
    listings: listings.map((item) => ({
      ...item,
      photo_count: photoCounts.get(item.id) ?? item.listing_photos.length,
    })),
    publishedCount: count === null ? null : count + 1,
  };
}

async function getListingPhotoCounts(
  supabase: PublicSupabaseClient,
  listingIds: string[],
) {
  const counts = new Map<string, number>();

  if (listingIds.length === 0) {
    return counts;
  }

  const { data } = await supabase
    .from("listing_photos")
    .select("listing_id")
    .in("listing_id", listingIds);

  for (const photo of data ?? []) {
    counts.set(photo.listing_id, (counts.get(photo.listing_id) ?? 0) + 1);
  }

  return counts;
}

function Breadcrumb({
  listing,
  displayTitle,
}: {
  listing: ListingDetailData;
  displayTitle: string;
}) {
  const categoryLabel = getCategoryLabel(listing.category);

  return (
    <nav aria-label="Ruta de navegación" className="text-sm leading-6 text-slate-500">
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link href="/" className="font-medium underline-offset-4 hover:text-ink hover:underline">
            Inicio
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <Link
            href={`/listados?category=${encodeURIComponent(listing.category)}`}
            className="font-medium underline-offset-4 hover:text-ink hover:underline"
          >
            {categoryLabel}
          </Link>
        </li>
        <li aria-hidden="true">/</li>
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
  return (
    <span
      className={
        isVerified
          ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
          : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
      }
    >
      {label}
    </span>
  );
}

function KeySpecs({ specs }: { specs: ListingSpec[] }) {
  return (
    <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4 border-y border-slate-200 py-5 text-sm">
      {specs.map((spec) => (
        <div key={spec.label} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {spec.label}
          </dt>
          <dd className="mt-1 break-words font-medium text-ink">{spec.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SellerTrustBox({
  sellerName,
  sellerTypeLabel,
  sellerLocation,
  listing,
  sellerPublishedCount,
}: {
  sellerName?: string | null;
  sellerTypeLabel: string;
  sellerLocation: string;
  listing: ListingDetailData;
  sellerPublishedCount: number | null;
}) {
  const store = normalizeStore(listing);
  const isStore = listing.seller_type === "store";
  const visibleSince =
    isStore && store?.created_at
      ? formatDate(store.created_at)
      : formatDate(listing.created_at);
  const publishedListingsLabel =
    sellerPublishedCount === null
      ? "No disponible"
      : `${sellerPublishedCount} ${
          sellerPublishedCount === 1 ? "listado activo" : "listados activos"
        }`;

  return (
    <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brass">
            {isStore ? "Sobre la tienda" : "Sobre el vendedor"}
          </p>
          <h2 className="mt-2 text-xl font-bold text-ink">
            {sellerName || "Vendedor particular"}
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {sellerTypeLabel}
          </p>
        </div>
        {store?.is_verified === true ? (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            Tienda verificada
          </span>
        ) : null}
      </div>

      {isStore && store?.description ? (
        <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">
          {store.description}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <TrustSignal label="Ubicación" value={sellerLocation || "No indicada"} />
        <TrustSignal label="Inventario" value={publishedListingsLabel} />
        <TrustSignal label="Visible desde" value={visibleSince} />
      </div>

      <div className="mt-5 grid gap-3">
        <a
          href={buildWhatsAppUrl(listing)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          {isStore ? "Escribir por WhatsApp" : "Contactar por WhatsApp"}
        </a>
        {isStore && store ? (
          <Link
            href={`/tiendas/${store.slug}`}
            className="inline-flex w-full items-center justify-center rounded-md border border-slate-300 px-4 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100"
          >
            Ver página de la tienda
          </Link>
        ) : null}
      </div>

      <p className="mt-5 rounded-md bg-amber-50 p-3 text-xs leading-5 text-amber-900 ring-1 ring-amber-100">
        Coordina por WhatsApp, revisa el instrumento cuando sea posible y evita
        adelantos si no conoces al vendedor. Laria no procesa pagos, envíos ni
        garantías.
      </p>
    </section>
  );
}

function SellerAboutSection({
  listing,
  sellerName,
  sellerTypeLabel,
  sellerLocation,
  sellerPublishedCount,
}: {
  listing: ListingDetailData;
  sellerName?: string | null;
  sellerTypeLabel: string;
  sellerLocation: string;
  sellerPublishedCount: number | null;
}) {
  const store = normalizeStore(listing);

  return (
    <DetailSection
      title={listing.seller_type === "store" ? "Sobre la tienda" : "Sobre el vendedor"}
    >
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-ink">
            {sellerName || "Vendedor particular"}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {sellerTypeLabel} · {sellerLocation || "Ubicación no indicada"}
          </p>
        </div>

        {store?.description ? (
          <p className="text-sm leading-6 text-slate-600">{store.description}</p>
        ) : (
          <p className="text-sm leading-6 text-slate-600">
            Este vendedor tiene información pública limitada. Coordina por
            WhatsApp y revisa el instrumento antes de cerrar una compra.
          </p>
        )}

        <div className="grid gap-3 text-sm">
          <InlineMetric
            label="Listados aprobados"
            value={
              sellerPublishedCount === null
                ? "No disponible"
                : String(sellerPublishedCount)
            }
          />
          <InlineMetric
            label="Contacto"
            value="Disponible por WhatsApp desde este listado"
          />
        </div>
      </div>
    </DetailSection>
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
    <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
      <h2 className="text-xl font-bold text-ink">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SpecsList({ specs }: { specs: ListingSpec[] }) {
  if (specs.length === 0) {
    return (
      <p className="text-sm leading-6 text-slate-500">
        No hay especificaciones disponibles para este listado.
      </p>
    );
  }

  return (
    <dl className="divide-y divide-slate-100 rounded-lg border border-slate-100 text-sm">
      {specs.map((spec) => (
        <div
          key={spec.label}
          className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(160px,0.42fr)_1fr] sm:gap-6"
        >
          <dt className="font-medium text-slate-500">
            {spec.label}
          </dt>
          <dd className="break-words font-semibold text-ink sm:text-right">{spec.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function InlineMetric({ label, value }: ListingSpec) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 max-w-[60%] break-words text-right font-medium text-ink">{value}</span>
    </div>
  );
}

function TrustSignal({ label, value }: ListingSpec) {
  return (
    <div className="rounded-md bg-mist p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold leading-5 text-ink">{value}</p>
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
        <h2 className="text-xl font-bold text-ink">{title}</h2>
      </div>
      {listings.length > 0 ? (
        <div className="grid grid-cols-1 gap-[18px] min-[460px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {listings.map((item) => (
            <ListingCard key={item.id} listing={item} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg bg-white p-5 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          {emptyMessage ?? "No hay artículos disponibles por ahora."}
        </div>
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
  return (
    <PageContainer as="section" className="py-8">
      <div className="max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
        <h1 className="text-xl font-bold text-ink">
          Configura Supabase para ver este instrumento
        </h1>
        <p className="mt-2">
          Falta definir `NEXT_PUBLIC_SUPABASE_URL` y
          `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local`. Agrega las
          credenciales públicas y reinicia el servidor de desarrollo.
        </p>
      </div>
    </PageContainer>
  );
}
