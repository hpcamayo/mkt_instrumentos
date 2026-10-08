"use client";

import { Check, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { CatalogLink } from "@/components/catalog-navigation";
import { useDisclosure } from "@/components/use-disclosure";
import { buttonClasses } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { catalogHref, withSort, type CatalogScope } from "@/lib/catalog-filters";
import { sortOptions, type ListingFilters } from "@/lib/listings";
import { cn } from "@/lib/utils";

// Sort (UX-3 § Sort): the three orders as links (REL-004 values, unchanged). Desktop: a disclosure button
// "Ordenar: Más recientes" with the shell menu rules. Phones and tablets: "Ordenar" opens a sheet; a choice applies
// at once. Sort is never a filter chip.
function SortOptions({ filters, scope, focusId, onChoose, rowClassName }: { filters: ListingFilters; scope: CatalogScope; focusId: string; onChoose: () => void; rowClassName: string }) {
  return (
    <ul>
      {sortOptions.map((option) => {
        const chosen = option.value === filters.sort;
        return (
          <li key={option.value}>
            <CatalogLink
              href={catalogHref(withSort(filters, option.value), scope)}
              aria-current={chosen ? "true" : undefined}
              focusId={focusId}
              onNavigate={onChoose}
              className={cn("flex items-center justify-between gap-3 text-ink transition-colors duration-120 hover:bg-canvas", chosen && "font-semibold", rowClassName)}
            >
              {option.label}
              {chosen ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
            </CatalogLink>
          </li>
        );
      })}
    </ul>
  );
}

export function SortMenu({ filters, scope }: { filters: ListingFilters; scope: CatalogScope }) {
  const { open, toggle, close, buttonRef, panelRef } = useDisclosure("orden");
  const current = sortOptions.find((option) => option.value === filters.sort) ?? sortOptions[0];
  return (
    <div className="relative">
      <button
        ref={buttonRef}
        id="orden-boton"
        type="button"
        aria-expanded={open}
        aria-controls="menu-orden"
        onClick={toggle}
        className={buttonClasses({ variant: "secondary", size: "sm" })}
      >
        <span className="font-normal text-ink-2">Ordenar:</span>
        {current.label}
        <ChevronDown aria-hidden className={cn("transition-transform duration-120", open && "rotate-180")} />
      </button>
      {open ? (
        <div ref={panelRef} id="menu-orden" className="surface-light menu-fade absolute right-0 top-full z-30 mt-1 w-56 rounded-panel border border-line-deco bg-surface py-1 shadow-level-1">
          <SortOptions filters={filters} scope={scope} focusId="orden-boton" onChoose={() => close()} rowClassName="min-h-9 px-3 t-ui" />
        </div>
      ) : null}
    </div>
  );
}

export function SortSheetButton({ filters, scope }: { filters: ListingFilters; scope: CatalogScope }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dismiss = () => {
    setOpen(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };
  return (
    <>
      <button
        ref={buttonRef}
        id="orden-boton-movil"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={buttonClasses({ variant: "secondary", block: true })}
      >
        Ordenar
        <ChevronDown aria-hidden />
      </button>
      {open ? (
        <Sheet title="Ordenar" closeLabel="Cerrar orden" onDismiss={dismiss}>
          <SortOptions filters={filters} scope={scope} focusId="orden-boton-movil" onChoose={() => setOpen(false)} rowClassName="-mx-4 min-h-11 px-4 t-body" />
        </Sheet>
      ) : null}
    </>
  );
}
