import { permanentRedirect, redirect } from "next/navigation";
import {
  pageHref,
  getPageRedirect,
} from "@/lib/pagination";
import type { Metadata } from "next";
import { CatalogView } from "@/components/catalog-view";
import { ListingFilters } from "@/components/listing-filters";
import { PageContainer } from "@/components/page-container";
import {
  type ListingCardData,
  type ListingFilters as ListingFiltersType,
} from "@/lib/listings";
import { warnMissingSupabaseEnv } from "@/lib/supabase/public-client";
import { getRequestReads } from "@/lib/supabase/public-read-client";
import { SearchTelemetry } from "@/components/marketplace-telemetry";
import { createSearchReceipt } from "@/lib/marketplace-events-server";
import { searchEventMetadata } from "@/lib/marketplace-event-payload";
import { getCatalogPage } from "@/lib/catalog-data";
import { applySearchPhrase } from "@/lib/catalog-query";
import { catalogHref, catalogTabTitle, catalogTitle } from "@/lib/catalog-filters";
import { buildCatalogMetadata } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { catalogFilterParams, parseCatalogRequest } from "@/lib/catalog-request";

export const dynamic = "force-dynamic";
// A hard stop well past the read budgets (lib/request-deadline.ts), far below Vercel's 300 s default.
export const maxDuration = 30;

type ListingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Metadata and the page can run independently. Both must clean malformed URLs before starting catalog reads.
function readCatalogRequest(searchParams: Awaited<ListingsPageProps["searchParams"]>) {
  const { filters, page, redirectHref } = parseCatalogRequest(searchParams);
  if (redirectHref) permanentRedirect(redirectHref);
  return { filters, page };
}

export async function generateMetadata({ searchParams }: ListingsPageProps): Promise<Metadata> {
  const resolved = await searchParams;
  const { filters, page } = readCatalogRequest(resolved);
  // FIND 02: a filtered search's tab says what was searched and how many results ("Fender en Guitarras · Lima (34)").
  const result = applySearchPhrase(filters).changed ? null : await getCatalogPage(filters, page);
  return buildCatalogMetadata(resolved, page, catalogTabTitle(filters, result && !result.error ? result.count : null));
}

export default async function ListingsPage({
  searchParams,
}: ListingsPageProps) {
  const resolvedSearchParams = await searchParams;
  const { filters, page } = readCatalogRequest(resolvedSearchParams);
  const navigationParams = catalogFilterParams(filters);
  const { supabase } = getRequestReads();

  if (!supabase) {
    return <SupabaseSetupMessage filters={filters} />;
  }

  // BIG 03: a plain phrase becomes filters the visitor can see and edit ("bajo 5 cuerdas menos de 2000 en Lima").
  const phrase = applySearchPhrase(filters);
  if (phrase.changed) redirect(catalogHref(phrase.filters));

  const { count, data, error } = (await getCatalogPage(filters, page)) ?? { count: null, data: null, error: null };
  const redirectPage = getPageRedirect(page, count, error);
  if (redirectPage !== null)
    redirect(pageHref("/listados", navigationParams, redirectPage));
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
      params={navigationParams}
      error={Boolean(error)}
      retryHref={pageHref("/listados", navigationParams, page)}
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
