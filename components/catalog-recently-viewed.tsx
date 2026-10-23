"use client";

import { ImageOff } from "lucide-react";
import Link from "next/link";
import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { Price } from "@/components/ui/price";
import { StatusTag } from "@/components/ui/tag";
import { clearViewed } from "@/lib/device-saves";
import type { PublicListingCard } from "@/lib/favorites";
import { cn } from "@/lib/utils";
import { useViewedListings } from "@/lib/viewed-listings";

// FIND 11 (Effortless Laria): "Vistos recientemente", the listings this device opened, newest first, as a sideways row
// of small tiles, on the home, the catalog and the not-found page. It is the same list as Favoritos' (big-04,
// lib/viewed-listings.ts), kept on the device only; "Borrar" forgets it. Renders nothing until it has read the device,
// and nothing when there is nothing to show.
export function RecentlyViewed({ className, exclude, title = "Vistos recientemente" }: { className?: string; exclude?: string; title?: string }) {
  const items = (useViewedListings() ?? []).filter((item) => item.slug !== exclude).slice(0, 12);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="vistos-titulo" className={className}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h2 id="vistos-titulo" className="t-section text-ink">{title}</h2>
          <p className="mt-0.5 t-meta">Solo en este dispositivo.</p>
        </div>
        <button type="button" onClick={clearViewed} className="link inline-flex min-h-11 shrink-0 items-center t-ui font-semibold md:min-h-6">
          Borrar
        </button>
      </div>
      <ul className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:gap-5 lg:mx-0 lg:px-0">
        {items.map((item) => (
          <li key={item.id} className="w-36 shrink-0 md:w-44">
            <ViewedTile item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ViewedTile({ item, className }: { item: PublicListingCard; className?: string }) {
  return (
    <article className={cn("group relative flex min-w-0 flex-col", className)}>
      <div className="relative aspect-square overflow-hidden rounded-panel border border-subtle bg-canvas transition-colors duration-120 group-hover:border-line-strong">
        {item.image_url ? (
          <Image src={item.image_url} alt="" width={300} height={300} sizes="176px" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageOff aria-hidden className="h-6 w-6 text-ink-3" />
          </div>
        )}
      </div>
      <h3 className="mt-2 line-clamp-2 t-card-title text-ink">
        <Link href={`/instrumentos/${item.slug}`} className="decoration-accent decoration-2 underline-offset-[3px] after:absolute after:inset-0 group-hover:underline">
          {item.title}
        </Link>
      </h3>
      {item.availability === "sold" ? (
        <StatusTag domain="listing" status="sold" className="mt-1 self-start" />
      ) : item.stock_state === "out_of_stock" ? (
        <StatusTag domain="stock" status="out_of_stock" className="mt-1 self-start" />
      ) : (
        <Price value={item.price_pen} size="inline" className="mt-0.5 t-ui" />
      )}
      {item.city ? <p className="truncate t-meta">{item.city}</p> : null}
    </article>
  );
}
