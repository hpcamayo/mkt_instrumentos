import type { SupabaseClient } from "@supabase/supabase-js";
import { StoreDefaultsForm } from "@/components/selling/store-defaults-form";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";

export const metadata = { title: "Valores por defecto" };

// SHOP 06: a store's default condition and standard description text for new listings.
export default async function StoreListingDefaultsPage() {
  const { profile, store, supabase } = await getAccountContext();
  const eligible = profile?.account_type === "store_owner" && store && ["pending", "active"].includes(store.status);
  const { data } = eligible && supabase
    ? await (supabase as unknown as SupabaseClient).from("store_listing_defaults").select("condition,description_footer").eq("store_id", store.id).maybeSingle()
    : { data: null };
  const row = data as { condition: string | null; description_footer: string | null } | null;
  return (
    <div className="grid w-full max-w-3xl gap-6">
      <PageHeader
        eyebrow="Mi tienda"
        title="Valores por defecto"
        meta={<p className="max-w-[68ch]">Lo que repites en cada publicación, una sola vez. Puedes cambiarlo en cada publicación.</p>}
      />
      {eligible ? (
        <StoreDefaultsForm storeId={store.id} initial={{ condition: row?.condition ?? null, descriptionFooter: row?.description_footer ?? "" }} />
      ) : (
        <Notice tone="warning" role="note">Necesitas una cuenta de Tienda con una solicitud pendiente o aprobada.</Notice>
      )}
    </div>
  );
}
