"use client";

import type { FormEvent } from "react";
import { useCatalogNavigation } from "@/components/catalog-navigation";
import { Button } from "@/components/ui/button";
import { controlClasses } from "@/components/ui/field";
import { CATALOG_PATH, catalogHref, catalogSearchParams, parsePriceInput, withBrand, withPrice, type CatalogScope } from "@/lib/catalog-filters";
import type { ListingFilters } from "@/lib/listings";
import { cn } from "@/lib/utils";

// The sidebar's price and brand facets (UX-3 § Filters): small GET forms to /listados that carry every other filter in
// hidden fields, so they work without JavaScript. With it, "Aplicar" navigates in the catalog's transition.
function HiddenFilters({ filters }: { filters: ListingFilters }) {
  return (
    <>
      {[...catalogSearchParams(filters)].map(([name, value], index) => (
        <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

function useApply(scope: CatalogScope) {
  const navigation = useCatalogNavigation();
  return (event: FormEvent<HTMLFormElement>, next: ListingFilters, focusId: string) => {
    if (!navigation) return;
    event.preventDefault();
    navigation.navigate(catalogHref(next, scope), { focusId });
  };
}

const FIELD = cn(controlClasses, "h-9");

export function PriceFilterForm({ filters, scope, id }: { filters: ListingFilters; scope: CatalogScope; id: string }) {
  const apply = useApply(scope);
  return (
    <form
      action={CATALOG_PATH}
      method="get"
      className="mt-2"
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        const low = parsePriceInput(String(data.get("min_price") ?? ""));
        const high = parsePriceInput(String(data.get("max_price") ?? ""));
        // A reversed range is read the way it was meant.
        const [min, max] = low !== undefined && high !== undefined && low > high ? [high, low] : [low, high];
        apply(event, withPrice(filters, min, max), `${id}-aplicar`);
      }}
    >
      <HiddenFilters filters={withPrice(filters, undefined, undefined)} />
      <div className="grid grid-cols-2 gap-2">
        <PriceField id={`${id}-desde`} name="min_price" label="Desde" value={filters.minPrice} />
        <PriceField id={`${id}-hasta`} name="max_price" label="Hasta" value={filters.maxPrice} />
      </div>
      <Button id={`${id}-aplicar`} type="submit" variant="secondary" size="sm" className="mt-2">
        Aplicar
      </Button>
    </form>
  );
}

export function PriceField({ id, name, label, value, onChange, className }: { id: string; name?: string; label: string; value?: number | string; onChange?: (value: string) => void; className?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="t-meta">
        {label}
      </label>
      <div className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 t-ui text-ink-2">
          S/
        </span>
        <input
          id={id}
          name={name}
          inputMode="numeric"
          autoComplete="off"
          {...(onChange ? { value: value ?? "", onChange: (event) => onChange(event.target.value) } : { defaultValue: value })}
          className={cn(FIELD, "pl-9", className)}
        />
      </div>
    </div>
  );
}

export function BrandFilterForm({ filters, scope, id, labelledBy }: { filters: ListingFilters; scope: CatalogScope; id: string; labelledBy: string }) {
  const apply = useApply(scope);
  return (
    <form
      action={CATALOG_PATH}
      method="get"
      className="mt-2"
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        apply(event, withBrand(filters, String(data.get("brand") ?? "")), `${id}-aplicar`);
      }}
    >
      <HiddenFilters filters={withBrand(filters, undefined)} />
      <input id={id} name="brand" type="text" maxLength={200} autoComplete="off" defaultValue={filters.brand} placeholder="Yamaha, Fender…" aria-labelledby={labelledBy} className={FIELD} />
      <Button id={`${id}-aplicar`} type="submit" variant="secondary" size="sm" className="mt-2">
        Aplicar
      </Button>
    </form>
  );
}
