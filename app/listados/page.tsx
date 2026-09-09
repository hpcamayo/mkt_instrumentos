import { redirect } from "next/navigation";
import { Pagination } from "@/components/pagination";
import {
  LISTINGS_PAGE_SIZE,
  parsePage,
  pageHref,
  getPageRedirect,
} from "@/lib/pagination";
import type { Metadata } from "next";
import { ListingCard } from "@/components/listing-card";
import { ListingFilters } from "@/components/listing-filters";
import { PageContainer } from "@/components/page-container";
import {
  instrumentFilterGroups,
  type InstrumentFilterConfig,
} from "@/lib/instrument-filters";
import {
  categoryOptions,
  parseListingFilters,
  sellerTypeOptions,
  sortOptions,
  type ListingCardData,
  type ListingFilters as ListingFiltersType,
} from "@/lib/listings";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Listados",
  description:
    "Explora instrumentos musicales aprobados de vendedores particulares y tiendas en Perú.",
  openGraph: {
    title: "Listados de instrumentos musicales en Perú",
    description:
      "Guitarras, bajos, baterías, pedales, amplificadores y equipos de audio con contacto directo por WhatsApp.",
    url: "/listados",
  },
};

type ListingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ActiveFilterChip = {
  key: string;
  label: string;
  href: string;
};

