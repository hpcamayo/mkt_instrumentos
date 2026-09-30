import { redirect } from "next/navigation";
import { Pagination } from "@/components/pagination";
import {
  LISTINGS_PAGE_SIZE,
  parsePage,
  pageHref,
  getPageRedirect,
} from "@/lib/pagination";
import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cache } from "react";
import { JsonLd } from "@/components/json-ld";
import { buildStoreJsonLd, buildStoreMetadata } from "@/lib/seo";
import { NOINDEX_ROBOTS } from "@/lib/site";
import { ListingCard } from "@/components/listing-card";
import { ContentReport } from "@/components/content-report";
import { StoreVisitTelemetry } from "@/components/marketplace-telemetry";
import { WhatsAppContactLink } from "@/components/whatsapp-contact-link";
import { PageContainer } from "@/components/page-container";
import { ReputationSummary } from "@/components/reputation-summary";
import { buildStoreWhatsAppUrl, type ListingCardData } from "@/lib/listings";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";
import { parsePublicReputation, type PublicReputation } from "@/lib/transactions";
import { buttonClasses } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { VerifiedMark } from "@/components/ui/verified-mark";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";

export const dynamic = "force-dynamic";

type StorePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  params: Promise<{
    slug: string;
  }>;
};

type StoreData = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string;
  district: string | null;
  whatsapp_phone: string;
  logo_url: string | null;
  banner_url: string | null;
  is_verified: boolean;
};

const loadActiveStore = cache(async (slug: string) => {
  const supabase = getPublicSupabaseClient();
  if (!supabase) return { data: null, error: null };
  return supabase
    .from("stores")
    .select(
      `
        id,
        name,
        slug,
        description,
        city,
        district,
        whatsapp_phone,
        logo_url,
        banner_url,
        is_verified
      `,
    )
    .eq("status", "active")
    .eq("slug", slug)
    .maybeSingle<StoreData>();
});

export async function generateMetadata({ params, searchParams }: StorePageProps): Promise<Metadata> {
  const { slug } = await params;
  const { data: store } = await loadActiveStore(slug);
  if (!store) return { title: "Tienda no disponible", robots: NOINDEX_ROBOTS };
  return buildStoreMetadata(store, parsePage((await searchParams).page));
}

export default async function StorePage({
  params,
  searchParams,
}: StorePageProps) {
  const { slug } = await params;
  const page = parsePage((await searchParams).page);
  const supabase = getPublicSupabaseClient();

  if (!supabase) {
    return <SupabaseSetupMessage />;
  }

  const { data: store, error: storeError } = await loadActiveStore(slug);

  if (storeError || !store) {
    notFound();
  }

  const { data, count, error } = await supabase
    .from("listings")
    .select(
      `
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
      `,
      { count: "exact" },
    )
    .eq("status", "approved")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .order("sort_order", {
      foreignTable: "listing_photos",
      ascending: true,
    })
    .limit(1, { foreignTable: "listing_photos" })
    .order("id")
    .range((page - 1) * LISTINGS_PAGE_SIZE, page * LISTINGS_PAGE_SIZE - 1)
    .returns<ListingCardData[]>();

  const redirectPage = getPageRedirect(page, count, error);
  if (redirectPage !== null)
    redirect(pageHref(`/tiendas/${slug}`, {}, redirectPage));
  const listings = (data ?? []) as ListingCardData[];
  const { data: reputationData } = await supabase.rpc("get_public_reputation", {
    p_subject_store_id: store.id,
    p_limit: 5,
  });

  return (
    <>
    <JsonLd data={buildStoreJsonLd(store)} />
    <StoreView
      store={store as StoreData}
      listings={listings}
      page={page}
      total={count ?? 0}
      hasError={Boolean(error)}
      reputation={parsePublicReputation(reputationData)}
    />
    </>
  );
}

function StoreView({
  store,
  listings,
  page,
  total,
  hasError,
  reputation,
}: {
  store: StoreData;
  listings: ListingCardData[];
  page: number;
  total: number;
  hasError: boolean;
  reputation: PublicReputation;
}) {
  return (
    <PageContainer
      as="section"
      className="flex flex-col gap-5 py-5 sm:gap-6 sm:py-6"
    >
      <StoreVisitTelemetry storeId={store.id} />
      <div className="overflow-hidden rounded-panel border border-subtle bg-white">
        <div className="relative h-40 bg-canvas sm:h-56">
          {store.banner_url ? (
            <Image
              width={1600}
              height={400}
              sizes="100vw"
              priority
              src={store.banner_url}
              alt={`Banner de ${store.name}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center t-ui text-ink-2">
              Banner pendiente
            </div>
          )}
        </div>

        <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-[auto_1fr_auto] md:items-end">
          <div className="-mt-16 h-28 w-28 overflow-hidden rounded-panel border-4 border-white bg-canvas">
            {store.logo_url ? (
              <Image
                width={112}
                height={112}
                sizes="112px"
                src={store.logo_url}
                alt={`Logo de ${store.name}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center px-2 text-center t-meta">
                Logo pendiente
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="t-page text-ink">
                {store.name}
              </h1>
              {store.is_verified ? <VerifiedMark /> : <Tag>Tienda</Tag>}
            </div>
            <p className="t-ui text-ink-2">
              {[store.district, store.city].filter(Boolean).join(", ")}
            </p>
            {store.description ? (
              <p className="max-w-[68ch] t-body text-ink-2">
                {store.description}
              </p>
            ) : null}
            {store.is_verified ? (
              <p className="max-w-[68ch] t-meta">
                La verificación valida la identidad comercial. Laria no procesa pagos, envíos ni garantiza transacciones o productos.
              </p>
            ) : null}
          </div>

          <div className="grid justify-items-start gap-3 md:justify-items-end">
            <WhatsAppContactLink
              href={buildStoreWhatsAppUrl(store)}
              storeId={store.id}
              source="store"
              className={buttonClasses({ block: true, className: "md:w-auto" })}
            >
              <WhatsAppGlyph />
              Escribir a la tienda
            </WhatsAppContactLink>
            <ContentReport
              targetType="store"
              targetId={store.id}
              label="Reportar tienda"
            />
          </div>
        </div>
      </div>

      <ReputationSummary reputation={reputation} title={`Reseñas de ${store.name}`} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="t-micro text-ink-2">
            Productos
          </p>
          <h2 className="mt-2 t-section text-ink">
            Listados aprobados
          </h2>
        </div>
        <p className="t-ui text-ink-2">
          {total} resultado{total === 1 ? "" : "s"}
        </p>
      </div>

      {hasError ? (
        <p role="alert">
          No se pudieron cargar los productos. Intenta nuevamente.
        </p>
      ) : listings.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} source="store" />
          ))}
        </div>
      ) : (
        <div className="rounded-panel border border-subtle bg-white p-6 t-ui text-ink-2">
          <p className="font-semibold text-ink">
            Esta tienda aún no tiene productos publicados.
          </p>
          <p className="mt-1">
            Vuelve pronto para revisar sus instrumentos aprobados.
          </p>
        </div>
      )}
      {!hasError && (
        <Pagination page={page} total={total} path={`/tiendas/${store.slug}`} />
      )}
    </PageContainer>
  );
}

function SupabaseSetupMessage() {
  return (
    <PageContainer as="section" className="py-8">
      <div className="max-w-3xl rounded-panel bg-warning-tint p-5 t-ui text-ink">
        <h1 className="t-section text-ink">
          Configura Supabase para ver esta tienda
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
