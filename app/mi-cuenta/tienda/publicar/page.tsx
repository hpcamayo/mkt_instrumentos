import { SellListingForm } from "@/components/sell-listing-form";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";

export const metadata = { title: "Publicar" };

export default async function StoreInventoryPage() {
  const { profile, store, supabase } = await getAccountContext();
  const eligible = profile?.account_type === "store_owner" && store && ["pending", "active"].includes(store.status);
  const { count } = eligible && supabase
    ? await supabase.from("listings").select("id", { count: "exact", head: true }).eq("store_id", store.id).in("status", ["pending", "approved"])
    : { count: 0 };

  return (
      <div className="grid w-full max-w-4xl gap-6">
        <PageHeader eyebrow="Inventario" title="Publicar en tu tienda" />
        {!eligible ? <Notice tone="warning" role="note">Necesitas una cuenta de Tienda con una solicitud pendiente o aprobada.</Notice>
        : (count ?? 0) >= 50 ? <Notice tone="warning" role="note">Tu tienda alcanzó el límite de 50 publicaciones concurrentes. Cuando una deje de estar en revisión o publicada, podrás publicar otra.</Notice>
        : <SellListingForm
            profile={{ fullName: store.contact_person ?? store.name, phone: store.whatsapp_phone, city: store.city, region: store.region }}
            store={{ id: store.id, name: store.name, status: store.status as "pending" | "active", isVerified: store.is_verified }}
          />}
      </div>
  );
}