export default async function ListingsPage({
  searchParams,
}: ListingsPageProps) {
  const resolvedSearchParams = await searchParams;
  const filters = parseListingFilters(resolvedSearchParams);
  const page = parsePage(resolvedSearchParams.page);
  const supabase = getPublicSupabaseClient();

  if (!supabase) {
    return <SupabaseSetupMessage filters={filters} />;
  }

  const storeRelation =
    filters.sellerType === "verified_store" ? "stores!inner" : "stores";

  let query = supabase
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
        ${storeRelation} (
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
    .eq("status", "approved");

  if (filters.category) {
    query = query.eq("category", filters.category);
  }

  if (filters.city) {
    query = query.eq("city", filters.city);
  }

  if (filters.brand) {
    query = query.ilike("brand", `%${filters.brand}%`);
  }

  if (filters.condition) {
    query = query.eq("condition", filters.condition);
  }

  if (filters.sellerType === "verified_store") {
    query = query.eq("seller_type", "store").eq("stores.is_verified", true);
  } else if (filters.sellerType) {
    query = query.eq("seller_type", filters.sellerType);
  }

  if (filters.instrumentType) {
    query = query.eq("instrument_type", filters.instrumentType);
  }

  if (filters.minPrice !== undefined) {
    query = query.gte("price_pen", filters.minPrice);
  }

  if (filters.maxPrice !== undefined) {
    query = query.lte("price_pen", filters.maxPrice);
  }

  for (const [key, value] of Object.entries(filters.advanced)) {
    query = query.contains("attributes", { [key]: value });
  }

  if (filters.sort === "price_asc") {
    query = query.order("price_pen", { ascending: true, nullsFirst: false });
  } else if (filters.sort === "price_desc") {
    query = query.order("price_pen", { ascending: false, nullsFirst: false });
  } else {
    query = query
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
  }

  query = query.order("sort_order", {
    foreignTable: "listing_photos",
    ascending: true,
  });
  query = query.limit(1, { foreignTable: "listing_photos" });

  const { count, data, error } = await query
    .order("id")
    .range((page - 1) * LISTINGS_PAGE_SIZE, page * LISTINGS_PAGE_SIZE - 1)
    .returns<ListingCardData[]>();
  const redirectPage = getPageRedirect(page, count, error);
  if (redirectPage !== null)
    redirect(pageHref("/listados", resolvedSearchParams, redirectPage));
  const listings = (data ?? []) as ListingCardData[];

  return (
    <ListingsView
      filters={filters}
      listings={listings}
      page={page}
      searchParams={resolvedSearchParams}
      totalCount={count ?? 0}
      errorMessage={error?.message}
    />
  );
}

type ListingsViewProps = {
  filters: ListingFiltersType;
  listings: ListingCardData[];
  totalCount: number;
  page: number;
  searchParams: Record<string, string | string[] | undefined>;
  errorMessage?: string;
};

function ListingsView({
  filters,
  listings,
  totalCount,
  page,
  searchParams,
  errorMessage,
}: ListingsViewProps) {
  return (
    <section className="bg-laria-cloud/70">
      <PageContainer className="flex flex-col gap-6 py-6 sm:gap-7 sm:py-8">
        <div className="rounded-lg border border-laria-fog bg-white p-4 shadow-[0_18px_48px_rgb(16_18_23/0.06)] sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-laria-blue">
                Catálogo
              </p>
              <h1 className="mt-2 text-3xl font-black leading-tight text-laria-ink sm:text-4xl">
                Instrumentos disponibles
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-laria-text-soft sm:text-base">
                Explora publicaciones aprobadas de particulares y tiendas.
                Cuando algo te interese, abre el detalle y conversa directo por
                WhatsApp.
              </p>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-laria-fog bg-laria-cloud px-4 py-2 text-sm font-bold text-laria-ink">
              <span className="h-2 w-2 rounded-full bg-laria-blue" />
              {totalCount} resultado{totalCount === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[286px_minmax(0,1fr)] lg:items-start xl:gap-6">
          <ListingFilters filters={filters} />

          <div className="grid min-w-0 gap-4">
            <ActiveFilterChips filters={filters} />

            {errorMessage ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 shadow-sm">
                No se pudieron cargar los listados. Revisa la configuración de
                Supabase e intenta nuevamente.
              </div>
            ) : null}

            {!errorMessage && listings.length === 0 ? (
              <div className="rounded-lg border border-laria-fog bg-white p-8 text-center text-sm leading-6 text-laria-text-soft shadow-[0_18px_48px_rgb(16_18_23/0.06)]">
                <p className="text-lg font-black text-laria-ink">
                  No encontramos resultados con esos filtros
                </p>
                <p className="mx-auto mt-2 max-w-md">
                  Prueba ampliar la búsqueda, cambiar la ciudad o revisar otra
                  categoría de instrumentos.
                </p>
                <a
                  href="/listados"
                  className="laria-button-primary mt-5 min-h-11 px-5 py-3 text-sm"
                >
                  Limpiar filtros
                </a>
              </div>
            ) : null}

            {listings.length > 0 ? (
              <div className="grid grid-cols-1 gap-[18px] min-[460px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 2xl:gap-6">
                {listings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            ) : null}
            {!errorMessage && (
              <Pagination
                page={page}
                total={totalCount}
                path="/listados"
                params={searchParams}
              />
            )}
          </div>
        </div>
      </PageContainer>
    </section>
  );
}

function ActiveFilterChips({ filters }: { filters: ListingFiltersType }) {
  const chips = buildActiveFilterChips(filters);

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <a
          key={chip.key}
          href={chip.href}
          className="inline-flex items-center rounded-full border border-laria-blue/35 bg-white px-3 py-1.5 text-xs font-bold text-laria-blue shadow-sm transition hover:border-laria-blue hover:bg-laria-blue/10"
        >
          {chip.label}
          <span className="ml-2 text-laria-blue/55">×</span>
        </a>
      ))}
      <a
        href="/listados"
        className="inline-flex items-center rounded-full bg-laria-ink px-3 py-1.5 text-xs font-bold text-white transition hover:bg-laria-graphite"
      >
        Limpiar filtros
      </a>
    </div>
  );
}

function SupabaseSetupMessage({ filters }: { filters: ListingFiltersType }) {
  return (
    <section className="bg-laria-cloud/70">
      <PageContainer className="flex flex-col gap-6 py-6 sm:gap-7 sm:py-8">
        <div className="rounded-lg border border-laria-fog bg-white p-4 shadow-[0_18px_48px_rgb(16_18_23/0.06)] sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-laria-blue">
            Catálogo
          </p>
          <h1 className="mt-2 text-3xl font-black leading-tight text-laria-ink sm:text-4xl">
            Configura Supabase para ver listados
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-laria-text-soft sm:text-base">
            Falta definir `NEXT_PUBLIC_SUPABASE_URL` y
            `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local`. Cuando estén
            listas, esta página mostrará solo publicaciones aprobadas.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-[286px_minmax(0,1fr)] lg:items-start xl:gap-6">
          <ListingFilters filters={filters} />
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm font-medium leading-6 text-laria-ink shadow-sm">
            Copia `.env.example` a `.env.local`, agrega las credenciales
            públicas de Supabase y reinicia el servidor de desarrollo.
          </div>
        </div>
      </PageContainer>
    </section>
  );
}

