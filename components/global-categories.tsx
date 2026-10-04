"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageContainer } from "@/components/page-container";
import { currentStripKey, stripItems } from "@/lib/shell";
import { cn } from "@/lib/utils";

// The category strip (docs/ux-redesign/ux-2-shell.md): "Instrumentos", the top-level categories in taxonomy
// order and "Tiendas verificadas". Links only, built from the canonical taxonomy in lib/shell.ts; the instrument
// types live on each category page. It scrolls sideways when it does not fit; the current item has a 3 px blue
// underline and aria-current.
export function GlobalCategories({ visibility }: { visibility: "all" | "wide" }) {
  return (
    <nav aria-label="Categorías" className={cn("border-b border-line-deco bg-surface", visibility === "wide" && "hidden md:block")}>
      <PageContainer className="px-0 sm:px-0 lg:px-0">
        <Suspense fallback={<StripList current={null} />}>
          <CurrentStrip />
        </Suspense>
      </PageContainer>
    </nav>
  );
}

function CurrentStrip() {
  const pathname = usePathname();
  const params = useSearchParams();
  return <StripList current={currentStripKey(pathname, params)} />;
}

function StripList({ current }: { current: string | null }) {
  return (
    // Links carry 4 px of side padding for an inset focus ring, so the list pads 4 px less than the page gutter.
    <ul className="scrollbar-none flex h-11 items-stretch gap-3 overflow-x-auto px-3 sm:px-5 md:h-12 md:gap-[18px] lg:px-7">
      {stripItems.map((item) => {
        const isCurrent = item.key === current;
        return (
          <li key={item.key} className={cn("flex shrink-0", item.key === "verified_stores" && "md:ml-auto")}>
            {item.key === "verified_stores" ? (
              // A full navigation applies this query on the current catalog route reliably.
              <a
                href={item.href}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "inline-flex items-center whitespace-nowrap px-1 text-[14px] font-semibold leading-5 transition-colors duration-120 focus-visible:outline-offset-[-2px]",
                  isCurrent ? "text-ink shadow-[inset_0_-3px_0_var(--accent)]" : "text-ink-2 hover:text-ink md:text-ink",
                )}
              >
                {item.label}
              </a>
            ) : (
              <Link
                href={item.href}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "inline-flex items-center whitespace-nowrap px-1 text-[14px] font-semibold leading-5 transition-colors duration-120 focus-visible:outline-offset-[-2px]",
                  isCurrent ? "text-ink shadow-[inset_0_-3px_0_var(--accent)]" : "text-ink-2 hover:text-ink md:text-ink",
                )}
              >
                {item.label}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
