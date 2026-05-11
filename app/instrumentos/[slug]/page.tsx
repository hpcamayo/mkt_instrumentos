import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ListingCard } from "@/components/listing-card";
import { ListingDetailMetadata } from "@/components/listing-detail-metadata";
import { PageContainer } from "@/components/page-container";
import {
  getInstrumentFilterGroup,
  type InstrumentFilterConfig,
} from "@/lib/instrument-filters";
import {
  buildWhatsAppUrl,
  formatPrice,
  getCategoryLabel,
  getListingDisplayTitle,
  getSellerTypeLabel,
  normalizeStore,
  type ListingAttributes,
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

type DetailSpec = {
  label: string;
  value: string;
};

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
  const keySpecs = getKeySpecs(listing, sellerName);
  const fullSpecs = getFullSpecs(listing, sellerName);

  return (
    <PageContainer as="section" className="py-5 sm:py-6">
      <Breadcrumb listing={listing} displayTitle={displayTitle} />

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)] lg:items-start xl:gap-8">
        <ListingGallery listing={listing} />

        <aside className="space-y-5 lg:sticky lg:top-6">
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

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)] xl:gap-8">
        <div className="space-y-6">
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

        <div className="space-y-6">
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

      <RelatedListingsSection
        title={
          listing.seller_type === "store"
            ? "Más de esta tienda"
            : "Más de este vendedor"
        }
        emptyMessage={
          listing.seller_type === "store"
            ? "Esta tienda no tiene otros artículos aprobados por ahora."
            : "Este vendedor no tiene otros artículos aprobados por ahora."
        }
        listings={moreFromSellerListings}
      />
    </PageContainer>
  );
}

async function getSimilarListings(
  supabase: PublicSupabaseClient,
  listing: ListingDetailData,
) {
  let query = supabase
    .from("listings")
    .select(relatedListingSelect)
    .eq("status", "approved")
    .neq("id", listing.id);

  if (listing.instrument_type) {
    query = query.eq("instrument_type", listing.instrument_type);
  } else {
    query = query.eq("category", listing.category);
  }

  query = query
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("sort_order", {
      foreignTable: "listing_photos",
      ascending: true,
    })
    .limit(1, { foreignTable: "listing_photos" })
    .limit(4);

  const { data } = await query;
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
  };
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
    <nav aria-label="Ruta de navegación" className="text-sm text-slate-500">
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
        <li className="min-w-0 truncate text-ink">{displayTitle}</li>
      </ol>
    </nav>
  );
}

