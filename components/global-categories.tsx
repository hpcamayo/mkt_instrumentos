"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/page-container";
import { useStripCurrent } from "@/components/strip-current";
import { useDisclosureGroup } from "@/components/use-disclosure";
import { BRANDS_ANCHOR, categoryBrandHref } from "@/lib/category-nav";
import { categoryMenus, currentStripKey, stripItems, type CategoryMenu } from "@/lib/shell";
import { cn } from "@/lib/utils";

// The category strip (docs/ux-redesign/ux-2-shell.md, amended 3 Oct for N12): "Instrumentos", the eight categories
// and "Tiendas verificadas" in the UX-2 strip. "Instrumentos" and "Tiendas verificadas" are links; each category is a
// disclosure button whose panel offers "Ver todos" (the category landing) and that category's canonical instrument
// types (lib/shell.ts categoryMenus). The panel spans the page under the strip; on phones it is a stacked list.
// One panel at a time; Esc returns focus to its button; an outside press, a choice or a route change closes it.
// From 768 px the panel also shows each type's subtypes and the category's leading catalog brands
// (docs/ux-redesign/category-navigation.md); phones keep the compact list plus the first brands.
type MenuBrands = Record<string, string[]>;

export function GlobalCategories({ visibility, brands = {} }: { visibility: "all" | "wide"; brands?: MenuBrands }) {
  return (
    <nav aria-label="Categorías" className={cn("border-b border-line-deco bg-surface", visibility === "wide" && "hidden md:block")}>
      <Suspense fallback={<CategoryStrip current={null} brands={brands} />}>
        <CurrentStrip brands={brands} />
      </Suspense>
    </nav>
  );
}

function CurrentStrip({ brands }: { brands: MenuBrands }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const pageCurrent = useStripCurrent();
  return <CategoryStrip current={pageCurrent ?? currentStripKey(pathname, params)} brands={brands} />;
}

const ITEM = "inline-flex items-center whitespace-nowrap px-1 text-[14px] font-semibold leading-5 transition-colors duration-120 focus-visible:outline-offset-[-2px]";
const UNDERLINE_CURRENT = "text-ink shadow-[inset_0_-3px_0_var(--accent)]";
const QUIET = "text-ink-2 hover:text-ink md:text-ink";

function CategoryStrip({ current, brands }: { current: string | null; brands: MenuBrands }) {
  const group = useDisclosureGroup("category-strip");
  const open = categoryMenus.find((menu) => menu.key === group.openKey) ?? null;

  return (
    <div ref={group.containerRef} className="relative">
      <PageContainer className="px-0 sm:px-0 lg:px-0">
        {/* Items carry 4 px of side padding for an inset focus ring, so the list pads 4 px less than the page gutter. */}
        <ul className="scrollbar-none flex h-11 items-stretch gap-3 overflow-x-auto px-3 sm:px-5 md:h-12 md:gap-[18px] lg:px-7">
          {stripItems.map((item) => {
            const isCurrent = item.key === current;
            const isOpen = item.key === group.openKey;
            return (
              <li key={item.key} className={cn("flex shrink-0", item.key === "verified_stores" && "md:ml-auto")}>
                {item.kind === "category" ? (
                  <button
                    ref={group.buttonRef(item.key)}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId(item.key)}
                    aria-current={isCurrent ? "true" : undefined}
                    onClick={() => group.toggle(item.key)}
                    className={cn(ITEM, "gap-0.5", isOpen ? "text-ink shadow-[inset_0_-3px_0_var(--ink)]" : isCurrent ? UNDERLINE_CURRENT : QUIET)}
                  >
                    {item.label}
                    <ChevronDown aria-hidden="true" className={cn("h-3 w-3 shrink-0", isOpen && "rotate-180")} />
                  </button>
                ) : null}
                {/* The panel follows its button in the markup, so Tab goes from the button into the panel. It is
                    positioned against the strip container, outside the list's scroll clipping. */}
                {item.kind === "category" && open?.key === item.key ? <CategoryPanel menu={open} brands={brands[open.key]} onChoose={() => group.close()} /> : null}
                {item.kind === "link" ? (
                  <Link href={item.href} aria-current={isCurrent ? "page" : undefined} className={cn(ITEM, isCurrent ? UNDERLINE_CURRENT : QUIET)}>
                    {item.label}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      </PageContainer>
    </div>
  );
}

function panelId(key: string) {
  return `categoria-${key.replace(/[^a-z0-9]+/gi, "-")}`;
}

// "Ver todos" and the category's types; from 768 px each type's subtypes; the category's leading brands with "Ver
// todas las marcas" (the landing's brand section). Exported for tests.
const PANEL_LINK = "-mx-2 flex min-h-11 items-center rounded-control px-2 t-ui transition-colors duration-120 hover:bg-canvas md:min-h-9";
// Brands shown on phones, where the panel is a stacked list; the rest from 768 px.
const PHONE_BRANDS = 5;

export function CategoryPanel({ menu, brands = [], onChoose }: { menu: CategoryMenu; brands?: readonly string[]; onChoose?: () => void }) {
  const detailed = menu.types.filter((type) => type.subtypes.length > 0);
  // Every category has a landing (lib/category-pages.ts), which lists all its brands.
  const allBrands = `${menu.href}#${BRANDS_ANCHOR}`;
  return (
    <div id={panelId(menu.key)} className="menu-fade absolute inset-x-0 top-full z-40 border-b border-line-deco bg-surface shadow-level-1">
      <PageContainer className="py-3 md:py-6">
        <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
          <div>
            <p className="t-micro text-ink-2">{menu.label}</p>
            <Link href={menu.href} onClick={onChoose} className="link mt-1 inline-flex min-h-11 items-center t-ui font-semibold md:min-h-9">
              Ver todos
            </Link>
            <p className="t-micro mt-3 text-ink-2">Tipos</p>
            <ul className="mt-1">
              {menu.types.map((type) => (
                <li key={type.value}>
                  <Link href={type.href} onClick={onChoose} className={cn(PANEL_LINK, "font-semibold text-ink")}>
                    {type.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {/* Phones show only the brands here; without brands the column is for 768 px and up. */}
          <div className={cn(brands.length > 0 ? "grid" : "hidden md:grid", "gap-3 border-t border-subtle pt-3 md:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:gap-x-6 md:gap-y-5 md:border-l md:border-t-0 md:pl-8 md:pt-0")}>
            {detailed.map((type) => (
              <section key={type.value} aria-label={type.label} className="hidden md:block">
                <p className="t-micro text-ink-2">{detailed.length > 1 ? type.label : "Explora"}</p>
                <ul className="mt-1">
                  {type.subtypes.map((subtype) => (
                    <li key={subtype.href}>
                      <Link href={subtype.href} onClick={onChoose} className={cn(PANEL_LINK, "text-ink")}>{subtype.label}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {brands.length > 0 ? (
              <section aria-label={`Marcas de ${menu.label.toLowerCase()}`}>
                <p className="t-micro text-ink-2">Marcas</p>
                <ul className="mt-1">
                  {brands.map((brand, index) => (
                    <li key={brand} className={cn(index >= PHONE_BRANDS && "hidden md:block")}>
                      <Link href={categoryBrandHref(menu.key, brand)} onClick={onChoose} className={cn(PANEL_LINK, "text-ink")}>{brand}</Link>
                    </li>
                  ))}
                </ul>
                <Link href={allBrands} onClick={onChoose} className="link mt-1 inline-flex min-h-11 items-center t-ui font-semibold md:min-h-9">
                  Ver todas las marcas
                </Link>
              </section>
            ) : null}
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
