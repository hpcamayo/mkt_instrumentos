"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type ReactNode } from "react";
import { PriceField } from "@/components/catalog-filter-forms";
import { useCatalogNavigation } from "@/components/catalog-navigation";
import { Button, buttonClasses } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Checkbox, Input, Radio } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { CountBadge } from "@/components/ui/tag";
import {
  RESULTS_STATUS_ID,
  catalogFacets,
  catalogHref,
  clearedFilters,
  facetSummary,
  parsePriceInput,
  withBrand,
  withFacetValue,
  withPrice,
  type CatalogScope,
  type ChoiceFacet,
} from "@/lib/catalog-filters";
import type { ListingFilters } from "@/lib/listings";
import { cn } from "@/lib/utils";

// The phone and tablet filters (below 1024 px; UX-3 § Filters, Q7 A): "Filtrar" opens a sheet whose choices apply
// once, with "Ver resultados". The sheet is controlled and starts from the URL each time it opens, so it never shows
// stale values. Esc, the close button or the backdrop discard the changes and return focus to "Filtrar"; applying
// runs one navigation and moves focus to the results count.
export function FilterSheetButton({ filters, scope, appliedCount }: { filters: ListingFilters; scope: CatalogScope; appliedCount: number }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navigation = useCatalogNavigation();
  const router = useRouter();
  const dismiss = () => {
    setOpen(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };
  const apply = (href: string) => {
    setOpen(false);
    if (navigation) navigation.navigate(href, { focusId: RESULTS_STATUS_ID });
    else router.push(href);
  };
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={buttonClasses({ variant: "secondary", block: true })}
      >
        <SlidersHorizontal aria-hidden />
        Filtrar
        <CountBadge count={appliedCount} label={`${appliedCount} ${appliedCount === 1 ? "filtro aplicado" : "filtros aplicados"}`} />
      </button>
      {open ? <FilterSheet filters={filters} scope={scope} onDismiss={dismiss} onApply={apply} /> : null}
    </>
  );
}

