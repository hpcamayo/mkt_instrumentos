import type { ListingCardData } from "@/lib/listings";

export type PublicSnapshotCard = ListingCardData & { availability: "approved" | "sold" };

// Read every page even if the desired cards appeared earlier: requests reveal neither
// the viewed slugs nor how many matched. No credentials, personalized query or early exit.
export async function loadPublicListingSnapshot(): Promise<PublicSnapshotCard[]> {
  const cards: PublicSnapshotCard[] = [];
  let after: string | null = null;
  const seen = new Set<string>();
  do {
    const response: Response = await fetch(`/api/public-cards${after ? `?after=${encodeURIComponent(after)}` : ""}`, { credentials: "omit" });
    if (!response.ok) throw new Error("cards");
    const page: { cards: unknown; next?: unknown } = await response.json();
    if (!Array.isArray(page.cards)) throw new Error("card snapshot");
    cards.push(...page.cards as PublicSnapshotCard[]);
    after = typeof page.next === "string" ? page.next : null;
    if (after && seen.has(after)) throw new Error("card pagination");
    if (after) seen.add(after);
  } while (after);
  return cards;
}
