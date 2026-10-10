import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ListingManagementTable,
  type ManagedListing,
} from "@/components/listing-management-table";
import { getAccountContext } from "@/lib/account-context";
import { getAccountAnalytics } from "@/lib/account-analytics";
import { buttonClasses } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Inventario de tienda" };

export default async function StoreInventoryPage() {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/publicaciones");
  if (!store) redirect("/mi-cuenta/tienda");
  const [{ data: listings }, analytics] = await Promise.all([
    supabase ? supabase.from("listings").select("id,title,status,slug,price_pen,created_at,published_at,sold_at,rejection_reason,hidden_source,hidden_reason").eq("store_id", store.id).order("created_at", { ascending: false }) : { data: [] },
    getAccountAnalytics(0),
  ]);
  const analyticsByListing = new Map(analytics?.listings.map((listing) => [listing.id, listing]) ?? []);
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
    analytics: analyticsByListing.get(listing.id),
    revisionStatus: revisionByListing.get(listing.id)?.status ?? null,
    revisionReason: revisionByListing.get(listing.id)?.reason ?? null,
  }));
  const concurrent = listings?.filter((item) => item.status === "pending" || item.status === "approved").length ?? 0;
  return (
    <section className="rounded-panel border border-subtle bg-white">
      <PageHeader
        className="border-b border-subtle p-5"
        eyebrow="Mi tienda"
        title="Inventario"
        meta={`${store.name} · ${concurrent} de 50 publicaciones concurrentes`}
        actions={concurrent < 50 ? <Link href="/mi-cuenta/tienda/publicar" className={buttonClasses()}>Publicar</Link> : null}
      />
      <ListingManagementTable listings={managedListings} emptyMessage="Aún no hay publicaciones en el inventario" />
      <p className="border-t border-subtle p-5 text-meta leading-6 text-ink-2">{analytics ? "Vistas acumuladas de todo el historial, incluidas las históricas. Contactos por WhatsApp registrados desde el inicio del seguimiento; no equivalen a mensajes ni ventas." : "Las métricas no están disponibles en este momento; no se muestran ceros estimados."} La fecha de publicación corresponde a la primera publicación. <Link href="/mi-cuenta/tienda/estadisticas" className="link font-semibold">Ver estadísticas por periodo</Link>.</p>
    </section>
  );
}