function FilterSheet({ filters, scope, onDismiss, onApply }: { filters: ListingFilters; scope: CatalogScope; onDismiss: () => void; onApply: (href: string) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(filters);
  const [minPrice, setMinPrice] = useState(filters.minPrice?.toString() ?? "");
  const [maxPrice, setMaxPrice] = useState(filters.maxPrice?.toString() ?? "");
  const [brand, setBrand] = useState(filters.brand ?? "");
  const [expanded, setExpanded] = useState<string | null>(null);
  // Categoría stays in the sheet while the draft changes it, when the page itself has no category.
  const facets = catalogFacets(draft, scope, { categoryFacet: !scope.landing && !filters.category });
  const choose = (facet: ChoiceFacet, value: string | null) => setDraft((current) => withFacetValue(current, facet.key, value));

  function apply() {
    const low = parsePriceInput(minPrice);
    const high = parsePriceInput(maxPrice);
    const [min, max] = low !== undefined && high !== undefined && low > high ? [high, low] : [low, high];
    onApply(catalogHref(withBrand(withPrice(draft, min, max), brand), scope));
  }

  function clear() {
    setDraft({ ...clearedFilters(scope), sort: filters.sort });
    setMinPrice("");
    setMaxPrice("");
    setBrand("");
  }

  return (
    <Sheet
      title="Filtros"
      closeLabel="Cerrar filtros"
      onDismiss={onDismiss}
      footer={
        <div className="flex items-center gap-4">
          <Button variant="quiet" onClick={clear}>
            Limpiar
          </Button>
          <Button size="lg" className="flex-1" onClick={apply}>
            Ver resultados
          </Button>
        </div>
      }
    >
      {facets.map((facet) => {
        const key = facet.kind === "choice" ? facet.key : facet.kind;
        const sectionId = `${id}-${key.replace(/\W+/g, "-")}`;
        if (facet.kind === "price") {
          return (
            <fieldset key={key} className="border-b border-line-deco py-4">
              <legend className="float-left mb-2 w-full t-ui font-semibold text-ink">{facet.title}</legend>
              <div className="clear-both grid grid-cols-2 gap-3">
                <PriceField id={`${sectionId}-desde`} label="Desde" value={minPrice} onChange={setMinPrice} className="h-11" />
                <PriceField id={`${sectionId}-hasta`} label="Hasta" value={maxPrice} onChange={setMaxPrice} className="h-11" />
              </div>
            </fieldset>
          );
        }
        if (facet.kind === "brand") {
          return (
            <Disclosure key={key} id={sectionId} title={facet.title} summary={brand.trim() || "Todas"} expanded={expanded === key} onToggle={() => setExpanded(expanded === key ? null : key)}>
              <Input aria-labelledby={`${sectionId}-titulo`} value={brand} maxLength={200} placeholder="Yamaha, Fender…" onChange={(event) => setBrand(event.target.value)} />
            </Disclosure>
          );
        }
        // Tipo and Condición are open in the sheet; the other facets are rows that open in place.
        if (facet.key === "instrument_type" || facet.key === "condition") {
          return (
            <section key={key} aria-labelledby={`${sectionId}-titulo`} className="border-b border-line-deco py-4">
              <h3 id={`${sectionId}-titulo`} className="t-ui font-semibold text-ink">
                {facet.title}
              </h3>
              <FacetControls facet={facet} name={sectionId} onChoose={choose} />
            </section>
          );
        }
        return (
          <Disclosure key={key} id={sectionId} title={facet.title} summary={facetSummary(facet)} expanded={expanded === key} onToggle={() => setExpanded(expanded === key ? null : key)}>
            <FacetControls facet={facet} name={sectionId} onChoose={choose} />
          </Disclosure>
        );
      })}
    </Sheet>
  );
}

// A facet's controls: chips for the type and short values (one choice, aria-pressed), checkboxes for several values,
// radios for one.
function FacetControls({ facet, name, onChoose }: { facet: ChoiceFacet; name: string; onChoose: (facet: ChoiceFacet, value: string | null) => void }) {
  const chosen = (value: string) => facet.selected.includes(value);
  if (facet.chips || facet.key === "instrument_type") {
    return (
      <div role="group" aria-labelledby={`${name}-titulo`} className="mt-2 flex flex-wrap gap-2">
        {facet.options.map((option) => (
          <Chip key={option.value} selected={chosen(option.value)} className="h-11" onClick={() => onChoose(facet, chosen(option.value) && !facet.multiple ? null : option.value)}>
            {option.label}
          </Chip>
        ))}
      </div>
    );
  }
  if (facet.multiple) {
    return (
      <div role="group" aria-labelledby={`${name}-titulo`} className="mt-1">
        {facet.options.map((option) => (
          <Checkbox key={option.value} label={option.label} checked={chosen(option.value)} onChange={() => onChoose(facet, option.value)} />
        ))}
      </div>
    );
  }
  return (
    <div role="radiogroup" aria-labelledby={`${name}-titulo`} className="mt-1">
      {facet.allLabel ? <Radio name={name} label={facet.allLabel} checked={facet.selected.length === 0} onChange={() => onChoose(facet, null)} /> : null}
      {facet.options.map((option) => (
        <Radio key={option.value} name={name} label={option.label} checked={chosen(option.value)} onChange={() => onChoose(facet, option.value)} />
      ))}
    </div>
  );
}

// A row that shows the facet's current value ("Todas", "2 ubicaciones") and opens it in place.
function Disclosure({ id, title, summary, expanded, onToggle, children }: { id: string; title: string; summary: string; expanded: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="border-b border-line-deco">
      <button type="button" aria-expanded={expanded} aria-controls={`${id}-panel`} onClick={onToggle} className="flex min-h-[52px] w-full items-center justify-between gap-3 text-left">
        <span id={`${id}-titulo`} className="t-ui font-semibold text-ink">
          {title}
        </span>
        <span className="flex min-w-0 items-center gap-1 t-meta">
          <span className="truncate">{summary}</span>
          <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-ink transition-transform duration-120", expanded && "rotate-180")} />
        </span>
      </button>
      {expanded ? (
        <div id={`${id}-panel`} className="pb-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}
