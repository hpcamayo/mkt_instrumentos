import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cache } from "react";
import { CategoryLanding } from "@/components/category-landing";
import { PageContainer } from "@/components/page-container";
import { NoticeIcon, noticeClassName } from "@/components/ui/notice";
import { fetchCatalogPage } from "@/lib/catalog";
import { getCatalogBrandsByCategory } from "@/lib/catalog-brands";
import { getCategoryLandingBySlug, type CategoryLandingPage } from "@/lib/category-pages";
import { parseListingFilters, type ListingCardData } from "@/lib/listings";
import { createSearchReceipt } from "@/lib/marketplace-events-server";
import { searchEventMetadata } from "@/lib/marketplace-event-payload";
import { getPageRedirect, pageHref, parsePage } from "@/lib/pagination";
import { buildCategoryMetadata, categoryFilterRedirect } from "@/lib/seo";
import { NOINDEX_FOLLOW_ROBOTS } from "@/lib/site";
import { warnMissingSupabaseEnv } from "@/lib/supabase/public-client";
import { getRequestReads, optionalReadSignal } from "@/lib/supabase/public-read-client";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Launch audit A19: listing pages (app/instrumentos/[slug]) are cached, and a cached page can't read the query string.
// So each category landing (lib/category-pages.ts) has its own folder next to [slug], which takes precedence over it,
// and renders here on every request: it reads ?page and sends filter parameters on to /listados.
// tests/launch-audit-caching.test.cjs keeps the folders and the registry in step.
export function categoryLandingRoute(slug: string) {
  const landing = getCategoryLandingBySlug(slug);
  if (!landing) throw new Error(`"${slug}" is not a category landing (lib/category-pages.ts).`);
  return {
    async generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
      const resolved = await searchParams;
      // Filtered category URLs redirect to /listados; skip the inventory query.
      if (categoryFilterRedirect(landing, resolved)) return { title: landing.heading, robots: NOINDEX_FOLLOW_ROBOTS };
      const page = parsePage(resolved.page);
      const { count, error } = await loadCategoryPage(landing.category, page);
      return buildCategoryMetadata(landing, page, error ? null : count);
    },
    async Page({ searchParams }: { searchParams: SearchParams }) {
      return renderCategoryLanding(landing, await searchParams);
    },
  };
}

// Shared by generateMetadata and the page so one request performs one inventory query.
const loadCategoryPage = cache(async (category: string, page: number) => {
  const { supabase } = getRequestReads();
  if (!supabase) return { configured: false as const, count: null, data: null, error: null };
  const filters = parseListingFilters({ category });
  const result = await fetchCatalogPage(supabase, filters, page);
  return { configured: true as const, count: result.count, data: result.data, error: result.error };
});

async function renderCategoryLanding(
  landing: CategoryLandingPage,
  searchParams: Record<string, string | string[] | undefined>,
) {
  const path = `/instrumentos/${landing.slug}`;
  // Filtering happens in the canonical catalog; forward filter parameters there.
  const forwarded = categoryFilterRedirect(landing, searchParams);
  if (forwarded) redirect(forwarded);

  const page = parsePage(searchParams.page);
  const filters = parseListingFilters({ category: landing.category });
  const [result, catalogBrands] = await Promise.all([loadCategoryPage(landing.category, page), getCatalogBrandsByCategory(optionalReadSignal(getRequestReads().deadline))]);
  if (!result.configured) return <SupabaseSetupMessage />;

  const redirectPage = getPageRedirect(page, result.count, result.error);
  if (redirectPage !== null) redirect(pageHref(path, {}, redirectPage));

  const searchReceipt = !result.error && page === 1 ? createSearchReceipt(filters, result.count ?? 0) : null;
  const searchState = searchEventMetadata(filters, result.count ?? 0);

  return (
    <CategoryLanding
      landing={landing}
      brands={catalogBrands[landing.category] ?? []}
      filters={filters}
      listings={(result.data ?? []) as ListingCardData[]}
      totalCount={result.count ?? 0}
      page={page}
      errorMessage={result.error?.message}
      searchReceipt={searchReceipt}
      searchSignature={JSON.stringify(searchState.filters)}
    />
  );
}

function SupabaseSetupMessage() {
  warnMissingSupabaseEnv();
  return (
    <section className="bg-canvas/70">
      <PageContainer className="py-8">
        <div className={noticeClassName("warning", "max-w-3xl p-5")}>
          <NoticeIcon tone="warning" />
          <div>
            <h1 className="t-section text-ink">
              Esta categoría no está disponible por ahora
            </h1>
            <p className="mt-2">
              Intenta nuevamente en unos minutos.
            </p>
          </div>
        </div>
      </PageContainer>
    </section>
  );
}
