"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { PageContainer } from "@/components/page-container";
import { getInstrumentTypeOptions } from "@/lib/listing-submission";
import { categoryOptions } from "@/lib/listings";
import { categoryLandingPath, categoryTypePath } from "@/lib/category-pages";

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
    <nav aria-label="Categorías del marketplace" className="relative border-b border-subtle bg-white">
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
              className="flex min-h-11 w-full items-center justify-between rounded-control px-3 py-2 text-left font-semibold text-ink"
            >
              Explorar categorías
              <ChevronDown aria-hidden="true" className={`h-4 w-4 transition ${mobileOpen ? "rotate-180" : ""}`} />
            </button>
            {mobileOpen ? (
              <div id="mobile-marketplace-categories" className="mt-2 grid gap-1 border-t border-subtle pt-2">
                <div className="flex justify-end">
                  <button type="button" onClick={closeAll} className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-semibold text-ink-2">
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
                    className={`inline-flex min-h-11 items-center gap-1 rounded-control px-3 py-2 text-sm font-semibold ${expanded ? "bg-accent-tint text-ink" : "text-ink hover:bg-canvas"}`}
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
    <div id={`category-panel-${slugify(category.value)}`} className="absolute inset-x-0 top-full z-40 hidden border-y border-subtle bg-white shadow-level-1 lg:block">
      <PageContainer className="py-6">
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="border-r border-subtle pr-6">
            <p className="t-micro text-ink-2">{category.label}</p>
            <Link href={categoryHref(category.value)} onClick={onNavigate} className="mt-3 inline-flex min-h-11 items-center font-semibold text-ink underline decoration-action decoration-2 underline-offset-4">
              Ver todo en {category.label.toLowerCase()}
            </Link>
          </div>
          <div>
            <p className="t-micro text-ink-2">Tipos disponibles</p>
            <ul className="mt-3 grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
              {types.map((type) => (
                <li key={type.value}>
                  <Link href={typeHref(category.value, type.value)} onClick={onNavigate} className="flex min-h-11 items-center rounded-control px-3 py-2 text-sm font-semibold text-ink hover:bg-canvas hover:text-ink hover:underline hover:decoration-accent hover:decoration-2">
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
    <div className="border-b border-subtle last:border-b-0">
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle} className="flex min-h-11 w-full items-center justify-between rounded-control px-3 py-2 text-left text-sm font-semibold text-ink">
        {category.label}
        <ChevronDown aria-hidden="true" className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <ul id={panelId} className="mb-2 grid gap-1 border-l-2 border-accent/20 pl-3">
          <li><Link href={categoryHref(category.value)} onClick={onNavigate} className="flex min-h-11 items-center rounded-control px-3 py-2 t-ui font-semibold text-ink underline decoration-accent decoration-2 underline-offset-4">Ver todo</Link></li>
          {getInstrumentTypeOptions(category.value).map((type) => (
            <li key={type.value}><Link href={typeHref(category.value, type.value)} onClick={onNavigate} className="flex min-h-11 items-center rounded-control px-3 py-2 text-sm font-semibold text-ink hover:bg-canvas">{type.label}</Link></li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function categoryHref(category: string) {
  return categoryLandingPath(category);
}

function typeHref(category: string, instrumentType: string) {
  return categoryTypePath(category, instrumentType);
}

function slugify(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}
