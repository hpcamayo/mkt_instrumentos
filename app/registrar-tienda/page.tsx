import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageContainer } from "@/components/page-container";
import { StoreRegistrationForm, type StoreApplication } from "@/components/store-registration-form";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const metadata: Metadata = {
  title: "Solicitud de tienda",
  description: "Crea y administra la solicitud de tu tienda musical en Laria.",
};

export default async function RegisterStorePage() {
  const supabase = await getSupabaseServerClient();
  const { data: userData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = userData.user;
  const { data: profile } = user && supabase
    ? await supabase.from("profiles").select("account_type").eq("id", user.id).maybeSingle()
    : { data: null };

  if (!user) {
    return <StoreGate title="Solicita tu tienda" body="Necesitas una cuenta de Tienda separada para vincular correctamente la aplicación y el inventario.">
      <Link href="/registro/tienda" className="laria-button-primary min-h-11 px-4 py-3 text-sm">Crear cuenta de Tienda</Link>
      <Link href="/login?next=/registrar-tienda" className="laria-button-secondary min-h-11 px-4 py-3 text-sm">Ingresar</Link>
    </StoreGate>;
  }

  if (profile?.account_type !== "store_owner") {
    return <StoreGate title="Tu cuenta Particular se mantiene separada" body="No convertiremos esta cuenta en una cuenta de Tienda. Cierra sesión y crea una cuenta dedicada usando otro correo.">
      <Link href="/logout" prefetch={false} className="laria-button-primary min-h-11 px-4 py-3 text-sm">Cerrar sesión</Link>
      <Link href="/mi-cuenta" className="laria-button-secondary min-h-11 px-4 py-3 text-sm">Volver a Mi cuenta</Link>
    </StoreGate>;
  }

  const { data: store } = await supabase!
    .from("stores")
    .select("id,name,razon_social,ruc,email,contact_person,whatsapp_phone,city,region,district,address,description,instagram_url,facebook_url,tiktok_url,website_url,logo_url,banner_url,status,is_verified,rejection_reason")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  const { data: photos } = store
    ? await supabase!.from("store_photos").select("id,image_url,alt_text").eq("store_id", store.id).order("sort_order")
    : { data: [] };

  return (
    <PageContainer as="section" className="py-6">
      <div className="flex w-full max-w-4xl flex-col gap-6">
        <div className="space-y-2">
          <p className="text-sm font-black uppercase tracking-wide text-laria-blue">Tienda</p>
          <h1 className="text-2xl font-black text-laria-ink sm:text-3xl">{store ? "Datos de tu tienda" : "Completa tu solicitud"}</h1>
          <p className="max-w-2xl text-sm leading-6 text-laria-text-soft">La solicitud queda vinculada a esta cuenta. Puedes preparar inventario mientras espera la aprobación básica.</p>
        </div>
        {store ? <StoreStatus store={store as StoreApplication} /> : null}
        <StoreRegistrationForm store={(store as StoreApplication | null) ?? null} photos={photos ?? []} defaultEmail={user.email ?? ""} />
      </div>
    </PageContainer>
  );
}

function StoreStatus({ store }: { store: StoreApplication }) {
  const label = store.status === "pending" ? "Solicitud pendiente" : store.status === "rejected" ? "Solicitud rechazada" : store.status === "hidden" ? "Tienda no pública" : store.is_verified ? "Tienda Verificada" : "Tienda";
  return <section className="rounded-lg border border-laria-fog bg-laria-cloud p-4 text-sm leading-6 text-laria-text-soft"><p className="font-black text-laria-ink">Estado: {label}</p>{store.rejection_reason ? <p className="mt-2 text-red-800">Motivo: {store.rejection_reason}</p> : null}</section>;
}

function StoreGate({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return <PageContainer as="section" className="py-10"><div className="mx-auto max-w-2xl rounded-lg border border-laria-fog bg-white p-6"><h1 className="text-2xl font-black text-laria-ink">{title}</h1><p className="mt-3 text-sm leading-6 text-laria-text-soft">{body}</p><div className="mt-5 flex flex-wrap gap-3">{children}</div></div></PageContainer>;
}
