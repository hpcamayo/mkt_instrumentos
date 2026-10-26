import { AdminServiceReportRow, AdminServiceReviewRow, AdminServiceRow } from "@/components/services/admin-services-queue";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { ChipLink } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { positivePage } from "@/lib/admin";
import { requireAdmin } from "@/lib/admin-server";
import { servicesDb } from "@/lib/services-db";

export const metadata = { title: "Servicios" };

const VIEWS = [
  { key: "pending", param: "pendientes", label: "Por aprobar" },
  { key: "recheck", param: "cambios", label: "Cambios por revisar" },
  { key: "reports", param: "reportes", label: "Reportes" },
  { key: "reviews", param: "resenas", label: "Reseñas" },
  { key: "all", param: "todos", label: "Todos" },
] as const;
type View = (typeof VIEWS)[number]["key"];

// bet-02 (docs/feature-ideas/services.md): Admin › Servicios. New services wait here before they are public; approved
// ones whose title, description, name or photos changed come back under "Cambios por revisar" while they stay public;
// reports on services and their reviews have their own queue. Every decision is audited.
export default async function AdminServicesPage({ searchParams }: { searchParams: Promise<{ vista?: string; page?: string; q?: string }> }) {
  const [{ supabase }, query] = await Promise.all([requireAdmin("/admin/servicios"), searchParams]);
  const current = VIEWS.find((item) => item.param === query.vista) ?? VIEWS[0];
  const view: View = current.key;
  const page = positivePage(query.page);
  const search = query.q?.trim().slice(0, 80) || null;
  const { data, error } = await servicesDb(supabase).rpc("get_admin_service_queue", { p_view: view, p_search: search, p_page: page, p_page_size: 24 });
  const payload = data && typeof data === "object" && !Array.isArray(data) ? (data as { items?: unknown; total?: unknown; counts?: Record<string, number> }) : null;
  const rows = (Array.isArray(payload?.items) ? payload.items : []).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  const total = typeof payload?.total === "number" ? payload.total : 0;
  const counts = payload?.counts ?? {};
  const countFor = (key: View) => (key === "pending" ? counts.pending : key === "recheck" ? counts.recheck : key === "reports" ? counts.reports : undefined);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Servicios"
        meta={<p className="max-w-[68ch]">Servicios para músicos: aparte de las publicaciones de instrumentos. Aprueba solo servicios reales para músicos, sin datos de contacto en el texto. Laria no verifica títulos ni la calidad del trabajo, así que no lo afirmes en los motivos.</p>}
      />
      <nav aria-label="Vista de servicios" className="flex flex-wrap gap-2">
        {VIEWS.map((item) => (
          <ChipLink key={item.key} href={`/admin/servicios?vista=${item.param}`} selected={item.key === view} current="page">
            {item.label}
            {typeof countFor(item.key) === "number" ? <span className="t-meta tabular-nums"> {countFor(item.key)}</span> : null}
          </ChipLink>
        ))}
      </nav>
      {view === "pending" || view === "recheck" || view === "all" ? (
        <form action="/admin/servicios" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="vista" value={current.param} />
          <Field id="buscar-servicios" label="Buscar por título, nombre, correo o ciudad" className="min-w-0 flex-1 sm:max-w-md">
            <Input name="q" defaultValue={search ?? ""} type="search" />
          </Field>
          <Button type="submit" variant="secondary">Buscar</Button>
        </form>
      ) : null}
      {error || !payload ? (
        <Notice tone="danger">No pudimos cargar los servicios. No asumiremos que no hay pendientes.</Notice>
      ) : rows.length ? (
        <>
          <ul className="grid gap-4">
            {rows.map((row) =>
              view === "reports" ? <AdminServiceReportRow key={String(row.id)} row={row} />
              : view === "reviews" ? <AdminServiceReviewRow key={`${String(row.id)}:${String(row.status)}`} row={row} />
              : <AdminServiceRow key={`${String(row.id)}:${String(row.version)}`} row={row} />,
            )}
          </ul>
          <Pagination page={page} total={total} path="/admin/servicios" params={{ vista: current.param, ...(search ? { q: search } : {}) }} />
        </>
      ) : (
        <EmptyState headingLevel={2} title="No hay nada en esta vista" description={view === "pending" ? "Cuando alguien envíe un servicio, aparecerá aquí." : "Prueba con otra vista."} />
      )}
    </div>
  );
}
