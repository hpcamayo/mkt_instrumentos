"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/page-container";
import { useDisclosureGroup } from "@/components/use-disclosure";
import { categoryMenus, currentStripKey, stripItems, type CategoryMenu } from "@/lib/shell";
import { cn } from "@/lib/utils";

// The category strip (docs/ux-redesign/ux-2-shell.md, amended 3 Oct for N12): "Instrumentos", the eight categories
// and "Tiendas verificadas" in the UX-2 strip. "Instrumentos" and "Tiendas verificadas" are links; each category is a
// disclosure button whose panel offers "Ver todos" (the category landing) and that category's canonical instrument
// types (lib/shell.ts categoryMenus). The panel spans the page under the strip; on phones it is a stacked list.
// One panel at a time; Esc returns focus to its button; an outside press, a choice or a route change closes it.
export function GlobalCategories({ visibility }: { visibility: "all" | "wide" }) {
  return (
    <nav aria-label="Categorías" className={cn("border-b border-line-deco bg-surface", visibility === "wide" && "hidden md:block")}>
      <Suspense fallback={<CategoryStrip current={null} />}>
        <CurrentStrip />
      </Suspense>
    </nav>
  );
}

function CurrentStrip() {
  const pathname = usePathname();
  const params = useSearchParams();
  return <CategoryStrip current={currentStripKey(pathname, params)} />;
}

const ITEM = "inline-flex items-center whitespace-nowrap px-1 text-[14px] font-semibold leading-5 transition-colors duration-120 focus-visible:outline-offset-[-2px]";
const UNDERLINE_CURRENT = "text-ink shadow-[inset_0_-3px_0_var(--accent)]";
const QUIET = "text-ink-2 hover:text-ink md:text-ink";

function CategoryStrip({ current }: { current: string | null }) {
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
                {item.kind === "category" && open?.key === item.key ? <CategoryPanel menu={open} onChoose={() => group.close()} /> : null}
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

// "Ver todos" and the category's types. Exported for tests.
export function CategoryPanel({ menu, onChoose }: { menu: CategoryMenu; onChoose?: () => void }) {
  return (
    <div id={panelId(menu.key)} className="menu-fade absolute inset-x-0 top-full z-40 border-b border-line-deco bg-surface shadow-level-1">
      <PageContainer className="py-3 md:py-6">
        <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
          <div>
            <p className="t-micro text-ink-2">{menu.label}</p>
            <Link href={menu.href} onClick={onChoose} className="link mt-1 inline-flex min-h-11 items-center t-ui font-semibold md:min-h-9">
              Ver todos
            </Link>
          </div>
          <div className="border-t border-subtle pt-3 md:border-l md:border-t-0 md:pl-8 md:pt-0">
            <p className="t-micro text-ink-2">Tipos</p>
            <ul className="mt-1 grid sm:grid-cols-[repeat(auto-fill,minmax(180px,220px))] sm:gap-x-6">
              {menu.types.map((type) => (
                <li key={type.value}>
                  <Link
                    href={type.href}
                    onClick={onChoose}
                    className="-mx-2 flex min-h-11 items-center rounded-control px-2 t-ui font-semibold text-ink transition-colors duration-120 hover:bg-canvas md:min-h-9"
                  >
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
