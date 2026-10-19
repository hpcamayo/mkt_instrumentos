"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useTransition, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Navigation feedback for the catalog and the category landings (UX-3, Q1 A). The catalog has no route-level
// loading.tsx: with one, Next.js 15.5 reused the prefetch entry seeded for /listados when moving to another catalog
// URL, and some of those transitions never committed (docs/ux-redesign/ux-3-discovery.md § The catalog transition
// stall). Instead, the page's own links and forms navigate inside a transition: the current results stay on screen,
// dimmed after 200 ms (`.catalog-results[aria-busy]` in app/globals.css), until the next page commits.
// After the move the page stays where it is (FIX 07): "visible" brings the results into view only when they are
// entirely off-screen (a filter chosen low in the column), "start" brings their first row up when it is above the
// screen (a page link at the end of the grid).
export type ResultsScroll = "visible" | "start";
type NavigateOptions = { focusId?: string; scroll?: ResultsScroll };
type CatalogNavigationValue = { pending: boolean; navigate: (href: string, options?: NavigateOptions) => void };

const CatalogNavigationContext = createContext<CatalogNavigationValue | null>(null);

// An element to focus once the next page has committed (the results count, after the filter sheet applies). Module
// state: the page's subtree, this provider included, mounts again for every catalog URL.
let focusAfterNavigation: string | null = null;
let scrollAfterNavigation: ResultsScroll | null = null;

// The results region (CatalogResults), measured once the next page has committed.
export const RESULTS_REGION_ID = "resultados";

// Where the window should move so the results show: null when no move is needed. Pure, for the tests.
export function resultsScrollTarget(rect: { top: number; bottom: number }, viewportHeight: number, mode: ResultsScroll, offset = 16) {
  const offScreen = rect.bottom <= 0 || rect.top >= viewportHeight;
  if (mode === "visible" ? offScreen : rect.top < 0 || rect.top >= viewportHeight) return rect.top - offset;
  return null;
}

export function CatalogNavigation({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = useCallback((href: string, options?: NavigateOptions) => {
    focusAfterNavigation = options?.focusId ?? null;
    scrollAfterNavigation = options?.scroll ?? "visible";
    // scroll: false keeps the page where it is instead of jumping to the top (FIX 07).
    startTransition(() => router.push(href, { scroll: false }));
  }, [router]);
  // Next focuses the new page's first node, which is not focusable here; keyboard users keep their place instead
  // (the option they chose, or the results count). Then the results come into view if they are off-screen.
  useEffect(() => {
    if (pending) return;
    if (scrollAfterNavigation) {
      const region = document.getElementById(RESULTS_REGION_ID);
      const top = region ? resultsScrollTarget(region.getBoundingClientRect(), window.innerHeight, scrollAfterNavigation) : null;
      if (top !== null) window.scrollBy({ top, behavior: "instant" as ScrollBehavior });
      scrollAfterNavigation = null;
    }
    if (!focusAfterNavigation) return;
    document.getElementById(focusAfterNavigation)?.focus({ preventScroll: true });
    focusAfterNavigation = null;
  }, [pending]);
  const value = useMemo(() => ({ pending, navigate }), [pending, navigate]);
  return <CatalogNavigationContext.Provider value={value}>{children}</CatalogNavigationContext.Provider>;
}

export function useCatalogNavigation() {
  return useContext(CatalogNavigationContext);
}

// A client link that reports its navigation to the page's pending state. Outside CatalogNavigation (a store page)
// it is a plain client link. Modified clicks (new tab) keep the browser's behaviour: Next calls onNavigate only for
// in-app navigations. After the move, focus goes to `focusId`, or to the element with this link's own id (a filter
// option keeps its id on the next page).
// Not prefetched: a catalog page has no loading boundary, so a prefetch would bring only the layout, and a filter
// column holds dozens of links.
export function CatalogLink({ href, onNavigate, prefetch = false, focusId, resultsScroll, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string; focusId?: string; resultsScroll?: ResultsScroll }) {
  const navigation = useCatalogNavigation();
  return (
    <Link
      href={href}
      prefetch={prefetch}
      onNavigate={(event) => {
        onNavigate?.(event);
        if (!navigation) return;
        event.preventDefault();
        navigation.navigate(href, { focusId: focusId ?? props.id, scroll: resultsScroll });
      }}
      {...props}
    />
  );
}

// The results while a catalog navigation is pending: aria-busy, dimmed after 200 ms, and a polite announcement. The
// status sits outside the busy region, which assistive technology would otherwise hold back.
export function CatalogResults({ className, children }: { className?: string; children: ReactNode }) {
  const pending = useCatalogNavigation()?.pending ?? false;
  return (
    <>
      <p role="status" className="sr-only">
        {pending ? "Cargando resultados…" : ""}
      </p>
      <div id={RESULTS_REGION_ID} aria-busy={pending || undefined} className={cn("catalog-results", className)}>
        {children}
      </div>
    </>
  );
}
