"use client";
import { useSearchParams } from "next/navigation";

// The existing catalog searches by brand. Do not invent a separate free-text
// engine or an unsupported q parameter in the global header.
export function GlobalSearch() {
  const params = useSearchParams();
  return <form action="/listados" method="get" role="search" className="flex min-w-0 flex-1 gap-2" key={params.get("brand") ?? ""}>
    <label className="sr-only" htmlFor="global-marketplace-search">Buscar por marca en el catálogo</label>
    <input id="global-marketplace-search" name="brand" type="search" defaultValue={params.get("brand") ?? ""} maxLength={200} placeholder="Buscar por marca: Yamaha, Fender…" className="h-11 min-w-0 flex-1 rounded-md border border-white/25 bg-white px-3 text-sm text-laria-ink focus:outline-none focus:ring-2 focus:ring-laria-yellow" />
    <button type="submit" className="laria-button-primary min-h-11 px-3 text-sm">Buscar</button>
  </form>;
}
