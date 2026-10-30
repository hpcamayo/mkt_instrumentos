"use client";

import { useEffect, useRef, useState } from "react";
import { ListingCard } from "@/components/listing-card";
import { Button } from "@/components/ui/button";
import { catalogSearchParams, formatNumber } from "@/lib/catalog-filters";
import { readStore, writeStore } from "@/lib/catalog-device";
import type { ListingCardData, ListingFilters } from "@/lib/listings";
import { LISTINGS_PAGE_SIZE } from "@/lib/pagination";
import { LISTING_GRID, LISTING_GRID_SIZES } from "@/lib/ui/listing-grid";
import { cn } from "@/lib/utils";

const RESTORE_KEY = "laria:ver-mas";
type Restore = { href: string; pages: number; scrollY: number; at: number };
// talk-06: a page of cards and the ones among them that say "Reservado".
type LoadedPage = { listings: ListingCardData[]; total: number | null; reserved: string[] };

// FIND 15 (Effortless Laria): on phones, "Ver 24 más" loads the next page under the current one instead of a numbered
// page that reloads and starts at the top. The numbered pages stay in the page for search engines and wider screens
// (components/pagination.tsx). Opening a listing remembers how far the list went and where the screen was, so coming
// back shows the same place.
export function CatalogLoadMore({ filters, page, total }: { filters: ListingFilters; page: number; total: number }) {
  const [extra, setExtra] = useState<LoadedPage[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const restored = useRef(false);
  const pages = Math.ceil(total / LISTINGS_PAGE_SIZE);
  const lastLoaded = page + extra.length;
  const lastPage = extra.at(-1);
  const resultTotal = lastPage ? lastPage.total : total;
  const shown = Math.min(resultTotal ?? Infinity, page * LISTINGS_PAGE_SIZE + extra.reduce((count, loaded) => count + loaded.listings.length, 0));
  const exhausted = lastPage !== undefined && lastPage.listings.length < LISTINGS_PAGE_SIZE;
  const remaining = exhausted ? 0 : Math.max(0, (resultTotal ?? total) - lastLoaded * LISTINGS_PAGE_SIZE);

  async function load(target: number) {
    const params = catalogSearchParams(filters);
    params.set("page", String(target));
    const response = await fetch(`/api/catalog/page?${params}`, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(String(response.status));
    const body = (await response.json()) as { listings?: ListingCardData[]; total?: number | null; reserved?: string[] };
    return { listings: body.listings ?? [], total: typeof body.total === "number" ? body.total : null, reserved: Array.isArray(body.reserved) ? body.reserved : [] };
  }

  async function more() {
    setState("loading");
    try {
      const next = await load(lastLoaded + 1);
      setExtra((current) => [...current, next]);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  // Coming back from a listing opened after "Ver 24 más": load the same pages again, then return to the same place.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = readStore<Restore | null>(RESTORE_KEY, null, "session");
    if (!saved || saved.href !== window.location.pathname + window.location.search || Date.now() - saved.at > 30 * 60_000 || saved.pages <= page) return;
    writeStore(RESTORE_KEY, null, "session");
    (async () => {
      try {
        const loaded: LoadedPage[] = [];
        for (let target = page + 1; target <= saved.pages; target += 1) {
          const next = await load(target);
          loaded.push(next);
          if (next.listings.length < LISTINGS_PAGE_SIZE) break;
        }
        setExtra(loaded);
        requestAnimationFrame(() => window.scrollTo({ top: saved.scrollY, behavior: "instant" as ScrollBehavior }));
      } catch {
        setState("error");
      }
    })();
    // load is stable for this page's filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Before leaving for a listing, note how far the list went (only when it went past the first page).
  const rememberPlace = () => {
    if (extra.length === 0) return;
    writeStore(RESTORE_KEY, { href: window.location.pathname + window.location.search, pages: lastLoaded, scrollY: window.scrollY, at: Date.now() } satisfies Restore, "session");
  };

  if (pages <= 1) return null;
  return (
    <div className="md:hidden" onClickCapture={rememberPlace}>
      {extra.length > 0 ? (
        <ul className={cn(LISTING_GRID, "mt-6")} aria-label={`Más resultados, hasta ${formatNumber(shown)}`}>
          {extra.flatMap((loaded) => loaded.listings.map((listing) => (
            <li key={listing.id} className="min-w-0">
              <ListingCard listing={listing} sizes={LISTING_GRID_SIZES} reserved={loaded.reserved.includes(listing.id)} />
            </li>
          )))}
        </ul>
      ) : null}
      <div className="mt-6 flex flex-col items-center gap-2">
        <p className="t-meta" role="status">
          Mostrando {formatNumber(shown)}{resultTotal === null ? null : <> de {formatNumber(resultTotal)}</>}
        </p>
        {remaining > 0 ? (
          <Button variant="secondary" block onClick={more} disabled={state === "loading"}>
            {state === "loading" ? "Cargando…" : `Ver ${formatNumber(Math.min(LISTINGS_PAGE_SIZE, remaining))} más`}
          </Button>
        ) : null}
        {state === "error" ? <p className="t-meta">No pudimos cargar más. Vuelve a intentarlo.</p> : null}
      </div>
    </div>
  );
}
