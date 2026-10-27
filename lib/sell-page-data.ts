import "server-only";
import type { ServerDraft } from "@/components/sell-listing-form";
import { getReferenceBrandsByCategory } from "@/lib/catalog-brands";
import type { DatabaseClient } from "@/lib/supabase/database";

// What the publish pages read for the sell form besides the seller (Effortless Laria, selling batch): a draft to finish
// (?borrador=, POST 02), the usual review wait (POST 14) and the seller's drafts. Everything goes through the signed-in
// client, so RLS limits drafts to the seller's own. "Duplicar" copies a listing into a draft on the edit page instead
// (shop-08, docs/ux-effortless/integration.md UXD-integration-2).

export type DraftSummary = { id: string; title: string | null; photoCount: number; updatedAt: string; inventoryItemId: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadSellPageData(
  supabase: DatabaseClient,
  { kind, params }: { kind: "listing" | "store_listing"; params: Record<string, string | string[] | undefined> },
) {
  const draftId = typeof params.borrador === "string" && UUID.test(params.borrador) ? params.borrador : null;

  const [draft, wait] = await Promise.all([
    draftId ? supabase.from("listing_drafts").select("id,form,photos,sound_clip,inventory_item_id,updated_at").eq("id", draftId).eq("kind", kind).maybeSingle() : null,
    kind === "listing" ? supabase.rpc("listing_review_wait_minutes") : null,
  ]);

  return {
    serverDraft: (draft?.data ?? undefined) as ServerDraft | undefined,
    draftMissing: Boolean(draftId && !draft?.data),
    reviewWaitMinutes: typeof wait?.data === "number" ? wait.data : null,
  };
}

export async function listSellDrafts(supabase: DatabaseClient, kind: "listing" | "store_listing"): Promise<DraftSummary[]> {
  const { data } = await supabase
    .from("listing_drafts")
    .select("id,title,photos,updated_at,inventory_item_id")
    .eq("kind", kind)
    .order("updated_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((draft) => ({
    id: draft.id,
    title: draft.title,
    photoCount: Array.isArray(draft.photos) ? draft.photos.length : 0,
    updatedAt: draft.updated_at,
    inventoryItemId: draft.inventory_item_id,
  }));
}

// POST 06: brand suggestions per category, the ones with the most catalog models first (the catalog lookup's order).
// From the reference catalog alone: neither live listing counts nor the recovery switch change them, and when the
// catalog is unavailable the form gets none and the brand stays free text.
export async function loadSellBrands(): Promise<Record<string, string[]>> {
  const brands = await getReferenceBrandsByCategory();
  return Object.fromEntries(Object.entries(brands).map(([category, list]) => [category, list.slice(0, 200).map((brand) => brand.name)]));
}
