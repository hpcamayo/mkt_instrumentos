"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RESTORE_KEY, RESULTS_KEY, neighbours, readStore, writeStore, type ResultsTrail } from "@/lib/catalog-device";
import { cn } from "@/lib/utils";

// FIND 09 (Effortless Laria): on a listing opened from the results, "Volver a resultados" leads back to that search
// where it was left, and "Anterior" / "Siguiente" move through the results without going back. Opened straight from
// the results, going back is the browser's own back (instant, the page and its place restored); after moving with the
// arrows, the results open again at the remembered place (components/catalog-trail.tsx restores it). Without a trail
// (a shared link, another tab) the phone keeps the plain link to the category.


export function ResultsReturn({ fallback }: { fallback?: { href: string; label: string } }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const slug = /^\/instrumentos\/([^/]+)$/.exec(pathname)?.[1] ?? "";
  const [trail, setTrail] = useState<ResultsTrail | null>(null);
  useEffect(() => setTrail(readStore<ResultsTrail | null>(RESULTS_KEY, null, "session")), [slug]);
  const place = neighbours(trail, slug);

  if (!trail || !place) {
    return fallback ? (
      <Link href={fallback.href} className="-ml-1 inline-flex min-h-11 items-center gap-1 pr-2 t-ui text-ink-2 hover:text-ink md:hidden">
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        <span><span className="sr-only">Volver a </span>{fallback.label}</span>
      </Link>
    ) : null;
  }

  const back = (event: React.MouseEvent) => {
    if (trail.opened === slug && window.history.length > 1) {
      event.preventDefault();
      router.back();
      return;
    }
    writeStore(RESTORE_KEY, { href: trail.href, scrollY: trail.scrollY }, "session");
  };
  const move = () => writeStore(RESULTS_KEY, { ...trail, opened: null }, "session");
  const arrow = "inline-flex min-h-11 items-center gap-1 rounded-control px-2 t-ui font-semibold text-ink hover:bg-canvas md:min-h-9";

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 md:mt-2">
      <Link href={trail.href} onClick={back} className="-ml-1 inline-flex min-h-11 items-center gap-1 pr-2 t-ui font-semibold text-ink hover:underline md:min-h-9">
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        Volver a resultados
      </Link>
      <div className="flex items-center gap-1">
        {place.previous ? (
          <Link href={`/instrumentos/${place.previous}`} onClick={move} className={arrow} title={trail.titles[place.previous]}>
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            Anterior
          </Link>
        ) : null}
        <span className={cn("t-meta tabular-nums", !place.previous && !place.next && "sr-only")}>
          {place.index + 1} de {place.total}
        </span>
        {place.next ? (
          <Link href={`/instrumentos/${place.next}`} onClick={move} className={arrow} title={trail.titles[place.next]}>
            Siguiente
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
