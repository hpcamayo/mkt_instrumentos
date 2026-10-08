"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useTransition, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Navigation feedback for the catalog and the category landings (UX-3, Q1 A). The catalog has no route-level
// loading.tsx: with one, Next.js 15.5 reused the prefetch entry seeded for /listados when moving to another catalog
// URL, and some of those transitions never committed (docs/ux-redesign/ux-3-discovery.md § The catalog transition
// stall). Instead, the page's own links and forms navigate inside a transition: the current results stay on screen,
// dimmed after 200 ms (`.catalog-results[aria-busy]` in app/globals.css), until the next page commits.
type CatalogNavigationValue = { pending: boolean; navigate: (href: string) => void };

const CatalogNavigationContext = createContext<CatalogNavigationValue | null>(null);

export function CatalogNavigation({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = useCallback((href: string) => startTransition(() => router.push(href)), [router]);
  const value = useMemo(() => ({ pending, navigate }), [pending, navigate]);
  return <CatalogNavigationContext.Provider value={value}>{children}</CatalogNavigationContext.Provider>;
}

export function useCatalogNavigation() {
  return useContext(CatalogNavigationContext);
}

// A client link that reports its navigation to the page's pending state. Outside CatalogNavigation (a store page)
// it is a plain client link. Modified clicks (new tab) keep the browser's behaviour: Next calls onNavigate only for
// in-app navigations.
export function CatalogLink({ href, onNavigate, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const navigation = useCatalogNavigation();
  return (
    <Link
      href={href}
      onNavigate={(event) => {
        onNavigate?.(event);
        if (!navigation) return;
        event.preventDefault();
        navigation.navigate(href);
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
