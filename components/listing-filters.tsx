import { Check } from "lucide-react";
import { CatalogLink } from "@/components/catalog-navigation";
import { BrandFilterForm, PriceFilterForm } from "@/components/catalog-filter-forms";
import { ChipLink } from "@/components/ui/chip";
import { priceShortcuts, type CatalogFacetData } from "@/lib/catalog-facets";
import {
  catalogFacets,
  catalogHref,
  filterOptionId,
  formatNumber,
  withBrand,
  withFacetValue,
  withPrice,
  withZone,
  type CatalogScope,
  type ChoiceFacet,
  type FacetOption,
} from "@/lib/catalog-filters";
import { formatPrice, type ListingFilters as ListingFiltersType } from "@/lib/listings";
import { cn } from "@/lib/utils";

// The desktop filter column (1024 px and up; UX-3 § Filters, Q7 A): live facets, each option a link to the catalog
// with that value set or cleared, so it works without JavaScript and every filtered URL stays noindex (SEO-003/004).
// One-value facets look like radio rows, several-value facets (condition and location, F11) like checkbox rows, and
// short attribute values are chips; the chosen option carries aria-current and its dot or check. Phones and tablets
// use the sheet (components/filter-sheet.tsx).
// Effortless Laria: every option shows how many results it gives (FIND 07); an option that gives none is shown but not a
// link, so no click ends on an empty page; places are the cities that have listings, by zone (FIND 05); "Marca" lists the
// leading brands; "Precio" offers shortcuts tuned to what is on sale (FIND 08).
export function ListingFilters({ filters, scope = {}, facets = null }: { filters: ListingFiltersType; scope?: CatalogScope; facets?: CatalogFacetData | null }) {
  return (
    <section aria-label="Filtros" className="hidden lg:block">
      {catalogFacets(filters, scope, {}, facets).map((facet) => {
        const key = facet.kind === "choice" ? facet.key : facet.kind;
        const headingId = `filtro-${key}-titulo`;
        return (
          <div key={key} className="border-b border-line-deco py-4 first:pt-0 last:border-b-0">
            <h2 id={headingId} className="t-ui font-semibold text-ink">
              {facet.title}
            </h2>
            {facet.kind === "price" ? (
              <>
                <PriceShortcuts filters={filters} scope={scope} spread={facet.spread ?? null} />
                <PriceFilterForm filters={filters} scope={scope} id="filtro-precio" />
              </>
            ) : facet.kind === "brand" ? (
              <>
                <BrandRows filters={filters} scope={scope} brands={facet.brands} />
                <BrandFilterForm filters={filters} scope={scope} id="filtro-marca" labelledBy={headingId} />
              </>
            ) : facet.zones?.length ? (
              <ZoneOptions facet={facet} filters={filters} scope={scope} />
            ) : (
              <FacetOptions facet={facet} filters={filters} scope={scope} />
            )}
          </div>
        );
      })}
    </section>
  );
}

