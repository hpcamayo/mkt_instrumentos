import { SavedSearchAlerts } from "@/components/saved-search-alerts";
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
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-laria-blue">Mi cuenta</p>
        <h1 className="mt-1 text-3xl font-black text-laria-ink">Alertas</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-laria-text-soft">Guarda búsquedas exactas y recibe publicaciones nuevas de inmediato o en un resumen diario. Nunca enviamos correos vacíos.</p>
      </div>
      {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">No pudimos cargar tus alertas. Intenta nuevamente.</p> : <SavedSearchAlerts alerts={alerts} />}
    </section>
  );
}
