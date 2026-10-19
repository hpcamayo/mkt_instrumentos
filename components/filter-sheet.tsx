"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { PriceField } from "@/components/catalog-filter-forms";
import { useCatalogNavigation } from "@/components/catalog-navigation";
import { Button, buttonClasses } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Checkbox, Input, Radio } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { CountBadge } from "@/components/ui/tag";
import { priceShortcuts, readCatalogFacets, type CatalogFacetData } from "@/lib/catalog-facets";
import {
  RESULTS_STATUS_ID,
  catalogFacets,
  catalogHref,
  catalogSearchParams,
  clearedFilters,
  facetSummary,
  formatNumber,
  parsePriceInput,
  withBrand,
  withFacetValue,
  withPrice,
  withZone,
  type CatalogScope,
  type ChoiceFacet,
} from "@/lib/catalog-filters";
import { formatPrice, type ListingFilters } from "@/lib/listings";
import { cn } from "@/lib/utils";

// The phone and tablet filters (below 1024 px; UX-3 § Filters, Q7 A): "Filtrar" opens a sheet whose choices apply
// once, with "Ver resultados". The sheet is controlled and starts from the URL each time it opens, so it never shows
// stale values. Esc, the close button or the backdrop discard the changes and return focus to "Filtrar"; applying
// runs one navigation and moves focus to the results count.
export function FilterSheetButton({ filters, scope, appliedCount, facets = null }: { filters: ListingFilters; scope: CatalogScope; appliedCount: number; facets?: CatalogFacetData | null }) {
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
      {open ? <FilterSheet filters={filters} scope={scope} facets={facets} onDismiss={dismiss} onApply={apply} /> : null}
    </>
  );
}