function FacetOptions({ facet, filters, scope }: { facet: ChoiceFacet; filters: ListingFiltersType; scope: CatalogScope }) {
  const chosen = (value: string) => facet.selected.includes(value);
  // A chosen chip clears its facet when pressed again; rows and several-value chips toggle or set their value.
  const href = (value: string | null) =>
    catalogHref(withFacetValue(filters, facet.key, value !== null && facet.chips && !facet.multiple && chosen(value) ? null : value), scope);

  if (facet.chips) {
    return (
      <ul className="mt-2 flex flex-wrap gap-2">
        {facet.options.map((option) => (
          <li key={option.value}>
            <ChipLink href={href(option.value)} rel="nofollow" selected={chosen(option.value)} className="h-9" id={filterOptionId(facet.key, option.value)}>
              {option.label}
              {option.count !== undefined ? <span className="ml-1.5 font-normal text-ink-2">{formatNumber(option.count)}</span> : null}
            </ChipLink>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="mt-1.5">
      {facet.allLabel ? (
        <FacetRow id={filterOptionId(facet.key, null)} href={href(null)} chosen={facet.selected.length === 0} shape="radio">
          {facet.allLabel}
        </FacetRow>
      ) : null}
      {facet.options.map((option) => (
        <FacetRow key={option.value} id={filterOptionId(facet.key, option.value)} href={href(option.value)} chosen={chosen(option.value)} shape={facet.multiple ? "check" : "radio"} count={option.count}>
          {option.label}
        </FacetRow>
      ))}
    </ul>
  );
}

// FIND 05: the cities that have listings under their zone ("Lima y Callao", "Norte"…), each zone of two cities or more
// with its "Todo …" row.
function ZoneOptions({ facet, filters, scope }: { facet: ChoiceFacet; filters: ListingFiltersType; scope: CatalogScope }) {
  const byZone = (key: string) => facet.options.filter((option) => option.zone === key);
  const others = facet.options.filter((option) => !facet.zones?.some((zone) => zone.key === option.zone));
  const row = (option: FacetOption, indent: boolean) => (
    <FacetRow key={option.value} id={filterOptionId(facet.key, option.value)} href={catalogHref(withFacetValue(filters, facet.key, option.value), scope)} chosen={facet.selected.includes(option.value)} shape="check" count={option.count} indent={indent}>
      {option.label}
    </FacetRow>
  );
  return (
    <div className="mt-1.5 flex flex-col gap-2">
      {facet.zones?.map((zone) => {
        const cities = byZone(zone.key);
        const all = zone.cities.every((city) => facet.selected.includes(city));
        return (
          <div key={zone.key}>
            <h3 className="t-micro text-ink-2">{zone.label}</h3>
            <ul className="mt-0.5">
              {cities.length > 1 ? (
                <FacetRow id={filterOptionId("zona", zone.key)} href={catalogHref(withZone(filters, zone.cities), scope)} chosen={all} shape="check" count={zone.count}>
                  {`Todo ${zone.label === "Lima y Callao" ? "Lima y Callao" : `el ${zone.label.toLowerCase()}`}`}
                </FacetRow>
              ) : null}
              {cities.map((option) => row(option, cities.length > 1))}
            </ul>
          </div>
        );
      })}
      {others.length ? (
        <div>
          <h3 className="t-micro text-ink-2">Otras</h3>
          <ul className="mt-0.5">{others.map((option) => row(option, false))}</ul>
        </div>
      ) : null}
    </div>
  );
}

// The leading brands among the results, each with its count; "Todas" clears the brand.
function BrandRows({ filters, scope, brands }: { filters: ListingFiltersType; scope: CatalogScope; brands?: { brand: string; count: number }[] }) {
  if (!brands?.length) return null;
  const chosen = (brand: string) => filters.brand?.toLowerCase() === brand.toLowerCase();
  return (
    <ul className="mt-1.5">
      <FacetRow id={filterOptionId("brand", null)} href={catalogHref(withBrand(filters, undefined), scope)} chosen={!filters.brand} shape="radio">
        Todas
      </FacetRow>
      {brands.slice(0, 8).map((item) => (
        <FacetRow key={item.brand} id={filterOptionId("brand", item.brand)} href={catalogHref(withBrand(filters, item.brand), scope)} chosen={chosen(item.brand)} shape="radio" count={item.count}>
          {item.brand}
        </FacetRow>
      ))}
    </ul>
  );
}

// FIND 08: three ranges from what is on sale, and the spread as a hint.
function PriceShortcuts({ filters, scope, spread }: { filters: ListingFiltersType; scope: CatalogScope; spread: CatalogFacetData["price"] }) {
  const shortcuts = priceShortcuts(spread, formatPrice);
  if (!spread) return null;
  return (
    <>
      <p className="mt-1 t-meta">
        {spread.min === spread.max ? `Precio: ${formatPrice(spread.min)}` : `De ${formatPrice(spread.min)} a ${formatPrice(spread.max)}`}
      </p>
      {shortcuts.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {shortcuts.map((shortcut) => {
            const selected = filters.minPrice === shortcut.min && filters.maxPrice === shortcut.max;
            return (
              <li key={shortcut.label}>
                <ChipLink href={catalogHref(selected ? withPrice(filters, undefined, undefined) : withPrice(filters, shortcut.min, shortcut.max), scope)} rel="nofollow" selected={selected} className="h-9" id={filterOptionId("precio", shortcut.label)}>
                  {shortcut.label}
                </ChipLink>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

// A 36 px row: a circle with an ink dot (one value) or a square with a check (several), so state never relies on color.
// With counts, an option that gives no results and is not chosen is shown, dimmed, but not a link (FIND 06, 07).
function FacetRow({ id, href, chosen, shape, count, indent = false, children }: { id: string; href: string; chosen: boolean; shape: "radio" | "check"; count?: number; indent?: boolean; children: string }) {
  const empty = count === 0 && !chosen;
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center border",
          shape === "radio" ? "rounded-full" : "rounded-[3px]",
          chosen ? "border-ink" : "border-line-strong",
          chosen && shape === "check" && "bg-ink",
        )}
      >
        {chosen ? shape === "radio" ? <span className="h-2 w-2 rounded-full bg-ink" /> : <Check className="h-3 w-3 text-white" strokeWidth={3} /> : null}
      </span>
      <span className={cn("min-w-0 flex-1", chosen && "font-semibold")}>{children}</span>
      {count !== undefined ? <span className="shrink-0 t-meta tabular-nums">{formatNumber(count)}<span className="sr-only"> resultados</span></span> : null}
    </>
  );
  if (empty) {
    return (
      <li>
        <span id={id} aria-disabled="true" className={cn("-mx-1.5 flex min-h-9 items-center gap-2.5 px-1.5 t-ui text-ink-2", indent && "pl-6")}>
          {content}
        </span>
      </li>
    );
  }
  return (
    <li>
      <CatalogLink
        id={id}
        href={href}
        rel="nofollow"
        aria-current={chosen ? "true" : undefined}
        className={cn("-mx-1.5 flex min-h-9 items-center gap-2.5 rounded-control px-1.5 t-ui text-ink transition-colors duration-120 hover:bg-canvas", indent && "pl-6")}
      >
        {content}
      </CatalogLink>
    </li>
  );
}
