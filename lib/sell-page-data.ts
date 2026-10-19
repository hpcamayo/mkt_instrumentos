import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServerDraft } from "@/components/sell-listing-form";
import { getCatalogBrandsByCategory } from "@/lib/catalog-brands";
import type { SellValues } from "@/lib/sell-draft";

// What the publish pages read for the sell form besides the seller (Effortless Laria, selling batch): a draft to finish
// (?borrador=, POST 02), a listing to start from (?desde=, POST 13 "Duplicar"), the usual review wait (POST 14) and the
// seller's drafts. Everything goes through the signed-in client, so RLS limits drafts to the seller's own; a listing to
// duplicate is filtered by owner too, because published listings are readable by anyone.
// listing_drafts and listing_review_wait_minutes are newer than lib/supabase/database.types.ts, hence the untyped client.

export type DraftSummary = { id: string; title: string | null; photoCount: number; updatedAt: string; inventoryItemId: string | null };

type Untyped = SupabaseClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadSellPageData(
  client: unknown,
  { ownerId, kind, storeId, params }: { ownerId: string; kind: "listing" | "store_listing"; storeId?: string; params: Record<string, string | string[] | undefined> },
) {
  const supabase = client as Untyped;
  const draftId = typeof params.borrador === "string" && UUID.test(params.borrador) ? params.borrador : null;
  const fromId = typeof params.desde === "string" && UUID.test(params.desde) ? params.desde : null;

  const [draft, from, wait] = await Promise.all([
    draftId ? supabase.from("listing_drafts").select("id,form,photos,sound_clip,inventory_item_id,updated_at").eq("id", draftId).eq("kind", kind).maybeSingle() : null,
    fromId ? listingQuery(supabase, ownerId, kind, storeId).eq("id", fromId).maybeSingle() : null,
    kind === "listing" ? supabase.rpc("listing_review_wait_minutes") : null,
  ]);

  const row = from?.data as Record<string, unknown> | null | undefined;
  const similarFrom: Partial<SellValues> | undefined = row ? {
    category: text(row.category),
    instrumentType: text(row.instrument_type),
    brand: text(row.brand),
    model: text(row.model),
    condition: text(row.condition),
    city: text(row.city),
    region: text(row.region),
    description: text(row.description),
    attributes: row.attributes && typeof row.attributes === "object" && !Array.isArray(row.attributes) ? row.attributes as Record<string, string | string[]> : {},
  } : undefined;

  return {
    serverDraft: (draft?.data ?? undefined) as ServerDraft | undefined,
    draftMissing: Boolean(draftId && !draft?.data),
    similarFrom,
    reviewWaitMinutes: typeof wait?.data === "number" ? wait.data : null,
  };
}

export async function listSellDrafts(client: unknown, kind: "listing" | "store_listing"): Promise<DraftSummary[]> {
  const { data } = await (client as Untyped)
    .from("listing_drafts")
    .select("id,title,photos,updated_at,inventory_item_id")
    .eq("kind", kind)
    .order("updated_at", { ascending: false })
    .limit(20);
  return ((data ?? []) as { id: string; title: string | null; photos: unknown; updated_at: string; inventory_item_id: string | null }[]).map((draft) => ({
    id: draft.id,
    title: draft.title,
    photoCount: Array.isArray(draft.photos) ? draft.photos.length : 0,
    updatedAt: draft.updated_at,
    inventoryItemId: draft.inventory_item_id,
  }));
}

function listingQuery(supabase: Untyped, ownerId: string, kind: "listing" | "store_listing", storeId?: string) {
  const query = supabase.from("listings").select("category,instrument_type,brand,model,condition,city,region,description,attributes").eq("owner_user_id", ownerId);
  return kind === "store_listing" && storeId ? query.eq("store_id", storeId) : query.is("store_id", null);
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

// POST 06: brand suggestions per category, the ones with the most catalog models first (the catalog lookup's order).
export async function loadSellBrands(): Promise<Record<string, string[]>> {
  const brands = await getCatalogBrandsByCategory();
  return Object.fromEntries(Object.entries(brands).map(([category, list]) => [category, list.slice(0, 200).map((brand) => brand.name)]));
}