// FIND 07 (Effortless Laria): the sheet's options show their counts for the draft as it changes, and the button says
// how many results it will show ("Ver 12 resultados"), so an empty combination is visible before it is applied. The
// counts come from /api/catalog/facets; until they arrive (or if they fail) the button keeps its plain words.
function useDraftCounts(draft: ListingFilters, initial: CatalogFacetData | null) {
  const [counts, setCounts] = useState<{ key: string; data: CatalogFacetData | null }>({ key: catalogSearchParams(draft).toString(), data: initial });
  const key = catalogSearchParams({ ...draft, sort: "newest" }).toString();
  useEffect(() => {
    if (key === counts.key) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/catalog/facets?${key}`, { signal: controller.signal });
        const data = response.ok ? readCatalogFacets(await response.json()) : null;
        setCounts({ key, data });
      } catch {
        // Aborted or offline: keep the last counts.
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [key, counts.key]);
  return counts.key === key ? counts.data : null;
}

function FilterSheet({ filters, scope, facets: initialFacets, onDismiss, onApply }: { filters: ListingFilters; scope: CatalogScope; facets: CatalogFacetData | null; onDismiss: () => void; onApply: (href: string) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(filters);
  const [minPrice, setMinPrice] = useState(filters.minPrice?.toString() ?? "");
  const [maxPrice, setMaxPrice] = useState(filters.maxPrice?.toString() ?? "");
  const [brand, setBrand] = useState(filters.brand ?? "");
  const [expanded, setExpanded] = useState<string | null>(null);
  const priced = (() => {
    const low = parsePriceInput(minPrice);
    const high = parsePriceInput(maxPrice);
    const [min, max] = low !== undefined && high !== undefined && low > high ? [high, low] : [low, high];
    return withBrand(withPrice(draft, min, max), brand);
  })();
  const counts = useDraftCounts(priced, initialFacets);
  // Categoría stays in the sheet while the draft changes it, when the page itself has no category.
  const facets = catalogFacets(draft, scope, { categoryFacet: !scope.landing && !filters.category }, counts);
  const choose = (facet: ChoiceFacet, value: string | null) => setDraft((current) => withFacetValue(current, facet.key, value));
  const shortcuts = priceShortcuts(counts?.price ?? null, formatPrice);

  function apply() {
    onApply(catalogHref(priced, scope));
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
            {counts ? (counts.total === 0 ? "Sin resultados" : `Ver ${formatNumber(counts.total)} ${counts.total === 1 ? "resultado" : "resultados"}`) : "Ver resultados"}
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
              {counts?.price ? (
                <p className="clear-both mb-2 t-meta">
                  {counts.price.min === counts.price.max ? `Precio: ${formatPrice(counts.price.min)}` : `De ${formatPrice(counts.price.min)} a ${formatPrice(counts.price.max)}`}
                </p>
              ) : null}
              {shortcuts.length ? (
                <div className="clear-both mb-3 flex flex-wrap gap-2">
                  {shortcuts.map((shortcut) => {
                    const selected = minPrice === (shortcut.min?.toString() ?? "") && maxPrice === (shortcut.max?.toString() ?? "");
                    return (
                      <Chip key={shortcut.label} selected={selected} className="h-11" onClick={() => {
                        setMinPrice(selected ? "" : shortcut.min?.toString() ?? "");
                        setMaxPrice(selected ? "" : shortcut.max?.toString() ?? "");
                      }}>
                        {shortcut.label}
                      </Chip>
                    );
                  })}
                </div>
              ) : null}
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
              {facet.brands?.length ? (
                <div role="group" aria-labelledby={`${sectionId}-titulo`} className="mb-3 flex flex-wrap gap-2">
                  {facet.brands.slice(0, 8).map((item) => {
                    const selected = brand.trim().toLowerCase() === item.brand.toLowerCase();
                    return (
                      <Chip key={item.brand} selected={selected} className="h-11" onClick={() => setBrand(selected ? "" : item.brand)}>
                        {item.brand} <span className="ml-1 font-normal text-ink-2">{formatNumber(item.count)}</span>
                      </Chip>
                    );
                  })}
                </div>
              ) : null}
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
            {facet.zones?.some((zone) => zone.cities.length > 1) ? (
              <div role="group" aria-label="Zonas" className="mb-1 border-b border-line-deco pb-1">
                {facet.zones.filter((zone) => zone.cities.length > 1).map((zone) => (
                  <Checkbox
                    key={zone.key}
                    label={<CountLabel label={`Todo ${zone.label === "Lima y Callao" ? "Lima y Callao" : `el ${zone.label.toLowerCase()}`}`} count={zone.count} />}
                    checked={zone.cities.every((city) => facet.selected.includes(city))}
                    onChange={() => setDraft((current) => withZone(current, zone.cities))}
                  />
                ))}
              </div>
            ) : null}
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
            {option.count !== undefined ? <span className="ml-1.5 font-normal text-ink-2">{formatNumber(option.count)}</span> : null}
          </Chip>
        ))}
      </div>
    );
  }
  if (facet.multiple) {
    return (
      <div role="group" aria-labelledby={`${name}-titulo`} className="mt-1">
        {facet.options.map((option) => (
          <Checkbox key={option.value} label={<CountLabel label={option.label} count={option.count} />} checked={chosen(option.value)} onChange={() => onChoose(facet, option.value)} />
        ))}
      </div>
    );
  }
  return (
    <div role="radiogroup" aria-labelledby={`${name}-titulo`} className="mt-1">
      {facet.allLabel ? <Radio name={name} label={facet.allLabel} checked={facet.selected.length === 0} onChange={() => onChoose(facet, null)} /> : null}
      {facet.options.map((option) => (
        <Radio key={option.value} name={name} label={<CountLabel label={option.label} count={option.count} />} checked={chosen(option.value)} onChange={() => onChoose(facet, option.value)} />
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

// An option's words and, when the counts loaded, how many results it gives.
function CountLabel({ label, count }: { label: string; count?: number }) {
  return (
    <span className="flex w-full items-baseline justify-between gap-3">
      <span>{label}</span>
      {count !== undefined ? <span className="t-meta tabular-nums">{formatNumber(count)}<span className="sr-only"> resultados</span></span> : null}
    </span>
  );
}
