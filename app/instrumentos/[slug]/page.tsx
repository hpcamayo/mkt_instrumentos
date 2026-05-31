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
    <section className="bg-laria-cloud/70">
      <PageContainer className="py-6 sm:py-8">
        <Breadcrumb listing={listing} displayTitle={displayTitle} />

        <div className="mt-4 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)] lg:items-start xl:gap-8">
          <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <ListingDetailGallery
              photos={listing.listing_photos}
              title={displayTitle}
            />
          </div>

          <aside className="min-w-0 space-y-5">
            <div className="rounded-lg border border-laria-fog bg-white p-5 shadow-[0_18px_48px_rgb(16_18_23/0.07)] sm:p-6">
              <div className="flex flex-wrap gap-2">
                <SellerBadge
                  label={sellerTypeLabel}
                  isVerified={store?.is_verified === true}
                />
              </div>

              <h1 className="mt-4 text-3xl font-black leading-tight text-laria-ink sm:text-4xl">
                {displayTitle}
              </h1>
              {displayTitle !== listing.title ? (
                <p className="mt-2 text-sm font-medium leading-6 text-laria-text-soft">
                  {listing.title}
                </p>
              ) : null}
              <p className="mt-5 text-4xl font-black tracking-tight text-laria-black sm:text-5xl">
                {formatPrice(listing.price_pen)}
              </p>

              <ListingDetailMetadata
                listingId={listing.id}
                publishedAt={listing.published_at}
                createdAt={listing.created_at}
                initialViewCount={listing.view_count}
              />

              <KeySpecs specs={keySpecs} />

              <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
                <a
                  href={buildWhatsAppUrl(listing)}
                  target="_blank"
                  rel="noreferrer"
                  className="laria-button-primary min-h-12 w-full px-5 py-3 text-sm uppercase tracking-wide"
                >
                  Preguntar por WhatsApp
                </a>
                {listing.seller_type === "store" && store ? (
                  <Link
                    href={`/tiendas/${store.slug}`}
                    className="laria-button-secondary min-h-12 w-full px-5 py-3 text-sm sm:w-auto"
                  >
                    Ver tienda
                  </Link>
                ) : null}
              </div>

              <p className="mt-4 rounded-md border border-blue-100 bg-[#eef5ff] p-3 text-xs font-medium leading-5 text-laria-text-soft">
                Contacto directo por WhatsApp. Laria no procesa pagos, envíos
                ni garantías.
              </p>
            </div>

            <SellerTrustBox
              sellerName={sellerName}
              sellerTypeLabel={sellerTypeLabel}
              sellerLocation={sellerLocation}
              listing={listing}
              sellerPublishedCount={sellerPublishedCount}
            />

            <DetailSection title="Descripción">
              {listing.description ? (
                <p className="whitespace-pre-line text-sm leading-7 text-laria-text-soft sm:text-base">
                  {listing.description}
                </p>
              ) : (
                <p className="text-sm leading-6 text-laria-muted">
                  Este listado aún no tiene descripción.
                </p>
              )}
            </DetailSection>

            <DetailSection title="Especificaciones completas">
              <SpecsList specs={fullSpecs} />
            </DetailSection>
          </aside>
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
    <nav
      aria-label="Ruta de navegación"
      className="rounded-lg border border-laria-fog bg-white px-4 py-3 text-sm font-semibold leading-6 text-laria-text-soft shadow-sm"
    >
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link
            href="/"
            className="underline-offset-4 hover:text-laria-blue hover:underline"
          >
            Inicio
          </Link>
        </li>
        <li aria-hidden="true" className="text-laria-steel">
          /
        </li>
        <li>
          <Link
            href={`/listados?category=${encodeURIComponent(listing.category)}`}
            className="underline-offset-4 hover:text-laria-blue hover:underline"
          >
            {categoryLabel}
          </Link>
        </li>
        <li aria-hidden="true" className="text-laria-steel">
          /
        </li>
        <li className="min-w-0 break-words text-laria-ink">{displayTitle}</li>
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
          ? "rounded-full border border-blue-200 bg-[#eef5ff] px-2.5 py-1 text-xs font-black text-laria-blue"
          : "rounded-full border border-laria-fog bg-laria-cloud px-2.5 py-1 text-xs font-black text-laria-text-soft"
      }
    >
      {label}
    </span>
  );
}

