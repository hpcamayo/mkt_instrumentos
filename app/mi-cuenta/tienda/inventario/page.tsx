import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ListingManagementTable,
  type ManagedListing,
} from "@/components/listing-management-table";
import { getAccountContext } from "@/lib/account-context";

export const metadata = { title: "Inventario de tienda" };

export default async function StoreInventoryPage() {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/publicaciones");
  if (!store) redirect("/mi-cuenta/tienda");
  const { data: listings } = supabase ? await supabase.from("listings").select("id,title,status,slug,price_pen,created_at,rejection_reason,hidden_source,hidden_reason").eq("store_id", store.id).order("created_at", { ascending: false }) : { data: [] };
  const listingIds = listings?.map((listing) => listing.id) ?? [];
  const { data: revisions } = supabase && listingIds.length
    ? await supabase.from("listing_revisions").select("listing_id,status,rejection_reason,submitted_at").in("listing_id", listingIds).order("submitted_at", { ascending: false })
    : { data: [] };
  const revisionByListing = new Map<string, { status: "pending" | "rejected" | null; reason: string | null }>();
  for (const revision of revisions ?? []) {
    if (!revisionByListing.has(revision.listing_id) && (revision.status === "pending" || revision.status === "rejected")) {
      revisionByListing.set(revision.listing_id, { status: revision.status, reason: revision.rejection_reason });
    }
  }
  const managedListings: ManagedListing[] = (listings ?? []).map((listing) => ({
    ...listing,
    revisionStatus: revisionByListing.get(listing.id)?.status ?? null,
    revisionReason: revisionByListing.get(listing.id)?.reason ?? null,
  }));
  const concurrent = listings?.filter((item) => item.status === "pending" || item.status === "approved").length ?? 0;
  return (
    <section className="rounded-lg border border-laria-fog bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-laria-fog p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-wide text-laria-blue">{store.name}</p><h1 className="mt-1 text-2xl font-black text-laria-ink">Inventario</h1><p className="mt-2 text-sm text-laria-text-soft">{concurrent} de 50 publicaciones concurrentes</p></div>{concurrent < 50 ? <Link href="/mi-cuenta/tienda/publicar" className="laria-button-primary min-h-11 px-4 py-3 text-sm">Publicar producto</Link> : null}</div>
      <ListingManagementTable listings={managedListings} emptyMessage="Aún no hay productos en el inventario." />
    </section>
  );
}
