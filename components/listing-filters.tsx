import { Check } from "lucide-react";
import { CatalogLink } from "@/components/catalog-navigation";
import { BrandFilterForm, PriceFilterForm } from "@/components/catalog-filter-forms";
import { ChipLink } from "@/components/ui/chip";
import {
  catalogFacets,
  catalogHref,
  filterOptionId,
  withFacetValue,
  type CatalogScope,
  type ChoiceFacet,
} from "@/lib/catalog-filters";
import type { ListingFilters as ListingFiltersType } from "@/lib/listings";
import { cn } from "@/lib/utils";

// The desktop filter column (1024 px and up; UX-3 § Filters, Q7 A): live facets, each option a link to the catalog
// with that value set or cleared, so it works without JavaScript and every filtered URL stays noindex (SEO-003/004).
// One-value facets look like radio rows, several-value facets (condition and location, F11) like checkbox rows, and
// short attribute values are chips; the chosen option carries aria-current and its dot or check. Phones and tablets
// use the sheet (components/filter-sheet.tsx).
export function ListingFilters({ filters, scope = {} }: { filters: ListingFiltersType; scope?: CatalogScope }) {
  return (
    <section aria-label="Filtros" className="hidden lg:block">
      {catalogFacets(filters, scope).map((facet) => {
        const key = facet.kind === "choice" ? facet.key : facet.kind;
        const headingId = `filtro-${key}-titulo`;
        return (
          <div key={key} className="border-b border-line-deco py-4 first:pt-0 last:border-b-0">
            <h2 id={headingId} className="t-ui font-semibold text-ink">
              {facet.title}
            </h2>
            {facet.kind === "price" ? (
              <PriceFilterForm filters={filters} scope={scope} id="filtro-precio" />
            ) : facet.kind === "brand" ? (
              <BrandFilterForm filters={filters} scope={scope} id="filtro-marca" labelledBy={headingId} />
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
            <ChipLink href={href(option.value)} selected={chosen(option.value)} className="h-9" id={filterOptionId(facet.key, option.value)}>
              {option.label}
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
        <FacetRow key={option.value} id={filterOptionId(facet.key, option.value)} href={href(option.value)} chosen={chosen(option.value)} shape={facet.multiple ? "check" : "radio"}>
          {option.label}
        </FacetRow>
      ))}
    </ul>
  );
}

// A 36 px row: a circle with an ink dot (one value) or a square with a check (several), so state never relies on color.
function FacetRow({ id, href, chosen, shape, children }: { id: string; href: string; chosen: boolean; shape: "radio" | "check"; children: string }) {
  return (
    <li>
      <CatalogLink
        id={id}
        href={href}
        aria-current={chosen ? "true" : undefined}
        className="-mx-1.5 flex min-h-9 items-center gap-2.5 rounded-control px-1.5 t-ui text-ink transition-colors duration-120 hover:bg-canvas"
      >
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
        <span className={cn("min-w-0", chosen && "font-semibold")}>{children}</span>
      </CatalogLink>
    </li>
  );
}
