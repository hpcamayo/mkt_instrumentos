import { redirect } from "next/navigation";
import { Pagination } from "@/components/pagination";
import {
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
import { getPublicSupabaseClient, warnMissingSupabaseEnv } from "@/lib/supabase/public-client";
import { SearchTelemetry } from "@/components/marketplace-telemetry";
import { CreateSearchAlert } from "@/components/create-search-alert";
import { createSearchReceipt } from "@/lib/marketplace-events-server";
import { searchEventMetadata } from "@/lib/marketplace-event-payload";
import { listingFiltersToSearchAlert } from "@/lib/search-alerts";
import { fetchCatalogPage } from "@/lib/catalog";
import { buildCatalogMetadata } from "@/lib/seo";
import { buttonClasses } from "@/components/ui/button";
import { AppliedChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

type ListingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: ListingsPageProps): Promise<Metadata> {
  const resolved = await searchParams;
  return buildCatalogMetadata(resolved, parsePage(resolved.page));
}

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

  const { count, data, error } = await fetchCatalogPage(supabase, filters, page);
  const redirectPage = getPageRedirect(page, count, error);
  if (redirectPage !== null)
    redirect(pageHref("/listados", resolvedSearchParams, redirectPage));
  const listings = (data ?? []) as ListingCardData[];
  const searchReceipt = !error && page === 1 ? createSearchReceipt(filters, count ?? 0) : null;
  const searchState = searchEventMetadata(filters, count ?? 0);

  return (
    <>
    {searchReceipt ? <SearchTelemetry searchReceipt={searchReceipt} signature={JSON.stringify(searchState.filters)} filtered={Object.keys(searchState.filters).some((key) => key !== "sort") || filters.sort !== "newest"} /> : null}
    <ListingsView
      filters={filters}
      listings={listings}
      page={page}
      searchParams={resolvedSearchParams}
      totalCount={count ?? 0}
      errorMessage={error?.message}
    />
    </>
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
    <section className="bg-canvas/70">
      <PageContainer className="flex flex-col gap-6 py-6 sm:gap-7 sm:py-8">
        <div className="rounded-panel border border-subtle bg-white p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <PageHeader eyebrow="Catálogo" title="Instrumentos disponibles" />
              <p className="mt-3 max-w-[68ch] t-body text-ink-2">
                Explora publicaciones aprobadas de particulares y tiendas.
                Cuando algo te interese, abre el detalle y conversa directo por
                WhatsApp.
              </p>
            </div>
            <div className="inline-flex w-fit items-center gap-2 t-ui font-semibold tabular-nums text-ink">
              {totalCount} resultado{totalCount === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[286px_minmax(0,1fr)] lg:items-start xl:gap-6">
          <ListingFilters filters={filters} />

          <div className="grid min-w-0 gap-4">
            <ActiveFilterChips filters={filters} />
            <CreateSearchAlert filters={listingFiltersToSearchAlert(filters)} />

            {errorMessage ? (
              <Notice tone="danger" role="alert">
                No se pudieron cargar las publicaciones. Intenta nuevamente.
              </Notice>
            ) : null}

            {!errorMessage && listings.length === 0 ? (
              <EmptyState
                title="No encontramos resultados con esos filtros"
                description="Prueba ampliar la búsqueda, cambiar la ciudad o revisar otra categoría de instrumentos."
                actions={<a href="/listados" className={buttonClasses()}>Limpiar filtros</a>}
              />
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
        <AppliedChip key={chip.key} href={chip.href} label={chip.label} />
      ))}
      <a
        href="/listados"
        className={buttonClasses({ variant: "quiet", size: "sm" })}
      >
        Limpiar filtros
      </a>
    </div>
  );
}

function SupabaseSetupMessage({ filters }: { filters: ListingFiltersType }) {
  warnMissingSupabaseEnv();
  return (
    <section className="bg-canvas/70">
      <PageContainer className="flex flex-col gap-6 py-6 sm:gap-7 sm:py-8">
        <div className="rounded-panel border border-subtle bg-white p-4 sm:p-6">
          <PageHeader eyebrow="Catálogo" title="El catálogo no está disponible por ahora" />
          <p className="mt-3 max-w-[68ch] t-body text-ink-2">
            Intenta nuevamente en unos minutos.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-[286px_minmax(0,1fr)] lg:items-start xl:gap-6">
          <ListingFilters filters={filters} />
          <Notice tone="warning">No pudimos conectar con el catálogo.</Notice>
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
