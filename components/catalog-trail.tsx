"use client";

import { useEffect, type MouseEvent, type ReactNode } from "react";
import { RESTORE_KEY, RESULTS_KEY, readStore, writeStore, type ResultsTrail } from "@/lib/catalog-device";

const LISTING_PATH = /^\/instrumentos\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

// FIND 09 (Effortless Laria): opening a listing from the results remembers, for this tab only, where the results are,
// the listings in their order (including those "Ver 24 más" added) and the scroll position, so the listing page can
// offer "Volver a resultados" and the previous and next listing (components/catalog-results-return.tsx).
export function CatalogTrail({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  const remember = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest("a");
    const opened = LISTING_PATH.exec(anchor?.getAttribute("href") ?? "")?.[1];
    if (!opened) return;
    const slugs: string[] = [];
    const titles: Record<string, string> = {};
    for (const link of event.currentTarget.querySelectorAll<HTMLAnchorElement>("article a[href^='/instrumentos/']")) {
      const slug = LISTING_PATH.exec(link.getAttribute("href") ?? "")?.[1];
      if (!slug || titles[slug]) continue;
      slugs.push(slug);
      titles[slug] = link.textContent?.trim() ?? "";
    }
    const trail: ResultsTrail = { href, label, slugs, titles, scrollY: window.scrollY, at: Date.now(), opened };
    writeStore(RESULTS_KEY, trail, "session");
  };
  // Back from a listing through "Volver a resultados" (not the browser's back): the remembered place, once.
  useEffect(() => {
    const restore = readStore<{ href: string; scrollY: number } | null>(RESTORE_KEY, null, "session");
    if (!restore) return;
    writeStore(RESTORE_KEY, null, "session");
    if (restore.href === href) window.requestAnimationFrame(() => window.scrollTo(0, restore.scrollY));
  }, [href]);
  return <div onClickCapture={remember}>{children}</div>;
}
