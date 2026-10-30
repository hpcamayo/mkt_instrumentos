import { useEffect, useState } from "react";
import { loadPublicListingSnapshot } from "@/lib/public-listing-snapshot";
import { DEVICE_SAVES_EVENT, getViewed } from "@/lib/device-saves";
import { parsePublicListingCards, type PublicListingCard } from "@/lib/favorites";

// Favorites may sync with an account. Recently viewed history uses the anonymous public snapshot below.
export async function loadListingCards(ids: string[], slugs: string[]): Promise<PublicListingCard[]> {
  if (!ids.length && !slugs.length) return [];
  const response = await fetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cards", ids, slugs }) });
  if (!response.ok) throw new Error("cards");
  return parsePublicListingCards((await response.json()).cards);
}

// "Vistos recientemente" (big-04, FIND 11; UXD-integration-9): the listing pages this device opened (lib/device-saves.ts),
// newest first, as today's public cards, so a listing taken down drops out and a sold one says so. One list for the
// home, the catalog, the not-found page and Favoritos; null until the device has been read.
export function useViewedListings(): PublicListingCard[] | null {
  const [cards, setCards] = useState<PublicListingCard[] | null>(null);
  useEffect(() => {
    let active = true;
    let loaded: string | null = null;
    const load = () => {
      const slugs = getViewed().map((item) => item.slug);
      const key = slugs.join(",");
      if (key === loaded) return;
      loaded = key;
      if (!slugs.length) {
        setCards([]);
        return;
      }
      loadPublicListingSnapshot()
        .then((found) => {
          if (!active || loaded !== key) return;
          const bySlug = new Map(parsePublicListingCards(found).map((card) => [card.slug, card]));
          setCards(slugs.map((slug) => bySlug.get(slug)).filter((card): card is PublicListingCard => Boolean(card)));
        })
        .catch(() => {
          if (active && loaded === key) setCards([]);
        });
    };
    load();
    window.addEventListener(DEVICE_SAVES_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(DEVICE_SAVES_EVENT, load);
    };
  }, []);
  return cards;
}
