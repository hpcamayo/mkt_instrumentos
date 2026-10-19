"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BarHeight } from "@/components/ui/bar-height";
import { buttonClasses } from "@/components/ui/button";
import { COMPARE_KEY, COMPARE_LIMIT, DEVICE_EVENT, readStore, rememberable, writeStore, type RememberedListing } from "@/lib/catalog-device";
import type { ListingCardData } from "@/lib/listings";
import { cn } from "@/lib/utils";

// FIND 12 (Effortless Laria): compare up to three listings side by side. Desktop catalog cards carry a "Comparar" tick
// and a tray gathers the choice; on phones, the comparison starts from the favorites (CompareFromFavorites). The
// choice stays on this device; the comparison page (/comparar) reads only public listings.

export function compareHref(slugs: readonly string[]) {
  return `/comparar?${new URLSearchParams({ p: slugs.join(",") })}`;
}

function useCompareList() {
  const [list, setList] = useState<RememberedListing[]>([]);
  useEffect(() => {
    const read = () => setList(readStore<RememberedListing[]>(COMPARE_KEY, []));
    read();
    const onChange = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail === COMPARE_KEY) read();
    };
    window.addEventListener(DEVICE_EVENT, onChange);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(DEVICE_EVENT, onChange);
      window.removeEventListener("storage", read);
    };
  }, []);
  const save = (next: RememberedListing[]) => {
    setList(next);
    writeStore(COMPARE_KEY, next.length ? next : null);
  };
  return { list, save };
}

// The tick on a desktop card: a real checkbox above the card's stretched link, 24 px target, label in words.
export function CompareToggle({ listing }: { listing: ListingCardData }) {
  const { list, save } = useCompareList();
  const chosen = list.some((item) => item.id === listing.id);
  const full = !chosen && list.length >= COMPARE_LIMIT;
  const id = `comparar-${listing.id}`;
  return (
    <label htmlFor={id} className={cn("relative z-10 hidden min-h-6 w-fit items-center gap-2 t-meta lg:inline-flex", full ? "cursor-not-allowed" : "cursor-pointer")}>
      <input
        id={id}
        type="checkbox"
        checked={chosen}
        disabled={full}
        onChange={() => save(chosen ? list.filter((item) => item.id !== listing.id) : [...list, rememberable(listing)])}
        className="h-4 w-4 accent-[var(--ink)]"
      />
      {full ? "Comparar (máximo 3)" : "Comparar"}
    </label>
  );
}

// The tray at the bottom of the screen while something is chosen (desktop): the chosen titles, "Quitar" for each,
// and "Comparar 2" once two or more are chosen.
export function CompareTray() {
  const { list, save } = useCompareList();
  if (list.length === 0) return null;
  return (
    <aside aria-label="Comparación" data-bottom-bar className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-line-deco bg-surface shadow-level-2 lg:block">
      <BarHeight variable="--bottom-bar-height" />
      <div className="mx-auto flex max-w-page items-center gap-4 px-8 py-3">
        <p className="shrink-0 t-ui font-semibold text-ink">Comparar ({list.length} de {COMPARE_LIMIT})</p>
        <ul className="flex min-w-0 flex-1 flex-wrap gap-2">
          {list.map((item) => (
            <li key={item.id} className="flex max-w-[260px] items-center gap-1 rounded-control border border-line-strong py-1 pl-3 pr-1 t-ui text-ink">
              <span className="truncate">{item.title}</span>
              <button type="button" onClick={() => save(list.filter((entry) => entry.id !== item.id))} className="grid h-7 w-7 shrink-0 place-items-center rounded-tag hover:bg-canvas" aria-label={`Quitar ${item.title} de la comparación`}>
                <X aria-hidden className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => save([])} className={buttonClasses({ variant: "quiet", size: "sm" })}>Vaciar</button>
        {list.length >= 2 ? (
          <Link href={compareHref(list.map((item) => item.slug))} className={buttonClasses({ variant: "primary", size: "sm" })}>
            Comparar {list.length}
          </Link>
        ) : (
          <span className="t-meta">Elige otra para comparar</span>
        )}
      </div>
    </aside>
  );
}

// Phones: compare from the favorites. Pick two or three saved listings, then "Comparar".
export function CompareFromFavorites({ listings }: { listings: { slug: string; title: string }[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  if (listings.length < 2) return null;
  const toggle = (slug: string) =>
    setPicked((current) => (current.includes(slug) ? current.filter((item) => item !== slug) : current.length >= COMPARE_LIMIT ? current : [...current, slug]));
  return (
    <details className="rounded-panel border border-subtle bg-surface p-4">
      <summary className="flex min-h-11 cursor-pointer items-center t-ui font-semibold text-ink">Comparar favoritas</summary>
      <p className="t-meta">Elige dos o tres para verlas lado a lado.</p>
      <ul className="mt-2">
        {listings.map((listing) => {
          const chosen = picked.includes(listing.slug);
          return (
            <li key={listing.slug}>
              <button type="button" aria-pressed={chosen} onClick={() => toggle(listing.slug)} className="flex min-h-11 w-full items-center gap-3 text-left t-ui text-ink">
                <span aria-hidden className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-[3px] border", chosen ? "border-ink bg-ink" : "border-line-strong")}>
                  {chosen ? <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 truncate">{listing.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {picked.length >= 2 ? (
        <Link href={compareHref(picked)} className={buttonClasses({ variant: "primary", block: true, className: "mt-3" })}>
          Comparar {picked.length}
        </Link>
      ) : null}
    </details>
  );
}
