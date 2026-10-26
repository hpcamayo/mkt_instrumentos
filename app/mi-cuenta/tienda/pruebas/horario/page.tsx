import { redirect } from "next/navigation";
import { TryoutSettingsForm } from "@/components/store-floor/tryout-settings-form";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { loadTryoutSettings } from "@/lib/store-floor/tryouts-server";

export const metadata = { title: "Horario de pruebas" };

// buy-07: whether the store takes try-outs, and when.
export default async function StoreTryoutSettingsPage() {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/publicaciones");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const settings = await loadTryoutSettings(supabase, store.id);
  const writable = ["pending", "active"].includes(store.status);
  return (
    <div className="grid w-full max-w-3xl gap-6">
      <Breadcrumbs items={[{ label: "Pruebas", href: "/mi-cuenta/tienda/pruebas" }, { label: "Horario y ajustes" }]} />
      <PageHeader eyebrow="Mi tienda" title="Horario de pruebas" meta={<p className="max-w-[68ch]">Solo se ofrecen horarios libres dentro de estas horas, en hora de Lima.</p>} />
      {store.status !== "active" ? <Notice tone="info" role="note">Las reservas se abren cuando Laria aprueba tu tienda. Puedes dejar el horario listo.</Notice> : null}
      {writable ? <TryoutSettingsForm initial={settings} /> : <Notice tone="warning" role="note">Tu tienda no puede cambiar este ajuste ahora.</Notice>}
    </div>
  );
}
