import { SavedSearchAlerts } from "@/components/saved-search-alerts";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { parseSavedSearchAlerts } from "@/lib/search-alerts";

export const metadata = { title: "Alertas" };

export default async function AlertsPage() {
  const { supabase } = await getAccountContext();
  const { data, error } = supabase
    ? await supabase.from("saved_search_alerts").select("id,search_filters,frequency,status,active_since,created_at").order("created_at", { ascending: false })
    : { data: null, error: new Error("Supabase unavailable") };
  const alerts = error ? [] : parseSavedSearchAlerts(data);
  return (
    <section className="grid gap-5">
      <PageHeader
        eyebrow="Mi cuenta"
        title="Alertas"
        meta={<p className="max-w-3xl">Guarda búsquedas exactas y recibe publicaciones nuevas de inmediato o en un resumen diario. Nunca enviamos correos vacíos.</p>}
      />
      {error ? <Notice tone="danger" role="alert">No pudimos cargar tus alertas. Intenta nuevamente.</Notice> : <SavedSearchAlerts alerts={alerts} />}
    </section>
  );
}
