import { SavedSearchAlerts } from "@/components/saved-search-alerts";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { cookies } from "next/headers";
import { getAccountContext } from "@/lib/account-context";
import { LAST_VISIT_COOKIE, previousVisitFrom, PREVIOUS_VISIT_COOKIE } from "@/lib/device-saves";
import { parseSavedSearchAlerts } from "@/lib/search-alerts";

export const metadata = { title: "Alertas" };

export default async function AlertsPage() {
  const { supabase } = await getAccountContext();
  // save-05: matches since the previous visit are counted as new.
  const jar = await cookies();
  const since = previousVisitFrom(jar.get(LAST_VISIT_COOKIE)?.value, jar.get(PREVIOUS_VISIT_COOKIE)?.value);
  const { data, error } = supabase
    ? await supabase.rpc("get_account_search_alerts", since ? { p_since: since.toISOString() } : {})
    : { data: null, error: new Error("Supabase unavailable") };
  const alerts = error ? [] : parseSavedSearchAlerts(data);
  return (
    <section className="grid gap-5">
      <PageHeader
        eyebrow="Mi cuenta"
        title="Alertas"
        meta={<p className="max-w-3xl">Guarda búsquedas y recibe publicaciones nuevas en un resumen diario o al instante. Puedes cambiar el nombre y la frecuencia cuando quieras. Nunca enviamos correos vacíos.</p>}
      />
      {error ? <Notice tone="danger" role="alert">No pudimos cargar tus alertas. Intenta nuevamente.</Notice> : <SavedSearchAlerts alerts={alerts} />}
    </section>
  );
}
