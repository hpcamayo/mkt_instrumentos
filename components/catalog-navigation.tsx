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
type CatalogNavigationValue = { pending: boolean; navigate: (href: string, options?: { focusId?: string }) => void };

const CatalogNavigationContext = createContext<CatalogNavigationValue | null>(null);

// An element to focus once the next page has committed (the results count, after the filter sheet applies). Module
// state: the page's subtree, this provider included, mounts again for every catalog URL.
let focusAfterNavigation: string | null = null;

export function CatalogNavigation({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = useCallback((href: string, options?: { focusId?: string }) => {
    focusAfterNavigation = options?.focusId ?? null;
    startTransition(() => router.push(href));
  }, [router]);
  // Next focuses the new page's first node, which is not focusable here; keyboard users keep their place instead
  // (the option they chose, or the results count). No scroll: Next has already brought the page's top into view.
  useEffect(() => {
    if (pending || !focusAfterNavigation) return;
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
export function CatalogLink({ href, onNavigate, prefetch = false, focusId, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string; focusId?: string }) {
  const navigation = useCatalogNavigation();
  return (
    <Link
      href={href}
      prefetch={prefetch}
      onNavigate={(event) => {
        onNavigate?.(event);
        if (!navigation) return;
        event.preventDefault();
        navigation.navigate(href, { focusId: focusId ?? props.id });
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
      <div aria-busy={pending || undefined} className={cn("catalog-results", className)}>
        {children}
      </div>
    </>
  );
}
