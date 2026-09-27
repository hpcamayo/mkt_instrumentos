import { AdminWorkbench } from "@/components/admin-workbench";
import {
  firstActionableQueue,
  isAdminQueue,
  parseAdminQueuePayload,
  positivePage,
} from "@/lib/admin";
import { getAdminCounts, requireAdmin } from "@/lib/admin-server";

type AdminPageProps = {
  searchParams: Promise<{ cola?: string; pagina?: string }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const [params, counts, { supabase }] = await Promise.all([
    searchParams,
    getAdminCounts(),
    requireAdmin(),
  ]);
  const selectedQueue = isAdminQueue(params.cola)
    ? params.cola
    : firstActionableQueue(counts);
  const page = positivePage(params.pagina);
  const { data, error } = await supabase.rpc("get_admin_moderation_queue", {
    p_queue: selectedQueue,
    p_page: page,
    p_page_size: 20,
  });
  const payload = parseAdminQueuePayload(data);
  const loadError =
    error || !payload || !counts
      ? "No pudimos cargar la bandeja o sus conteos. Intenta actualizar; no asumiremos que está vacía."
      : null;

  return (
    <AdminWorkbench
      selectedQueue={selectedQueue}
      payload={payload}
      fallbackCounts={counts}
      loadError={loadError}
    />
  );
}