function ListingGallery({ listing }: { listing: ListingDetailData }) {
  const photos = listing.listing_photos;
  const primaryPhoto = photos[0];

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        {primaryPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primaryPhoto.image_url}
            alt={primaryPhoto.alt_text ?? listing.title}
            className="aspect-[4/3] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center bg-slate-100 text-sm text-slate-500">
            Foto pendiente
          </div>
        )}
      </div>

      {photos.length > 1 ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6">
          {photos.map((photo, index) => (
            <div
              key={photo.id ?? photo.image_url}
              className={
                index === 0
                  ? "overflow-hidden rounded-md bg-white ring-2 ring-ink"
                  : "overflow-hidden rounded-md bg-white ring-1 ring-slate-200"
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.image_url}
                alt={photo.alt_text ?? listing.title}
                className="aspect-square w-full object-cover"
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
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

function KeySpecs({ specs }: { specs: DetailSpec[] }) {
  return (
    <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4 border-y border-slate-200 py-5 text-sm">
      {specs.map((spec) => (
        <div key={spec.label} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {spec.label}
          </dt>
          <dd className="mt-1 truncate font-medium text-ink">{spec.value}</dd>
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
  const visibleSince =
    listing.seller_type === "store" && store?.created_at
      ? formatDate(store.created_at)
      : formatDate(listing.created_at);

  return (
    <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-semibold uppercase tracking-wide text-brass">
        {listing.seller_type === "store" ? "Sobre la tienda" : "Sobre el vendedor"}
      </p>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">
            {sellerName || "Vendedor particular"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{sellerTypeLabel}</p>
        </div>
        {store?.is_verified === true ? (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            Verificada
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 text-sm">
        <InlineMetric label="Ubicación" value={sellerLocation || "No indicada"} />
        <InlineMetric
          label="Listados publicados"
          value={
            sellerPublishedCount === null
              ? "No disponible"
              : String(sellerPublishedCount)
          }
        />
        <InlineMetric label="Visible desde" value={visibleSince} />
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        Laria muestra señales disponibles en la base de datos. No mostramos
        ratings ni ventas porque el MVP no registra esas métricas.
      </p>
    </div>
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

function SpecsList({ specs }: { specs: DetailSpec[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
      {specs.map((spec) => (
        <div key={spec.label} className="border-b border-slate-100 pb-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {spec.label}
          </dt>
          <dd className="mt-1 font-medium text-ink">{spec.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function InlineMetric({ label, value }: DetailSpec) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[60%] text-right font-medium text-ink">{value}</span>
    </div>
  );
}

function RelatedListingsSection({
  title,
  emptyMessage,
  listings,
}: {
  title: string;
  emptyMessage: string;
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
          {emptyMessage}
        </div>
      )}
    </section>
  );
}

function getKeySpecs(
  listing: ListingDetailData,
  sellerName?: string | null,
) {
  return [
    ...getCoreSpecs(listing, sellerName),
    ...getAttributeSpecs(listing).slice(0, 3),
  ].slice(0, 8);
}

function getFullSpecs(
  listing: ListingDetailData,
  sellerName?: string | null,
) {
  const instrumentLabel = listing.instrument_type
    ? getInstrumentFilterGroup(listing.instrument_type)?.label
    : null;

  return [
    ...(instrumentLabel ? [{ label: "Instrumento", value: instrumentLabel }] : []),
    ...getCoreSpecs(listing, sellerName),
    ...getAttributeSpecs(listing),
  ];
}

function getCoreSpecs(
  listing: ListingDetailData,
  sellerName?: string | null,
): DetailSpec[] {
  return [
    { label: "Categoría", value: getCategoryLabel(listing.category) },
    { label: "Marca", value: listing.brand || "No indicada" },
    { label: "Modelo", value: listing.model || "No indicado" },
    { label: "Condición", value: listing.condition || "No indicada" },
    { label: "Ciudad", value: `${listing.city}, ${listing.region}` },
    { label: "Vendedor", value: sellerName || "Vendedor particular" },
  ];
}

function getAttributeSpecs(listing: ListingDetailData): DetailSpec[] {
  const attributes = normalizeAttributes(listing.attributes);
  const entries = Object.entries(attributes);

  if (entries.length === 0) {
    return [];
  }

  const group = listing.instrument_type
    ? getInstrumentFilterGroup(listing.instrument_type)
    : null;
  const filters = new Map<string, InstrumentFilterConfig>(
    group?.filters.map((filter) => [filter.key, filter] as const) ?? [],
  );

  return entries
    .map(([key, value]) => {
      const filter = filters.get(key);
      return {
        label: filter?.label ?? formatAttributeKey(key),
        value: formatAttributeValue(value, filter),
      };
    })
    .filter((spec) => spec.value !== "");
}

function normalizeAttributes(attributes: ListingAttributes | null) {
  if (!attributes || Array.isArray(attributes)) {
    return {};
  }

  return attributes;
}

function formatAttributeValue(
  value: unknown,
  filter?: InstrumentFilterConfig,
) {
  const values = Array.isArray(value) ? value : [value];

  return values
    .map((item) => {
      if (item === null || item === undefined) {
        return "";
      }

      const stringValue = String(item);
      return (
        filter?.options?.find((option) => option.value === stringValue)
          ?.label ?? formatAttributeKey(stringValue)
      );
    })
    .filter(Boolean)
    .join(", ");
}

function formatAttributeKey(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
