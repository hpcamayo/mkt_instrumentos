"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input, Radio, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { CountBadge } from "@/components/ui/tag";
import { categoryOptions } from "@/lib/listings";
import {
  CATALOG_FILTERS,
  CATALOG_MATCHING_AVAILABLE,
  DEFAULT_FILTERS,
  INVENTORY_NO_CATEGORY,
  PRICE_FILTERS,
  PUBLICATION_FILTERS,
  SORTS,
  STOCK_FILTERS,
  activeFilterCount,
  inventoryHref,
  type InventoryFilters,
} from "@/lib/store-inventory";

// Search (SKU, marca, modelo, nombre), filters in a sheet and the sort (design §13.1). Everything lives in the URL, so
// a filtered view can be reloaded or shared with the same result and the server reads one page at a time. The list
// follows the search box as the owner types (fix-06): a pause of SEARCH_DELAY_MS pushes the URL, so the browser
// history keeps one entry per search rather than one per letter. "Buscar" still submits at once.
const SEARCH_DELAY_MS = 350;

export function InventoryToolbar({ filters }: { filters: InventoryFilters }) {
  const router = useRouter();
  const searchId = useId();
  const sortId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(filters.q);
  useEffect(() => { setQuery(filters.q); }, [filters.q]);
  const filterButton = useRef<HTMLButtonElement>(null);
  const typing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applied = activeFilterCount(filters);

  useEffect(() => () => { if (typing.current) clearTimeout(typing.current); }, []);

  function searchAsYouType(value: string) {
    if (typing.current) clearTimeout(typing.current);
    const q = value.trim();
    if (q === filters.q) return;
    typing.current = setTimeout(() => router.push(inventoryHref({ ...filters, q }), { scroll: false }), SEARCH_DELAY_MS);
  }

  function dismiss() {
    setOpen(false);
    requestAnimationFrame(() => filterButton.current?.focus());
  }

  return (
    <div className="grid gap-3 border-b border-subtle p-4 md:p-5">
      <div className="flex flex-wrap items-end gap-3">
        <form
          role="search"
          className="flex min-w-0 flex-1 basis-64 items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (typing.current) clearTimeout(typing.current);
            const q = String(new FormData(event.currentTarget).get("q") ?? "").trim();
            router.push(inventoryHref({ ...filters, q }));
          }}
        >
          <Field id={searchId} label="Buscar en tu inventario" labelClassName="sr-only" className="min-w-0 flex-1">
            <Input name="q" type="search" data-inventory-search="" aria-keyshortcuts="/ Control+K Meta+K" value={query} maxLength={100} placeholder="SKU, marca, modelo, nombre o código" onChange={(event) => { setQuery(event.target.value); searchAsYouType(event.target.value); }} />
          </Field>
          <Button type="submit" variant="secondary" icon={<Search aria-hidden />}>Buscar</Button>
        </form>
        <button ref={filterButton} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className={buttonClasses({ variant: "secondary" })}>
          <SlidersHorizontal aria-hidden />
          Filtrar
          <CountBadge count={applied} label={`${applied} ${applied === 1 ? "filtro aplicado" : "filtros aplicados"}`} />
        </button>
        <div className="flex items-center gap-2">
          <label htmlFor={sortId} className="t-ui font-semibold text-ink">Ordenar</label>
          <Select id={sortId} value={filters.sort} onChange={(event) => router.push(inventoryHref({ ...filters, sort: event.target.value as InventoryFilters["sort"] }))}>
            {SORTS.map((sort) => <option key={sort.value} value={sort.value}>{sort.label}</option>)}
          </Select>
        </div>
      </div>
      {applied || filters.q ? (
        <p className="t-meta">
          {describe(filters)} <Link href={inventoryHref({ ...DEFAULT_FILTERS, sort: filters.sort })} className="link font-semibold">Quitar búsqueda y filtros</Link>
        </p>
      ) : null}
      {open ? <FilterSheet filters={filters} onDismiss={dismiss} onApply={(href) => { setOpen(false); router.push(href); }} /> : null}
    </div>
  );
}

function describe(filters: InventoryFilters) {
  const parts = [
    filters.q ? `“${filters.q}”` : null,
    filters.stock !== "all" ? STOCK_FILTERS.find((entry) => entry.value === filters.stock)?.label : null,
    filters.publication ? PUBLICATION_FILTERS.find((entry) => entry.value === filters.publication)?.label : null,
    filters.catalog ? CATALOG_FILTERS.find((entry) => entry.value === filters.catalog)?.label : null,
    filters.category === INVENTORY_NO_CATEGORY ? "Sin categoría"
      : filters.category ? categoryOptions.find((entry) => entry.value === filters.category)?.label ?? filters.category : null,
    filters.price ? PRICE_FILTERS.find((entry) => entry.value === filters.price)?.label : null,
  ].filter(Boolean);
  return `Mostrando: ${parts.join(" · ")}.`;
}

function FilterSheet({ filters, onDismiss, onApply }: { filters: InventoryFilters; onDismiss: () => void; onApply: (href: string) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(filters);
  return (
    <Sheet
      title="Filtrar inventario"
      closeLabel="Cerrar filtros"
      onDismiss={onDismiss}
      layout="responsive"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setDraft({ ...draft, stock: "all", publication: "", catalog: "", category: "", price: "" })}>Limpiar</Button>
          <Button onClick={() => onApply(inventoryHref(draft))}>Ver resultados</Button>
        </div>
      }
    >
      <div className="grid gap-5 pt-4">
        <fieldset className="grid gap-0.5">
          <legend className="t-ui font-semibold text-ink">Stock</legend>
          {STOCK_FILTERS.map((entry) => <Radio key={entry.value} name={`${id}-stock`} label={entry.label} checked={draft.stock === entry.value} onChange={() => setDraft({ ...draft, stock: entry.value })} />)}
        </fieldset>
        <fieldset className="grid gap-0.5">
          <legend className="t-ui font-semibold text-ink">Publicación</legend>
          {PUBLICATION_FILTERS.map((entry) => <Radio key={entry.value || "any"} name={`${id}-publicacion`} label={entry.label} checked={draft.publication === entry.value} onChange={() => setDraft({ ...draft, publication: entry.value })} />)}
        </fieldset>
        <Field id={`${id}-categoria`} label="Categoría" hint="La de la publicación; si el SKU no tiene publicación, la del SKU.">
          <Select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
            <option value="">Todas las categorías</option>
            {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            <option value={INVENTORY_NO_CATEGORY}>Sin categoría</option>
          </Select>
        </Field>
        <fieldset className="grid gap-0.5">
          <legend className="t-ui font-semibold text-ink">Precio</legend>
          {PRICE_FILTERS.map((entry) => <Radio key={entry.value || "any"} name={`${id}-precio`} label={entry.label} checked={draft.price === entry.value} onChange={() => setDraft({ ...draft, price: entry.value })} />)}
        </fieldset>
        {CATALOG_MATCHING_AVAILABLE ? (
          <fieldset className="grid gap-0.5">
            <legend className="t-ui font-semibold text-ink">Catálogo</legend>
            {CATALOG_FILTERS.map((entry) => <Radio key={entry.value || "any"} name={`${id}-catalogo`} label={entry.label} checked={draft.catalog === entry.value} onChange={() => setDraft({ ...draft, catalog: entry.value })} />)}
          </fieldset>
        ) : null}
      </div>
    </Sheet>
  );
}