function KeySpecs({ specs }: { specs: ListingSpec[] }) {
  return (
    <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4 border-y border-laria-fog py-5 text-sm">
      {specs.map((spec) => (
        <div key={spec.label} className="min-w-0">
          <dt className="text-xs font-black uppercase tracking-wide text-laria-blue">
            {spec.label}
          </dt>
          <dd className="mt-1 break-words font-bold text-laria-ink">
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
    <section className="rounded-lg border border-laria-fog bg-white p-5 shadow-[0_14px_34px_rgb(16_18_23/0.06)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-laria-blue">
            {isStore ? "Sobre la tienda" : "Sobre el vendedor"}
          </p>
          <h2 className="mt-2 text-xl font-black text-laria-ink">
            {sellerName || "Vendedor particular"}
          </h2>
          <p className="mt-1 text-sm font-bold text-laria-text-soft">
            {sellerTypeLabel}
          </p>
        </div>
        {store?.is_verified === true ? (
          <span className="rounded-full border border-blue-200 bg-[#eef5ff] px-2.5 py-1 text-xs font-black text-laria-blue">
            Tienda verificada
          </span>
        ) : null}
      </div>

      {isStore && store?.description ? (
        <p className="mt-4 line-clamp-3 text-sm leading-6 text-laria-text-soft">
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
          className="laria-button-primary inline-flex w-full items-center justify-center px-4 py-3 text-sm"
        >
          {isStore ? "Escribir por WhatsApp" : "Contactar por WhatsApp"}
        </a>
        {isStore && store ? (
          <Link
            href={`/tiendas/${store.slug}`}
            className="laria-button-secondary inline-flex w-full items-center justify-center px-4 py-3 text-sm"
          >
            Ver página de la tienda
          </Link>
        ) : null}
      </div>

      <p className="mt-5 rounded-md border border-laria-fog bg-laria-cloud p-3 text-xs font-medium leading-5 text-laria-text-soft">
        Coordina por WhatsApp, revisa el instrumento cuando sea posible y evita
        adelantos si no conoces al vendedor. Laria no procesa pagos, envíos ni
        garantías.
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
    <section className="rounded-lg border border-laria-fog bg-white p-5 shadow-[0_14px_34px_rgb(16_18_23/0.06)] sm:p-6">
      <h2 className="text-xl font-black text-laria-ink">{title}</h2>
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
    <dl className="divide-y divide-laria-fog rounded-lg border border-laria-fog text-sm">
      {specs.map((spec) => (
        <div
          key={spec.label}
          className="grid gap-1 px-4 py-3 transition even:bg-laria-cloud/55 sm:grid-cols-[minmax(160px,0.42fr)_1fr] sm:gap-6"
        >
          <dt className="font-bold text-laria-text-soft">{spec.label}</dt>
          <dd className="break-words font-black text-laria-ink sm:text-right">
            {spec.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TrustSignal({ label, value }: ListingSpec) {
  return (
    <div className="rounded-md border border-laria-fog bg-laria-cloud p-3">
      <p className="text-xs font-black uppercase tracking-wide text-laria-blue">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold leading-5 text-laria-ink">{value}</p>
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
        <h2 className="text-2xl font-black text-laria-ink">{title}</h2>
      </div>
      {listings.length > 0 ? (
        <div className="grid grid-cols-1 gap-[18px] min-[460px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {listings.map((item) => (
            <ListingCard key={item.id} listing={item} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-laria-fog bg-white p-5 text-sm font-medium text-laria-text-soft shadow-[0_14px_34px_rgb(16_18_23/0.06)]">
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
    <section className="bg-laria-cloud/70">
      <PageContainer className="py-8">
        <div className="max-w-3xl rounded-lg border border-yellow-200 bg-yellow-50 p-5 text-sm font-medium leading-6 text-laria-ink shadow-sm">
          <h1 className="text-xl font-black text-laria-ink">
            Configura Supabase para ver este instrumento
          </h1>
          <p className="mt-2">
            Falta definir `NEXT_PUBLIC_SUPABASE_URL` y
            `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local`. Agrega las
            credenciales públicas y reinicia el servidor de desarrollo.
          </p>
        </div>
      </PageContainer>
    </section>
  );
}
