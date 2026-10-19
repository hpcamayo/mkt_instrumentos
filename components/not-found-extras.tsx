"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { RecentlyViewed } from "@/components/catalog-recently-viewed";
import { ListingCard } from "@/components/listing-card";
import type { ListingCardData } from "@/lib/listings";
import { LISTING_GRID_SIZES } from "@/lib/ui/listing-grid";

type Gone = { gone: true; label: string; href: string; listings: ListingCardData[] };

// FIND 16 (Effortless Laria): on the address of a listing that is no longer public, "Esta publicación ya no está
// disponible" and live listings of the same type, saying nothing about the old listing. FIND 11: "Vistos
// recientemente" under every not-found page.
export function useGoneListing() {
  const pathname = usePathname() ?? "";
  const slug = /^\/instrumentos\/([^/]+)$/.exec(pathname)?.[1];
  const [gone, setGone] = useState<Gone | null>(null);
  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    fetch(`/api/catalog/gone?${new URLSearchParams({ slug })}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setGone(data?.gone ? (data as Gone) : null))
      .catch(() => {});
    return () => controller.abort();
  }, [slug]);
  return gone;
}

export function NotFoundHeading({ title, message }: { title: string; message: string }) {
  const gone = useGoneListing();
  return (
    <>
      <h1 className="t-page text-ink">{gone ? "Esta publicación ya no está disponible" : title}</h1>
      <p className="text-lead mt-3 t-body text-ink-2">{gone ? `Quien la publicó la retiró o ya se vendió.${gone.listings.length ? " Estas siguen disponibles." : ""}` : message}</p>
    </>
  );
}

export function NotFoundExtras() {
  const gone = useGoneListing();
  return (
    <div className="mt-10 flex flex-col gap-10 text-left">
      {gone && gone.listings.length > 0 ? (
        <section aria-labelledby="parecidas-titulo">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 id="parecidas-titulo" className="t-section text-ink">{gone.label} disponibles</h2>
            <Link href={gone.href} className="link inline-flex min-h-11 items-center t-ui font-semibold md:min-h-6">Ver todas</Link>
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-x-5">
            {gone.listings.map((listing) => (
              <li key={listing.id} className="min-w-0">
                <ListingCard listing={listing} source="catalog" headingLevel={3} sizes={LISTING_GRID_SIZES} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <RecentlyViewed />
    </div>
  );
}
