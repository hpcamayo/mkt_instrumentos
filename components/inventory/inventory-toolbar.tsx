"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input, Radio, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { CountBadge } from "@/components/ui/tag";
import { categoryOptions } from "@/lib/listings";
import {
  CATALOG_FILTERS,
  INVENTORY_NO_CATEGORY,
  PUBLICATION_FILTERS,
  SORTS,
  STOCK_FILTERS,
  activeFilterCount,
  inventoryHref,
  type InventoryFilters,
} from "@/lib/store-inventory";

// Search (SKU, marca, modelo, nombre), filters in a sheet and the sort (design §13.1). Everything lives in the URL, so
// a filtered view can be reloaded or shared with the same result and the server reads one page at a time.
export function InventoryToolbar({ filters }: { filters: InventoryFilters }) {
  const router = useRouter();
  const searchId = useId();
  const sortId = useId();
  const [open, setOpen] = useState(false);
  const filterButton = useRef<HTMLButtonElement>(null);
  const applied = activeFilterCount(filters);

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
            const q = String(new FormData(event.currentTarget).get("q") ?? "").trim();
            router.push(inventoryHref({ ...filters, q }));
          }}
        >
          <Field id={searchId} label="Buscar en tu inventario" labelClassName="sr-only" className="min-w-0 flex-1">
            <Input name="q" type="search" defaultValue={filters.q} maxLength={100} placeholder="SKU, marca, modelo o nombre" />
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
          {describe(filters)} <Link href={inventoryHref({ q: "", stock: "all", publication: "", catalog: "", category: "", sort: filters.sort })} className="link font-semibold">Quitar búsqueda y filtros</Link>
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
          <Button variant="secondary" onClick={() => setDraft({ ...draft, stock: "all", publication: "", catalog: "", category: "" })}>Limpiar</Button>
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
        <Field id={`${id}-categoria`} label="Categoría" hint="La de la publicación; si el SKU no tiene, la de su importación.">
          <Select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
            <option value="">Todas las categorías</option>
            {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            <option value={INVENTORY_NO_CATEGORY}>Sin categoría</option>
          </Select>
        </Field>
        <fieldset className="grid gap-0.5">
          <legend className="t-ui font-semibold text-ink">Catálogo</legend>
          {CATALOG_FILTERS.map((entry) => <Radio key={entry.value || "any"} name={`${id}-catalogo`} label={entry.label} checked={draft.catalog === entry.value} onChange={() => setDraft({ ...draft, catalog: entry.value })} />)}
        </fieldset>
      </div>
    </Sheet>
  );
}
