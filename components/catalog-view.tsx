import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CompareTray } from "@/components/catalog-compare";
import { CatalogLoadMore } from "@/components/catalog-load-more";
import { CatalogLink, CatalogNavigation, CatalogResults } from "@/components/catalog-navigation";
import { RecentlyViewed } from "@/components/catalog-recently-viewed";
import { CatalogTrail } from "@/components/catalog-trail";
import { CreateSearchAlert } from "@/components/create-search-alert";
import { FollowButton } from "@/components/following/follow-button";
import { FilterSheetButton } from "@/components/filter-sheet";
import { ListingCard } from "@/components/listing-card";
import { ListingFilters } from "@/components/listing-filters";
import { PageContainer } from "@/components/page-container";
import { Pagination } from "@/components/pagination";
import { SortMenu, SortSheetButton } from "@/components/sort-control";
import { buttonClasses } from "@/components/ui/button";
import { AppliedChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { NoticeIcon, noticeClassName } from "@/components/ui/notice";
import { getCatalogRescue, type getCatalogFacets } from "@/lib/catalog-data";
import {
  RESULTS_STATUS_ID,
  appliedFilters,
  catalogHref,
  catalogTitle,
  clearedFilters,
  formatNumber,
  narrowsSearch,
  resultsLabel,
  sortShortLabels,
  withQuery,
  type CatalogScope,
} from "@/lib/catalog-filters";
import type { ListingCardData, ListingFilters as ListingFiltersType } from "@/lib/listings";
import { LISTINGS_PAGE_SIZE, pageHref } from "@/lib/pagination";
import { listingFiltersToSearchAlert } from "@/lib/search-alerts";
import type { Crumb } from "@/lib/shell";
import { LISTING_GRID, LISTING_GRID_SIZES } from "@/lib/ui/listing-grid";
import { cn } from "@/lib/utils";

// The catalog (/listados) and the category landings share this page (UX-3 § Catalog, § Category landings): the
// title row with the count, the alert entry and sort; the applied chips; the filter column on desktop and the
// "Filtrar"/"Ordenar" sheets below 1024 px; the grid of cards with numbered pagination; and the error, empty and
// no-results states. Every navigation inside it runs in CatalogNavigation's transition.
// Effortless Laria (find batch): the filters carry their counts (FIND 07), a search names its scope with a way out to
// the whole catalog (FIND 01), no results offers one-tap ways out and the closest listings (FIND 04), phones load the
// next 24 below (FIND 15), desktop cards can be compared (FIND 12), and recently viewed listings close the page (FIND 11).
export async function CatalogView({
  title,
  breadcrumbs,
  lead,
  types,
  filters,
  facets: facetsRead,
  scope,
  listings,
  totalCount,
  page,
  path,
  params,
  error,
  retryHref,
  emptyState,
  after,
}: {
  title: string;
  breadcrumbs: Crumb[];
  // A landing's introduction and type chips.
  lead?: ReactNode;
  types?: ReactNode;
  filters: ListingFiltersType;
  // Started by the route alongside inventory; do not restart it after the parent finishes rendering.
  facets: ReturnType<typeof getCatalogFacets>;
  scope: CatalogScope;
  listings: ListingCardData[];
  totalCount: number;
  page: number;
  // Pagination keeps these parameters (REL-003).
  path: string;
  params?: Record<string, string | string[] | undefined>;
  error: boolean;
  retryHref: string;
  // Nothing published at all (no filter applies).
  emptyState: ReactNode;
  after?: ReactNode;
}) {
  // Optional reads, together (lib/catalog-data.ts): each gives up at the optional budget and the page renders without it.
  const [facets, rescue] = error
    ? [null, null]
    : await Promise.all([facetsRead, listings.length === 0 && appliedFilters(filters, scope).length > 0 ? getCatalogRescue(filters, scope) : null]);
  const applied = appliedFilters(filters, scope);
  // FIND 01: a text search inside other filters says so, with the escape to the whole catalog.
  const scoped = filters.q && applied.some((chip) => chip.key !== "q") ? catalogTitle(withQuery({ ...filters, brand: undefined }, undefined)) : null;
  // FIND 09: the address a listing page leads back to ("Volver a resultados").
  const trailHref = pageHref(path, params ?? {}, page);
  const narrowed = narrowsSearch(filters);
  // Null when a filter has several values (F11): alerts save one value per filter (Q19).
  const alertFilters = listingFiltersToSearchAlert(filters);
  const lastPage = page >= Math.ceil(totalCount / LISTINGS_PAGE_SIZE);
  const clearHref = catalogHref(clearedFilters(scope), scope);

  return (
    <CatalogNavigation>
      <div className="bg-surface">
        <PageContainer className="py-6 lg:py-8">
          <Breadcrumbs items={breadcrumbs} className="mb-3" />
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <h1 className="t-page min-w-0 text-ink">{title}</h1>
            <p id={RESULTS_STATUS_ID} tabIndex={-1} role="status" className="ml-auto shrink-0 t-meta tabular-nums lg:ml-0">
              {resultsLabel(totalCount)}
              <span className="lg:hidden"> · {sortShortLabels[filters.sort]}</span>
            </p>
            <div className="hidden items-center gap-2 self-center lg:ml-auto lg:flex">
              {narrowed ? <CreateSearchAlert filters={alertFilters} variant="button" align="right" /> : null}
              <SortMenu filters={filters} scope={scope} />
            </div>
          </div>
          {lead ? <p className="text-lead mt-3 max-w-[68ch] t-body text-ink-2">{lead}</p> : null}
          {/* Accounts batch, save-12: follow the brand being browsed. */}
          {filters.brand?.trim() ? <div className="mt-3"><FollowButton brand={filters.brand.trim()} label={filters.brand.trim()} showLabel /></div> : null}
          {types}

          <div className="mt-4 grid grid-cols-2 gap-3 lg:hidden">
            <FilterSheetButton filters={filters} scope={scope} appliedCount={applied.length} facets={facets} />
            <SortSheetButton filters={filters} scope={scope} />
          </div>

          {applied.length > 0 || narrowed ? (
            // Without chips the row only holds the phone alert entry.
            <div className={cn("mt-4 flex flex-wrap items-center gap-2", applied.length === 0 && "lg:hidden")}>
              {applied.length > 0 ? (
                <>
                  <span className="t-meta">Filtros activos:</span>
                  {applied.map((chip) => (
                    <AppliedChip key={chip.key} href={chip.href} text={chip.text} label={`${chip.facet}: ${chip.value}`} />
                  ))}
                  <CatalogLink href={clearHref} focusId={RESULTS_STATUS_ID} className={buttonClasses({ variant: "quiet", size: "sm" })}>
                    Limpiar todo
                  </CatalogLink>
                </>
              ) : null}
              {narrowed ? (
                <div className="lg:hidden">
                  <CreateSearchAlert filters={alertFilters} variant="chip" />
                </div>
              ) : null}
            </div>
          ) : null}
          {scoped ? (
            <p className="mt-3 t-meta">
              Buscando “{filters.q}” en {scoped}.{" "}
              <CatalogLink href={catalogHref({ cities: [], conditions: [], advanced: {}, sort: filters.sort, q: filters.q })} rel="nofollow" focusId={RESULTS_STATUS_ID} className="link font-semibold">
                Buscar en todo el catálogo
              </CatalogLink>
            </p>
          ) : null}
          <hr className="mt-4 border-line-deco" />

          <div className="mt-6 lg:grid lg:grid-cols-[272px_minmax(0,1fr)] lg:items-start lg:gap-8">
            <ListingFilters filters={filters} scope={scope} facets={facets} />
            <CatalogResults className="min-w-0">
              {error ? (
                <div role="alert" className={noticeClassName("danger")}>
                  <NoticeIcon tone="danger" />
                  <div className="min-w-0 flex-1">
                    <p>No pudimos cargar las publicaciones. Vuelve a intentarlo en unos minutos.</p>
                    {/* A full load of the same URL. */}
                    <a href={retryHref} className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-3" })}>
                      Reintentar
                    </a>
                  </div>
                </div>
              ) : listings.length === 0 ? (
                applied.length > 0 ? (
                  <div className="flex flex-col gap-8">
                    <EmptyState
                      title="No encontramos resultados"
                      description={
                        rescue?.ways.length ? (
                          <>
                            <p>Prueba sin uno de tus filtros:</p>
                            <ul className="mt-3 flex flex-wrap gap-2">
                              {rescue.ways.map((way) => (
                                <li key={way.chip.key}>
                                  <CatalogLink href={way.chip.href} rel="nofollow" focusId={RESULTS_STATUS_ID} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                                    Sin {way.chip.text.startsWith("“") ? way.chip.text : `“${way.chip.text}”`} hay {formatNumber(way.count)}
                                  </CatalogLink>
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : (
                          "Prueba quitar un filtro o buscar con otras palabras."
                        )
                      }
                      actions={
                        <>
                          <CatalogLink href={clearHref} focusId={RESULTS_STATUS_ID} className={buttonClasses({ variant: "quiet" })}>
                            Limpiar filtros
                          </CatalogLink>
                          {alertFilters ? <p className="w-full t-ui text-ink-2">¿Lo quieres igual? Te avisamos cuando aparezca.</p> : null}
                          <CreateSearchAlert filters={alertFilters} variant="inline" />
                        </>
                      }
                    />
                    {rescue?.closest.length ? (
                      <section aria-labelledby="mas-parecido">
                        <h2 id="mas-parecido" className="t-section text-ink">{rescue.closestLabel}</h2>
                        <ul className={cn(LISTING_GRID, "mt-3")}>
                          {rescue.closest.map((listing) => (
                            <li key={listing.id} className="min-w-0">
                              <ListingCard listing={listing} headingLevel={3} sizes={LISTING_GRID_SIZES} />
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                  </div>
                ) : (
                  emptyState
                )
              ) : (
                <CatalogTrail href={trailHref} label={title}>
                  <div className={LISTING_GRID}>
                    {listings.map((listing, index) => (
                      <ListingCard key={listing.id} listing={listing} eager={index < 4} sizes={LISTING_GRID_SIZES} compare />
                    ))}
                    {narrowed && alertFilters && lastPage ? (
                      <div className="col-span-2 flex flex-col items-start justify-center gap-3 rounded-panel bg-canvas p-6">
                        <h2 className="t-section text-ink">¿No está lo que buscas?</h2>
                        <p className="max-w-[48ch] t-ui text-ink-2">Guarda esta búsqueda y te avisamos por correo cuando se publique algo nuevo que coincida.</p>
                        <CreateSearchAlert filters={alertFilters} variant="inline" />
                      </div>
                    ) : null}
                  </div>
                  <CatalogLoadMore filters={filters} page={page} total={totalCount} />
                  <Pagination page={page} total={totalCount} path={path} params={params} phoneLoadMore />
                </CatalogTrail>
              )}
            </CatalogResults>
          </div>
          <RecentlyViewed className="mt-12" />
          {after}
        </PageContainer>
      </div>
      <CompareTray />
    </CatalogNavigation>
  );
}
