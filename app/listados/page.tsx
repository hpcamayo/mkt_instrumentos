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

export default async function ListingsPage({ searchParams }: ListingsPageProps) {
  const resolvedSearchParams = await searchParams;
  const filters = parseListingFilters(resolvedSearchParams);
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

  const { count, data, error } = await query;
  const listings = (data ?? []) as ListingCardData[];
  const photoCounts = await getListingPhotoCounts(
    supabase,
    listings.map((listing) => listing.id),
  );
  const listingsWithPhotoCounts = listings.map((listing) => ({
    ...listing,
    photo_count: photoCounts.get(listing.id) ?? listing.listing_photos.length,
  }));

  return (
    <ListingsView
      filters={filters}
      listings={listingsWithPhotoCounts}
      totalCount={count ?? 0}
      errorMessage={error?.message}
    />
  );
}

type ListingsViewProps = {
  filters: ListingFiltersType;
  listings: ListingCardData[];
  totalCount: number;
  errorMessage?: string;
};

function ListingsView({
  filters,
  listings,
  totalCount,
  errorMessage,
}: ListingsViewProps) {
  return (
    <PageContainer as="section" className="flex flex-col gap-5 py-5 sm:gap-6 sm:py-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-brass">
          Listados
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink sm:text-3xl">
              Instrumentos disponibles
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Explora publicaciones aprobadas de particulares y tiendas. Cuando
              algo te interese, abre el detalle y conversa directo por WhatsApp.
            </p>
          </div>
          <p className="text-sm font-medium text-slate-500">
            {totalCount} resultado{totalCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start xl:gap-6">
        <ListingFilters filters={filters} />

        <div className="grid min-w-0 gap-4">
          <ActiveFilterChips filters={filters} />

          {errorMessage ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              No se pudieron cargar los listados. Revisa la configuración de
              Supabase e intenta nuevamente.
            </div>
          ) : null}

          {!errorMessage && listings.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm leading-6 text-slate-600 shadow-sm">
              <p className="text-base font-semibold text-ink">
                No encontramos resultados con esos filtros
              </p>
              <p className="mx-auto mt-2 max-w-md">
                Prueba ampliar la búsqueda, cambiar la ciudad o revisar otra
                categoría de instrumentos.
              </p>
              <a
                href="/listados"
                className="mt-5 inline-flex items-center justify-center rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
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
        </div>
      </div>
    </PageContainer>
  );
}

async function getListingPhotoCounts(
  supabase: NonNullable<ReturnType<typeof getPublicSupabaseClient>>,
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
          className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-brass hover:text-ink"
        >
          {chip.label}
          <span className="ml-2 text-slate-400">×</span>
        </a>
      ))}
      <a
        href="/listados"
        className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
      >
        Limpiar filtros
      </a>
    </div>
  );
}

function SupabaseSetupMessage({ filters }: { filters: ListingFiltersType }) {
  return (
    <PageContainer as="section" className="flex flex-col gap-5 py-5 sm:gap-6 sm:py-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-brass">
          Listados
        </p>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          Configura Supabase para ver listados
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
          Falta definir `NEXT_PUBLIC_SUPABASE_URL` y
          `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local`. Cuando estén listas,
          esta página mostrará solo publicaciones aprobadas.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start xl:gap-6">
        <ListingFilters filters={filters} />
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Copia `.env.example` a `.env.local`, agrega las credenciales públicas
          de Supabase y reinicia el servidor de desarrollo.
        </div>
      </div>
    </PageContainer>
  );
}

function buildActiveFilterChips(filters: ListingFiltersType): ActiveFilterChip[] {
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
    addChip(chips, filters, "sort", "Orden", findLabel(sortOptions, filters.sort));
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
