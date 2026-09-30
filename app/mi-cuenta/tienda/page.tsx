import { redirect } from "next/navigation";
import { StoreRegistrationForm, type StoreApplication } from "@/components/store-registration-form";
import { PageHeader } from "@/components/ui/page-header";
import { StatusEntryTag } from "@/components/ui/tag";
import { getAccountContext } from "@/lib/account-context";
import { storeStatusEntry } from "@/lib/ui/status";

export const metadata = { title: "Mi tienda" };

export default async function StoreAccountPage() {
  const { user, profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta");
  const { data: photos } = store && supabase
    ? await supabase.from("store_photos").select("id,image_url,alt_text").eq("store_id", store.id).order("sort_order")
    : { data: [] };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={store ? "Mi tienda" : "Solicitud de tienda"}
        title={store ? store.name : "Completa la solicitud de tu negocio"}
        meta={<p className="max-w-[68ch]">La información queda vinculada a esta cuenta. Cada cuenta puede tener una tienda.</p>}
      />
      {store ? <StoreStatus store={store as StoreApplication} /> : null}
      <StoreRegistrationForm store={(store as StoreApplication | null) ?? null} photos={photos ?? []} defaultEmail={user.email ?? ""} />
    </div>
  );
}

function StoreStatus({ store }: { store: StoreApplication }) {
  return <section className="rounded-panel border border-subtle bg-white p-4 text-sm leading-6 text-ink-2"><p className="flex flex-wrap items-center gap-2 font-semibold text-ink">Estado: <StatusEntryTag entry={storeStatusEntry(store.status, store.is_verified)} /></p>{store.rejection_reason ? <p className="mt-2 font-semibold text-danger">Motivo: {store.rejection_reason}</p> : null}<p className="mt-2">{store.status === "active" && store.is_verified ? "Tus publicaciones nuevas aparecen directamente si cumplen las reglas." : "Tus publicaciones nuevas pasan por revisión antes de aparecer."}</p></section>;
}

