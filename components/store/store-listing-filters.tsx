import { BrandFilterForm } from "@/components/catalog-filter-forms";
import { SortMenu, SortSheetButton } from "@/components/sort-control";
import { CatalogLink } from "@/components/catalog-navigation";
import { buttonClasses } from "@/components/ui/button";
import { AppliedChip, ChipLink } from "@/components/ui/chip";
import { appliedFilters, catalogHref, clearedFilters, filterOptionId, withFacetValue, type CatalogScope } from "@/lib/catalog-filters";
import type { ListingFilters } from "@/lib/listings";
import type { storeCategoryChips } from "@/lib/store-storefront";

// find-14: the catalog's own controls inside a store, so a store with hundreds of listings works like a shop window:
// category chips (only the categories the store has, with real counts), the brand box and the sort menu. They are the
// catalog's components with the store page as their base path (CatalogScope.path), so every choice is a URL
// (/tiendas/<slug>?category=…&brand=…&sort=…) that pagination keeps.

export function StoreSortMenu({ filters, scope }: { filters: ListingFilters; scope: CatalogScope }) {
  return (
    <div className="hidden lg:block">
      <SortMenu filters={filters} scope={scope} />
    </div>
  );
}

export function StoreListingFilters({
  filters,
  scope,
  categories,
}: {
  filters: ListingFilters;
  scope: CatalogScope;
  // Null when the categories could not be read: the chips are left out, the brand box and sort stay.
  categories: ReturnType<typeof storeCategoryChips> | null;
}) {
  const total = categories?.reduce((sum, chip) => sum + chip.count, 0) ?? 0;
  const applied = appliedFilters(filters, scope);
  // One category only: a chip row would offer nothing to choose.
  const showChips = categories !== null && (categories.length > 1 || Boolean(filters.category));
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8">
      {showChips ? (
        <nav aria-label="Categorías de la tienda" className="min-w-0">
          <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            <li className="shrink-0">
              <ChipLink id={filterOptionId("tienda-categoria", null)} href={catalogHref(withFacetValue(filters, "category", null), scope)} selected={!filters.category}>
                Todas <span className="t-meta tabular-nums">{total}</span>
              </ChipLink>
            </li>
            {categories.map((chip) => (
              <li key={chip.value} className="shrink-0">
                <ChipLink
                  id={filterOptionId("tienda-categoria", chip.value)}
                  href={catalogHref(withFacetValue(filters, "category", filters.category === chip.value ? null : chip.value), scope)}
                  selected={filters.category === chip.value}
                >
                  {chip.label} <span className="t-meta tabular-nums">{chip.count}</span>
                </ChipLink>
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <div className="hidden lg:block" />
      )}
      <div className="grid gap-3">
        <div className="min-w-0">
          <span id="tienda-marca-titulo" className="t-ui font-semibold text-ink">
            Buscar por marca en esta tienda
          </span>
          <BrandFilterForm filters={filters} scope={scope} id="tienda-marca" labelledBy="tienda-marca-titulo" />
        </div>
        <div className="lg:hidden">
          <SortSheetButton filters={filters} scope={scope} />
        </div>
      </div>
      {applied.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
          <span className="t-meta">Filtros activos:</span>
          {applied.map((chip) => (
            <AppliedChip key={chip.key} href={chip.href} text={chip.text} label={`${chip.facet}: ${chip.value}`} />
          ))}
          <CatalogLink href={catalogHref({ ...clearedFilters(), sort: filters.sort }, scope)} className={buttonClasses({ variant: "quiet", size: "sm" })}>
            Limpiar todo
          </CatalogLink>
        </div>
      ) : null}
    </div>
  );
}
