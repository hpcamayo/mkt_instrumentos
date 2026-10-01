"use client";
import { Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import type { Ref } from "react";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The existing catalog searches by brand. Do not invent a separate free-text engine or an unsupported q
// parameter in the global header. The placeholder says so (decision N8); free-text search is a UX-3 question.
export const SEARCH_PLACEHOLDER = "Busca por marca: Yamaha, Fender…";

export function GlobalSearch({ id = "global-marketplace-search", inputRef, className }: { id?: string; inputRef?: Ref<HTMLInputElement>; className?: string }) {
  const params = useSearchParams();
  return <form action="/listados" method="get" role="search" className={cn("relative min-w-0", className)} key={params.get("brand") ?? ""}>
    <label className="sr-only" htmlFor={id}>Buscar por marca en el catálogo</label>
    <input ref={inputRef} id={id} name="brand" type="search" defaultValue={params.get("brand") ?? ""} maxLength={200} placeholder={SEARCH_PLACEHOLDER} className="h-11 w-full min-w-0 rounded-control border border-line-strong bg-surface pl-3 pr-12 text-[16px] text-ink placeholder:text-ink-3" />
    <IconButton type="submit" label="Buscar" size="sm" variant="quiet" icon={<Search aria-hidden="true" />} className="surface-light absolute right-1 top-1 rounded-tag bg-canvas hover:bg-subtle" />
  </form>;
}
