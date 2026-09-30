"use client";
import Link from "next/link";
import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";

export function FavoriteButton({ listingId, initialSaved, removableOnly = false }: { listingId: string; initialSaved?: boolean; removableOnly?: boolean }) {
  const { authenticated, ready, favorites, register, setFavorite } = useMarketplaceAccount();
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => register(listingId), [listingId, register]);
  const saved = favorites[listingId] ?? initialSaved;
  if (ready && !authenticated) return <Link href={`/login?next=${encodeURIComponent(pathname)}`} onClick={(event) => { event.preventDefault(); router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); }} aria-label="Ingresa para guardar en favoritos" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-line-strong bg-white p-2 text-ink"><Heart className="h-5 w-5" aria-hidden="true" /></Link>;
  return <span data-favorite-listing={listingId} className="inline-grid gap-1"><button type="button" aria-pressed={saved ?? false} aria-label={saved ? "Quitar de favoritos" : "Guardar en favoritos"} disabled={!ready || !authenticated || saved === undefined || busy || (removableOnly && !saved)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-line-strong bg-white p-2 text-ink disabled:opacity-50" onClick={async () => {
    setBusy(true); setMessage("");
    try { await setFavorite(listingId, !saved); if (initialSaved !== undefined) router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar el favorito."); }
    finally { setBusy(false); }
  }}><Heart className={`h-5 w-5 ${saved ? "fill-accent" : ""}`} aria-hidden="true" /></button>{message ? <span role="alert" className="max-w-52 text-meta text-danger">{message}</span> : null}</span>;
}
