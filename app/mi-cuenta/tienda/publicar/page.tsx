import type { ReactNode } from "react";
import { SellListingForm } from "@/components/sell-listing-form";
import { getAccountContext } from "@/lib/account-context";

export const metadata = { title: "Agregar inventario" };

export default async function StoreInventoryPage() {
  const { profile, store, supabase } = await getAccountContext();
  const eligible = profile?.account_type === "store_owner" && store && ["pending", "active"].includes(store.status);
  const { count } = eligible && supabase
    ? await supabase.from("listings").select("id", { count: "exact", head: true }).eq("store_id", store.id).in("status", ["pending", "approved"])
    : { count: 0 };

  return (
      <div className="grid w-full max-w-4xl gap-6">
        <div><p className="t-micro text-ink-2">Inventario</p><h1 className="mt-2 t-page text-ink">Agregar producto de tienda</h1></div>
        {!eligible ? <Notice>Necesitas una cuenta de Tienda con una solicitud pendiente o aprobada.</Notice>
        : (count ?? 0) >= 50 ? <Notice>Tu tienda alcanzó el límite de 50 publicaciones concurrentes. Cuando una deje los estados pendiente o aprobado, podrás agregar otra.</Notice>
        : <SellListingForm
            profile={{ fullName: store.contact_person ?? store.name, phone: store.whatsapp_phone, city: store.city, region: store.region }}
            store={{ id: store.id, name: store.name, status: store.status as "pending" | "active", isVerified: store.is_verified }}
          />}
      </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <div className="rounded-panel bg-warning-tint p-5 text-sm leading-6 text-ink">{children}</div>;
}
