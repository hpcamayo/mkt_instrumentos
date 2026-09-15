import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ListingManagementTable,
  type ManagedListing,
} from "@/components/listing-management-table";
import { getAccountContext } from "@/lib/account-context";

export const metadata = { title: "Mis publicaciones" };

export default async function ParticularListingsPage() {
  const { user, profile, supabase } = await getAccountContext();
  if (profile?.account_type === "store_owner") redirect("/mi-cuenta/tienda/inventario");
  const { data: listings } = supabase ? await supabase.from("listings").select("id,title,status,slug,price_pen,created_at,rejection_reason,hidden_source,hidden_reason").eq("owner_user_id", user.id).is("store_id", null).order("created_at", { ascending: false }) : { data: [] };
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
  return (
    <section className="rounded-lg border border-laria-fog bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-laria-fog p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-wide text-laria-blue">Cuenta Particular</p><h1 className="mt-1 text-2xl font-black text-laria-ink">Mis publicaciones</h1></div><Link href="/mi-cuenta/publicar" className="laria-button-primary min-h-11 px-4 py-3 text-sm">Publicar instrumento</Link></div>
      <ListingManagementTable listings={managedListings} emptyMessage="Aún no tienes publicaciones." />
    </section>
  );
}
