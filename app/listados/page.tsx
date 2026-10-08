import { redirect } from "next/navigation";
import {
  parsePage,
  pageHref,
  getPageRedirect,
} from "@/lib/pagination";
import type { Metadata } from "next";
import { CatalogView } from "@/components/catalog-view";
import { ListingFilters } from "@/components/listing-filters";
import { PageContainer } from "@/components/page-container";
import {
  parseListingFilters,
  type ListingCardData,
  type ListingFilters as ListingFiltersType,
} from "@/lib/listings";
import { getPublicSupabaseClient, warnMissingSupabaseEnv } from "@/lib/supabase/public-client";
import { SearchTelemetry } from "@/components/marketplace-telemetry";
import { createSearchReceipt } from "@/lib/marketplace-events-server";
import { searchEventMetadata } from "@/lib/marketplace-event-payload";
import { fetchCatalogPage } from "@/lib/catalog";
import { catalogTitle } from "@/lib/catalog-filters";
import { buildCatalogMetadata } from "@/lib/seo";
import { Button } from "@/components/ui/button";
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
    <CatalogView
      title={catalogTitle(filters)}
      breadcrumbs={[{ label: "Inicio", href: "/" }, { label: "Instrumentos" }]}
      filters={filters}
      scope={{}}
      listings={listings}
      totalCount={count ?? 0}
      page={page}
      path="/listados"
      params={resolvedSearchParams}
      error={Boolean(error)}
      retryHref={pageHref("/listados", resolvedSearchParams, page)}
      emptyState={
        <EmptyState
          title="Aún no hay publicaciones"
          description="Las primeras publicaciones aparecerán aquí."
          actions={<Button href="/vender" variant="secondary">Publicar un instrumento</Button>}
        />
      }
    />
    </>
  );
}

function SupabaseSetupMessage({ filters }: { filters: ListingFiltersType }) {
  warnMissingSupabaseEnv();
  return (
    <section className="bg-surface">
      <PageContainer className="flex flex-col gap-6 py-6 lg:py-8">
        <PageHeader title="El catálogo no está disponible por ahora" />
        <div className="grid gap-8 lg:grid-cols-[272px_minmax(0,1fr)] lg:items-start">
          <ListingFilters filters={filters} />
          <Notice tone="warning">No pudimos conectar con el catálogo. Intenta nuevamente en unos minutos.</Notice>
        </div>
      </PageContainer>
    </section>
  );
}
