"use client";
import Link from "next/link";
import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";

// "overlay" sits on a card photo (UX-3): a 36 px white circle inside a 44 px hit area; the focus ring gets a white
// edge so it shows on any photo. "module" is the listing page's "Guardar" (UX-4 L4 A): a 44 px square beside the
// WhatsApp button on phones, a full-width secondary button with its label from 1024 px; its name is its visible text.
// Plain class strings: the home loads this button, and cn would add tailwind-merge there.
const CONTROL = {
  default: "inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-line-strong bg-white p-2 text-ink",
  overlay: "inline-flex h-11 w-11 items-center justify-center rounded-full text-ink focus-visible:shadow-[0_0_0_2px_var(--surface)]",
  module: "inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-2.5 text-[16px] font-semibold leading-6 text-ink transition-colors duration-120 hover:bg-canvas lg:w-full lg:px-4",
};
const OVERLAY_CIRCLE = "flex h-9 w-9 items-center justify-center rounded-full border border-subtle bg-surface";

export function FavoriteButton({ listingId, initialSaved, removableOnly = false, variant = "default" }: { listingId: string; initialSaved?: boolean; removableOnly?: boolean; variant?: "default" | "overlay" | "module" }) {
  const { authenticated, ready, favorites, register, setFavorite } = useMarketplaceAccount();
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => register(listingId), [listingId, register]);
  const saved = favorites[listingId] ?? initialSaved;
  const heart = (filled: boolean) => {
    const icon = <Heart className={filled ? "h-5 w-5 fill-accent" : "h-5 w-5"} aria-hidden="true" />;
    return variant === "overlay" ? <span className={OVERLAY_CIRCLE}>{icon}</span> : icon;
  };
  const moduleLabel = (filled: boolean) => variant === "module" ? <span className="sr-only lg:not-sr-only">{filled ? "Guardada" : "Guardar"}</span> : null;
  if (ready && !authenticated) return <Link href={`/login?next=${encodeURIComponent(pathname)}`} onClick={(event) => { event.preventDefault(); router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); }} aria-label="Ingresa para guardar en favoritos" className={CONTROL[variant]}>{heart(false)}{variant === "module" ? <span aria-hidden="true" className="hidden lg:inline">Guardar</span> : null}</Link>;
  return <span data-favorite-listing={listingId} className={variant === "overlay" ? "relative inline-grid gap-1" : variant === "module" ? "inline-grid gap-1 lg:grid" : "inline-grid gap-1"}><button type="button" aria-pressed={saved ?? false} aria-label={variant === "module" ? undefined : saved ? "Quitar de favoritos" : "Guardar en favoritos"} disabled={!ready || !authenticated || saved === undefined || busy || (removableOnly && !saved)} className={`${CONTROL[variant]} disabled:opacity-50`} onClick={async () => {
    setBusy(true); setMessage("");
    try { await setFavorite(listingId, !saved); if (initialSaved !== undefined) router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar el favorito."); }
    finally { setBusy(false); }
  }}>{heart(Boolean(saved))}{moduleLabel(Boolean(saved))}</button>{message ? <span role="alert" className={variant === "overlay" ? "absolute right-1 top-12 w-44 rounded-tag bg-surface px-2 py-1 t-meta text-danger" : "max-w-52 text-meta text-danger"}>{message}</span> : null}</span>;
}
