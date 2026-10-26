import { AdminHelpTicket, type AdminHelpTicketRow } from "@/components/admin-feature/admin-help-ticket";
import { ChipLink } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/admin-server";
import { HELP_TICKET_TOPICS } from "@/lib/help/articles";

export const metadata = { title: "Ayuda" };

const FILTERS = [
  { value: "abierto", label: "Sin responder" },
  { value: "respondido", label: "Respondidas" },
  { value: "cerrado", label: "Cerradas" },
] as const;

const dates = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Lima" });

type Payload = { counts?: Record<string, number> | null; items?: (Omit<AdminHelpTicketRow, "topic_label" | "created_label"> & { created_at: string })[] };

// safe-10 (feature ideas, accounts batch): questions sent from the help center's "¿No encontraste tu respuesta?",
// oldest first.
export default async function AdminHelpPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const [{ supabase }, query] = await Promise.all([requireAdmin("/admin/ayuda"), searchParams]);
  const status = FILTERS.find((filter) => filter.value === query.estado)?.value ?? "abierto";
  const { data, error } = await supabase.rpc("admin_help_tickets", { p_status: status, p_limit: 100 });
  const payload = data && typeof data === "object" && !Array.isArray(data) ? (data as unknown as Payload) : null;
  const rows: AdminHelpTicketRow[] = (payload?.items ?? []).map((item) => ({
    ...item,
    topic_label: HELP_TICKET_TOPICS.find((topic) => topic.id === item.topic)?.label ?? item.topic,
    created_label: dates.format(new Date(item.created_at)),
  }));

  return (
    <div className="space-y-5">
      <PageHeader title="Ayuda" meta={<p className="max-w-[68ch]">Consultas del Centro de ayuda. Las de una cuenta reciben la respuesta por correo; las enviadas sin cuenta se responden desde tu correo.</p>} />
      <nav aria-label="Estado de la consulta" className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <ChipLink key={filter.value} href={`/admin/ayuda?estado=${filter.value}`} selected={filter.value === status} current="page">
            {filter.label}{payload?.counts?.[filter.value] ? ` (${payload.counts[filter.value]})` : ""}
          </ChipLink>
        ))}
      </nav>
      {error || !payload ? (
        <Notice tone="danger">No pudimos cargar las consultas. No asumiremos que no hay pendientes.</Notice>
      ) : rows.length ? (
        <ul className="grid gap-4">{rows.map((row) => <AdminHelpTicket key={row.id} row={row} />)}</ul>
      ) : (
        <EmptyState title="No hay consultas en este estado" description="Cuando alguien escriba desde el Centro de ayuda, aparecerá aquí." />
      )}
    </div>
  );
}
