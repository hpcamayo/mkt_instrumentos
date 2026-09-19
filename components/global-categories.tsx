"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { PageContainer } from "@/components/page-container";
import { getInstrumentTypeOptions } from "@/lib/listing-submission";
import { categoryOptions } from "@/lib/listings";

export function GlobalCategories() {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setOpenCategory(null);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) closeAll();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || (!openCategory && !mobileOpen)) return;
      const previousCategory = openCategory;
      closeAll();
      if (previousCategory) triggerRefs.current.get(previousCategory)?.focus();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen, openCategory]);

  function closeAll() {
    setOpenCategory(null);
    setMobileOpen(false);
  }

  function toggleCategory(value: string) {
    setOpenCategory((current) => current === value ? null : value);
  }

  return (
    <nav aria-label="Categorías del marketplace" className="relative border-b border-laria-fog bg-white">
      <div ref={containerRef}>
        <PageContainer className="py-2">
          <div className="lg:hidden">
            <button
              type="button"
              aria-expanded={mobileOpen}
              aria-controls="mobile-marketplace-categories"
              onClick={() => {
                setMobileOpen((current) => !current);
                setOpenCategory(null);
              }}
              className="flex min-h-11 w-full items-center justify-between rounded-md px-3 py-2 text-left font-black text-laria-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laria-blue"
            >
              Explorar categorías
              <ChevronDown aria-hidden="true" className={`h-4 w-4 transition ${mobileOpen ? "rotate-180" : ""}`} />
            </button>
            {mobileOpen ? (
              <div id="mobile-marketplace-categories" className="mt-2 grid gap-1 border-t border-laria-fog pt-2">
                <div className="flex justify-end">
                  <button type="button" onClick={closeAll} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-bold text-laria-text-soft">
                    <X aria-hidden="true" className="h-4 w-4" /> Cerrar
                  </button>
                </div>
                {categoryOptions.map((category) => (
                  <MobileCategory
                    key={category.value}
                    category={category}
                    open={openCategory === category.value}
                    onToggle={() => toggleCategory(category.value)}
                    onNavigate={closeAll}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <ul className="hidden items-center gap-1 lg:flex">
            {categoryOptions.map((category) => {
              const expanded = openCategory === category.value;
              return (
                <li key={category.value}>
                  <button
                    ref={(node) => {
                      if (node) triggerRefs.current.set(category.value, node);
                      else triggerRefs.current.delete(category.value);
                    }}
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`category-panel-${slugify(category.value)}`}
                    onClick={() => toggleCategory(category.value)}
                    className={`inline-flex min-h-11 items-center gap-1 rounded-md px-3 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laria-blue ${expanded ? "bg-laria-blue/10 text-laria-blue" : "text-laria-ink hover:bg-laria-cloud"}`}
                  >
                    {category.label}
                    <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition ${expanded ? "rotate-180" : ""}`} />
                  </button>
                </li>
              );
            })}
          </ul>
        </PageContainer>

        {openCategory ? <DesktopPanel categoryValue={openCategory} onNavigate={closeAll} /> : null}
      </div>
    </nav>
  );
}

function DesktopPanel({ categoryValue, onNavigate }: { categoryValue: string; onNavigate: () => void }) {
  const category = categoryOptions.find((item) => item.value === categoryValue);
  if (!category) return null;
  const types = getInstrumentTypeOptions(category.value);
  return (
    <div id={`category-panel-${slugify(category.value)}`} className="absolute inset-x-0 top-full z-40 hidden border-y border-laria-fog bg-white shadow-[0_18px_38px_rgb(16_18_23/0.12)] lg:block">
      <PageContainer className="py-6">
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="border-r border-laria-fog pr-6">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-laria-blue">{category.label}</p>
            <Link href={categoryHref(category.value)} onClick={onNavigate} className="mt-3 inline-flex min-h-11 items-center font-black text-laria-ink underline decoration-laria-yellow decoration-2 underline-offset-4">
              Ver todo en {category.label.toLowerCase()}
            </Link>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.15em] text-laria-text-soft">Tipos disponibles</p>
            <ul className="mt-3 grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
              {types.map((type) => (
                <li key={type.value}>
                  <Link href={typeHref(category.value, type.value)} onClick={onNavigate} className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-bold text-laria-ink hover:bg-laria-cloud hover:text-laria-blue">
                    {type.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}

function MobileCategory({
  category,
  open,
  onToggle,
  onNavigate,
}: {
  category: (typeof categoryOptions)[number];
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const panelId = `mobile-category-${slugify(category.value)}`;
  return (
    <div className="border-b border-laria-fog last:border-b-0">
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle} className="flex min-h-11 w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-black text-laria-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laria-blue">
        {category.label}
        <ChevronDown aria-hidden="true" className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <ul id={panelId} className="mb-2 grid gap-1 border-l-2 border-laria-blue/20 pl-3">
          <li><Link href={categoryHref(category.value)} onClick={onNavigate} className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-black text-laria-blue">Ver todo</Link></li>
          {getInstrumentTypeOptions(category.value).map((type) => (
            <li key={type.value}><Link href={typeHref(category.value, type.value)} onClick={onNavigate} className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-bold text-laria-ink hover:bg-laria-cloud">{type.label}</Link></li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function categoryHref(category: string) {
  return `/listados?${new URLSearchParams({ category })}`;
}

function typeHref(category: string, instrumentType: string) {
  return `/listados?${new URLSearchParams({ category, instrument_type: instrumentType })}`;
}

function slugify(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}