function buildActiveFilterChips(
  filters: ListingFiltersType,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  const advancedConfig = getAdvancedFilterConfig(filters.instrumentType);

  addChip(
    chips,
    filters,
    "category",
    "Categoría",
    findLabel(categoryOptions, filters.category),
  );
  addChip(chips, filters, "location", "Ubicación", filters.city);
  addChip(chips, filters, "condition", "Condición", filters.condition);
  addChip(chips, filters, "brand", "Marca", filters.brand);
  addChip(
    chips,
    filters,
    "seller_type",
    "Vendedor",
    findLabel(sellerTypeOptions, filters.sellerType),
  );
  addChip(
    chips,
    filters,
    "instrument_type",
    "Instrumento",
    findInstrumentTypeLabel(filters.instrumentType),
  );

  if (filters.minPrice !== undefined) {
    addChip(chips, filters, "min_price", "Desde", `S/ ${filters.minPrice}`);
  }

  if (filters.maxPrice !== undefined) {
    addChip(chips, filters, "max_price", "Hasta", `S/ ${filters.maxPrice}`);
  }

  if (filters.sort !== "newest") {
    addChip(
      chips,
      filters,
      "sort",
      "Orden",
      findLabel(sortOptions, filters.sort),
    );
  }

  for (const [key, value] of Object.entries(filters.advanced)) {
    const filter = advancedConfig.get(key);
    const label = formatAdvancedValue(filter, value);
    addChip(chips, filters, key, filter?.label ?? key, label);
  }

  return chips;
}

function addChip(
  chips: ActiveFilterChip[],
  filters: ListingFiltersType,
  key: string,
  label: string,
  value?: string,
) {
  if (!value) {
    return;
  }

  chips.push({
    key,
    label: `${label}: ${value}`,
    href: buildListingsHref(filters, key),
  });
}

function buildListingsHref(filters: ListingFiltersType, omitKey?: string) {
  const params = new URLSearchParams();

  appendParam(params, "category", filters.category, omitKey);
  appendParam(params, "location", filters.city, omitKey);
  appendParam(params, "condition", filters.condition, omitKey);
  appendParam(params, "brand", filters.brand, omitKey);
  appendParam(params, "seller_type", filters.sellerType, omitKey);
  appendParam(params, "instrument_type", filters.instrumentType, omitKey);
  appendParam(params, "min_price", filters.minPrice, omitKey);
  appendParam(params, "max_price", filters.maxPrice, omitKey);

  if (filters.sort !== "newest") {
    appendParam(params, "sort", filters.sort, omitKey);
  }

  for (const [key, value] of Object.entries(filters.advanced)) {
    if (key === omitKey) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, String(item));
      }
    } else {
      params.set(key, String(value));
    }
  }

  const query = params.toString();
  return query ? `/listados?${query}` : "/listados";
}

function appendParam(
  params: URLSearchParams,
  key: string,
  value: string | number | undefined,
  omitKey?: string,
) {
  if (key === omitKey || value === undefined || value === "") {
    return;
  }

  params.set(key, String(value));
}

function findLabel(
  options: readonly { value: string; label: string }[],
  value?: string,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function findInstrumentTypeLabel(value?: string) {
  return (
    instrumentFilterGroups.find((group) => group.instrumentType === value)
      ?.label ?? value
  );
}

function getAdvancedFilterConfig(instrumentType?: string) {
  const config = new Map<string, InstrumentFilterConfig>();
  const groups = instrumentType
    ? instrumentFilterGroups.filter(
        (group) => group.instrumentType === instrumentType,
      )
    : instrumentFilterGroups;

  for (const group of groups) {
    for (const filter of group.filters) {
      if (!config.has(filter.key)) {
        config.set(filter.key, filter);
      }
    }
  }

  return config;
}

function formatAdvancedValue(
  filter: InstrumentFilterConfig | undefined,
  value: string | string[] | number | boolean,
) {
  const values = Array.isArray(value) ? value : [value];

  return values
    .map((item) => {
      const stringValue = String(item);
      return (
        filter?.options?.find((option) => option.value === stringValue)
          ?.label ?? stringValue
      );
    })
    .join(", ");
}
