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
import { ListingCard } from "@/components/listing-card";
import { PageContainer } from "@/components/page-container";
import { buildStoreWhatsAppUrl, type ListingCardData } from "@/lib/listings";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";

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

  const { data: store, error: storeError } = await supabase
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
    .maybeSingle();

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

  return (
    <StoreView
      store={store as StoreData}
      listings={listings}
      page={page}
      total={count ?? 0}
      hasError={Boolean(error)}
    />
  );
}

function StoreView({
  store,
  listings,
  page,
  total,
  hasError,
}: {
  store: StoreData;
  listings: ListingCardData[];
  page: number;
  total: number;
  hasError: boolean;
}) {
  return (
    <PageContainer
      as="section"
      className="flex flex-col gap-5 py-5 sm:gap-6 sm:py-6"
    >
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="relative h-40 bg-slate-100 sm:h-56">
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
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Banner pendiente
            </div>
          )}
        </div>

        <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-[auto_1fr_auto] md:items-end">
          <div className="-mt-16 h-28 w-28 overflow-hidden rounded-lg border-4 border-white bg-slate-100 shadow-sm">
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
              <div className="flex h-full items-center justify-center px-2 text-center text-xs text-slate-500">
                Logo pendiente
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-ink sm:text-3xl">
                {store.name}
              </h1>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${store.is_verified ? "bg-emerald-50 text-emerald-700" : "bg-laria-blue/10 text-laria-blue"}`}>
                {store.is_verified ? "Tienda Verificada" : "Tienda"}
              </span>
            </div>
            <p className="text-sm font-medium text-slate-500">
              {[store.district, store.city].filter(Boolean).join(", ")}
            </p>
            {store.description ? (
              <p className="max-w-3xl text-sm leading-6 text-slate-600">
                {store.description}
              </p>
            ) : null}
            {store.is_verified ? (
              <p className="max-w-3xl text-xs leading-5 text-laria-text-soft">
                La verificación valida la identidad comercial. Laria no procesa pagos, envíos ni garantiza transacciones o productos.
              </p>
            ) : null}
          </div>

          <a
            href={buildStoreWhatsAppUrl(store)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 md:w-auto"
          >
            Escribir a la tienda
          </a>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brass">
            Productos
          </p>
          <h2 className="mt-2 text-xl font-bold text-ink">
            Listados aprobados
          </h2>
        </div>
        <p className="text-sm font-medium text-slate-500">
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
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          <p className="font-semibold text-ink">
            Esta tienda aún no tiene productos publicados.
          </p>
          <p className="mt-1 leading-6">
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
      <div className="max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
        <h1 className="text-xl font-bold text-ink">
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
