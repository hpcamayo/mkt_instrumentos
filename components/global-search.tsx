"use client";
import { useSearchParams } from "next/navigation";
import { buttonClasses } from "@/components/ui/button";

// The existing catalog searches by brand. Do not invent a separate free-text
// engine or an unsupported q parameter in the global header.
export function GlobalSearch() {
  const params = useSearchParams();
  return <form action="/listados" method="get" role="search" className="flex min-w-0 flex-1 gap-2" key={params.get("brand") ?? ""}>
    <label className="sr-only" htmlFor="global-marketplace-search">Buscar por marca en el catálogo</label>
    <input id="global-marketplace-search" name="brand" type="search" defaultValue={params.get("brand") ?? ""} maxLength={200} placeholder="Buscar por marca: Yamaha, Fender…" className="h-11 min-w-0 flex-1 rounded-control border border-white/25 bg-white px-3 text-[16px] text-ink placeholder:text-ink-3" />
    <button type="submit" className={buttonClasses()}>Buscar</button>
  </form>;
}
