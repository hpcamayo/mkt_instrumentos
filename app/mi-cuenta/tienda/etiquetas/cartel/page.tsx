import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StorePoster } from "@/components/store-floor/store-poster";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { absoluteUrl } from "@/lib/site";

export const metadata = { title: "Cartel “Encuéntranos en Laria”" };

// reach-10: the counter poster with the store's QR. The store page is public only once the store is active.
export default async function StorePosterPage() {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/publicaciones");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const { data: tryouts } = await (supabase as unknown as SupabaseClient)
    .from("store_tryout_settings").select("enabled").eq("store_id", store.id).maybeSingle();
  const url = absoluteUrl(`/tiendas/${store.slug}`);
  return (
    <div className="grid gap-6">
      <Breadcrumbs items={[{ label: "Mi tienda", href: "/mi-cuenta/tienda" }, { label: "Etiquetas", href: "/mi-cuenta/tienda/etiquetas" }, { label: "Cartel" }]} />
      <PageHeader
        eyebrow="Mi tienda"
        title="Cartel “Encuéntranos en Laria”"
        meta="Para la vitrina o el mostrador: quien entra a tu tienda escanea y ve tu catálogo, guarda lo que le gustó y te sigue."
      />
      {store.status !== "active" ? (
        <Notice tone="warning" role="note">Tu página de tienda se publica cuando Laria aprueba tu solicitud. Puedes preparar el cartel, pero imprímelo cuando esté aprobada.</Notice>
      ) : null}
      <StorePoster storeName={store.name} url={url} displayUrl={url.replace(/^https?:\/\//, "")} tryouts={Boolean((tryouts as { enabled?: boolean } | null)?.enabled)} />
      <p className="t-meta">¿Necesitas etiquetas de precio? <Link href="/mi-cuenta/tienda/etiquetas" className="link font-semibold">Etiquetas para la tienda</Link>.</p>
    </div>
  );
}
