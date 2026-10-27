"use client";

import { List, Map as MapIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// buy-08 "Ver en mapa": the catalog's results as a list (the page as it was) or on a map. The map and its library load
// only when chosen. The choice stays for the visit (sessionStorage) and in the address (?vista=mapa) so a shared link
// opens the map; the catalog ignores that parameter for indexing (lib/seo.ts catalogFilterKeys) and its pages are
// unchanged. Every filter applies to the map.

const CatalogMapView = dynamic(() => import("@/components/map/catalog-map-view"), {
  ssr: false,
  loading: () => <p className="t-ui text-ink" role="status">Cargando el mapa…</p>,
});

const VIEW_KEY = "laria:catalogo:vista";
type View = "lista" | "mapa";

function readView(): View {
  try {
    if (new URLSearchParams(window.location.search).get("vista") === "mapa") return "mapa";
    return window.sessionStorage.getItem(VIEW_KEY) === "mapa" ? "mapa" : "lista";
  } catch {
    return "lista";
  }
}

export function CatalogMapSwitch({ query, children }: { query: string; children: ReactNode }) {
  const [view, setView] = useState<View>("lista");

  useEffect(() => {
    setView(readView());
  }, []);

  function choose(next: View) {
    setView(next);
    try {
      window.sessionStorage.setItem(VIEW_KEY, next);
      const url = new URL(window.location.href);
      if (next === "mapa") url.searchParams.set("vista", "mapa");
      else url.searchParams.delete("vista");
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // The choice still applies to this page.
    }
  }

  return (
    <>
      <div role="group" aria-label="Ver los resultados" className="mb-4 inline-flex gap-1 rounded-control border border-line-strong bg-surface p-1">
        {([["lista", "Lista", List], ["mapa", "Mapa", MapIcon]] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => choose(value)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-[4px] px-3 t-ui font-semibold",
              view === value ? "bg-ink text-surface" : "text-ink hover:bg-canvas",
            )}
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
      {view === "mapa" ? <CatalogMapView query={query} /> : null}
      <div hidden={view === "mapa"}>{children}</div>
    </>
  );
}
