import { redirect } from "next/navigation";
import { StoreRegistrationForm, type StoreApplication } from "@/components/store-registration-form";
import { getAccountContext } from "@/lib/account-context";

export const metadata = { title: "Mi tienda" };

export default async function StoreAccountPage() {
  const { user, profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta");
  const { data: photos } = store && supabase
    ? await supabase.from("store_photos").select("id,image_url,alt_text").eq("store_id", store.id).order("sort_order")
    : { data: [] };
  return (
    <div className="space-y-6">
      <div><p className="t-micro text-ink-2">{store ? "Mi tienda" : "Solicitud de tienda"}</p><h1 className="mt-2 t-page text-ink">{store ? store.name : "Completa la solicitud de tu negocio"}</h1><p className="mt-2 max-w-[68ch] t-ui text-ink-2">La información queda vinculada a esta cuenta. Solo puedes administrar una tienda en V1.</p></div>
      {store ? <StoreStatus store={store as StoreApplication} /> : null}
      <StoreRegistrationForm store={(store as StoreApplication | null) ?? null} photos={photos ?? []} defaultEmail={user.email ?? ""} />
    </div>
  );
}

function StoreStatus({ store }: { store: StoreApplication }) {
  const label = store.status === "pending" ? "Solicitud pendiente" : store.status === "rejected" ? "Solicitud rechazada" : store.status === "hidden" ? "Tienda no pública" : store.is_verified ? "Tienda Verificada" : "Tienda";
  return <section className="rounded-panel border border-subtle bg-white p-4 text-sm leading-6 text-ink-2"><p className="font-semibold text-ink">Estado: {label}</p>{store.rejection_reason ? <p className="mt-2 font-semibold text-danger">Motivo: {store.rejection_reason}</p> : null}<p className="mt-2">{store.status === "active" && store.is_verified ? "El inventario válido nuevo puede publicarse directamente." : "El inventario nuevo requiere moderación."}</p></section>;
}

