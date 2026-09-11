import Link from "next/link";
import type { ReactNode } from "react";
import { PageContainer } from "@/components/page-container";
import { SellListingForm } from "@/components/sell-listing-form";
import { requireUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const metadata = { title: "Agregar inventario" };

export default async function StoreInventoryPage() {
  const user = await requireUser("/mi-cuenta/tienda/publicar");
  const supabase = await getSupabaseServerClient();
  const [{ data: profile }, { data: store }] = supabase
    ? await Promise.all([
        supabase.from("profiles").select("full_name,phone,city,region,account_type").eq("id", user.id).maybeSingle(),
        supabase.from("stores").select("id,name,status,is_verified,contact_person,whatsapp_phone,city,region").eq("owner_user_id", user.id).maybeSingle(),
      ])
    : [{ data: null }, { data: null }];
  const eligible = profile?.account_type === "store_owner" && store && ["pending", "active"].includes(store.status);
  const { count } = eligible && supabase
    ? await supabase.from("listings").select("id", { count: "exact", head: true }).eq("store_id", store.id).in("status", ["pending", "approved"])
    : { count: 0 };

  return (
    <PageContainer as="section" className="py-6">
      <div className="mx-auto grid w-full max-w-4xl gap-6">
        <div><p className="text-sm font-black uppercase tracking-wide text-laria-blue">Inventario</p><h1 className="mt-2 text-3xl font-black text-laria-ink">Agregar producto de tienda</h1></div>
        {!eligible ? <Notice>Necesitas una cuenta de Tienda con una solicitud pendiente o aprobada. <Link href="/registrar-tienda" className="font-black text-laria-blue">Revisar solicitud</Link>.</Notice>
        : (count ?? 0) >= 50 ? <Notice>Tu tienda alcanzó el límite de 50 publicaciones concurrentes. Cuando una deje los estados pendiente o aprobado, podrás agregar otra.</Notice>
        : <SellListingForm
            profile={{ fullName: store.contact_person ?? store.name, phone: store.whatsapp_phone, city: store.city, region: store.region }}
            store={{ id: store.id, name: store.name, status: store.status as "pending" | "active", isVerified: store.is_verified }}
          />}
      </div>
    </PageContainer>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">{children}</div>;
}
