import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountContext } from "@/lib/account-context";
import { listingStatusLabel } from "@/lib/account-ui";
import { formatPrice } from "@/lib/listings";

export const metadata = { title: "Inventario de tienda" };

export default async function StoreInventoryPage() {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/publicaciones");
  if (!store) redirect("/mi-cuenta/tienda");
  const { data: listings } = supabase ? await supabase.from("listings").select("id,title,status,slug,price_pen,created_at").eq("store_id", store.id).order("created_at", { ascending: false }) : { data: [] };
  const concurrent = listings?.filter((item) => item.status === "pending" || item.status === "approved").length ?? 0;
  return (
    <section className="rounded-lg border border-laria-fog bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-laria-fog p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-wide text-laria-blue">{store.name}</p><h1 className="mt-1 text-2xl font-black text-laria-ink">Inventario</h1><p className="mt-2 text-sm text-laria-text-soft">{concurrent} de 50 publicaciones concurrentes</p></div>{concurrent < 50 ? <Link href="/mi-cuenta/tienda/publicar" className="laria-button-primary min-h-11 px-4 py-3 text-sm">Publicar producto</Link> : null}</div>
      {listings?.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-laria-cloud text-xs uppercase tracking-wide text-laria-text-soft"><tr><th className="px-5 py-3">Producto</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Precio</th><th className="px-5 py-3">Enlace</th></tr></thead><tbody className="divide-y divide-laria-fog">{listings.map((listing) => <tr key={listing.id}><td className="px-5 py-4 font-bold text-laria-ink">{listing.title}</td><td className="px-5 py-4">{listingStatusLabel(listing.status)}</td><td className="px-5 py-4">{formatPrice(listing.price_pen)}</td><td className="px-5 py-4">{listing.status === "approved" || listing.status === "sold" ? <Link href={`/instrumentos/${listing.slug}`} className="font-black text-laria-blue">Abrir</Link> : "—"}</td></tr>)}</tbody></table></div> : <p className="p-6 text-sm text-laria-text-soft">Aún no hay productos en el inventario.</p>}
    </section>
  );
}
