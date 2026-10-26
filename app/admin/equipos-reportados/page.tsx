import Link from "next/link";
import { AdminPhoto } from "@/components/admin-feature/admin-photo";
import { AdminReviewActions } from "@/components/admin-feature/admin-review-actions";
import { ChipLink } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/admin-server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const metadata = { title: "Equipos reportados" };

const MATCH_FILTERS = [
  { value: "pending", label: "Coincidencias por revisar" },
  { value: "confirmed", label: "Coinciden" },
  { value: "dismissed", label: "No coinciden" },
] as const;
const REPORT_FILTERS = [
  { value: "active", label: "Reportes activos" },
  { value: "recovered", label: "Recuperados" },
  { value: "withdrawn", label: "Retirados" },
  { value: "rejected", label: "Descartados" },
] as const;

type Report = {
  id: string; code: string; brand: string; model: string | null; description: string; serial: string | null; stolen_on: string;
  place: string; police_report: string; police_station: string | null; status: string; status_reason?: string | null;
  reporter: string; reporter_email: string | null; photos: string[]; matches?: number;
};
type Match = {
  id: string; source: string; detail: { serial?: string; photo?: number; report_photo?: number; distance?: number }; status: string;
  admin_note: string | null; report: Report;
  listing: { id: string; title: string; slug: string; status: string; seller: string | null; photo: string | null } | null;
  inventory_item: { id: string; sku: string | null; name: string | null; store: string | null } | null;
};

const SOURCE_LABELS: Record<string, string> = {
  listing: "Número de serie de una publicación",
  inventory: "Número de serie del inventario de una tienda",
  gear: "Número de serie de «Mi equipo»",
  photo: "Foto parecida",
};

// safe-02 (feature ideas, accounts batch): matches between stolen-gear reports and listings, SKUs or Mi equipo, with
// their reason, and the reports themselves. Nothing changes on a listing from here and nobody is told until Admin
// marks "Coincide"; then only the reporter gets an e-mail, which names neither the listing nor the seller.
export default async function AdminReportedGearPage({ searchParams }: { searchParams: Promise<{ vista?: string; estado?: string }> }) {
  const [{ supabase }, query] = await Promise.all([requireAdmin("/admin/equipos-reportados"), searchParams]);
  const reportsView = query.vista === "reportes";
  const matchStatus = MATCH_FILTERS.find((filter) => filter.value === query.estado)?.value ?? "pending";
  const reportStatus = REPORT_FILTERS.find((filter) => filter.value === query.estado)?.value ?? "active";
  const { data, error } = reportsView
    ? await supabase.rpc("admin_stolen_reports", { p_status: reportStatus, p_limit: 50 })
    : await supabase.rpc("admin_stolen_matches", { p_status: matchStatus, p_limit: 50 });
  const matchPayload = !reportsView && data && typeof data === "object" && !Array.isArray(data) ? (data as { counts?: Record<string, number>; items?: Match[] }) : null;
  const reports = reportsView && Array.isArray(data) ? (data as unknown as Report[]) : [];
  const matches = matchPayload?.items ?? [];
  const signed = await signedPhotos([...reports.flatMap((report) => report.photos), ...matches.flatMap((match) => match.report.photos)]);

  return (
    <div className="space-y-5">
      <PageHeader title="Equipos reportados" meta={<p className="max-w-[68ch]">Coincidencias entre reportes de robo y lo que se publica en Laria. Una coincidencia no prueba nada: revisa el motivo antes de decidir. Nadie ve estas coincidencias fuera de Admin.</p>} />
      <nav aria-label="Filtro" className="flex flex-wrap gap-2">
        {MATCH_FILTERS.map((filter) => (
          <ChipLink key={filter.value} href={`/admin/equipos-reportados?estado=${filter.value}`} selected={!reportsView && filter.value === matchStatus} current="page">
            {filter.label}{matchPayload?.counts?.[filter.value] ? ` (${matchPayload.counts[filter.value]})` : ""}
          </ChipLink>
        ))}
        {REPORT_FILTERS.map((filter) => (
          <ChipLink key={filter.value} href={`/admin/equipos-reportados?vista=reportes&estado=${filter.value}`} selected={reportsView && filter.value === reportStatus} current="page">
            {filter.label}
          </ChipLink>
        ))}
      </nav>
      {error ? (
        <Notice tone="danger">No pudimos cargar esta lista. No asumiremos que no hay pendientes.</Notice>
      ) : reportsView ? (
        reports.length ? (
          <ul className="grid gap-4">
            {reports.map((report) => (
              <li key={report.id} className="grid gap-3 rounded-panel border border-subtle bg-white p-4 sm:p-5">
                <ReportSummary report={report} photos={signed} />
                <p className="t-meta">Coincidencias encontradas: {report.matches ?? 0}{report.status_reason ? ` · Motivo: ${report.status_reason}` : ""}</p>
                {report.status === "active" ? (
                  <AdminReviewActions endpoint="/api/admin/stolen-gear" body={{ kind: "report", id: report.id }} noteLabel="Motivo (para descartar)" options={[{ status: "rejected", label: "Descartar reporte", variant: "danger", needsNote: true }]} done="Reporte descartado; sus coincidencias pendientes se cerraron." />
                ) : report.status === "rejected" ? (
                  <AdminReviewActions endpoint="/api/admin/stolen-gear" body={{ kind: "report", id: report.id }} options={[{ status: "active", label: "Reactivar reporte" }]} done="Reporte reactivado." />
                ) : null}
              </li>
            ))}
          </ul>
        ) : <EmptyState title="No hay reportes en este estado" />
      ) : matches.length ? (
        <ul className="grid gap-4">
          {matches.map((match) => (
            <li key={match.id} className="grid gap-4 rounded-panel border border-subtle bg-white p-4 sm:p-5">
              <p className="t-section text-ink">{SOURCE_LABELS[match.source] ?? "Coincidencia"}{match.detail.serial ? `: ${match.detail.serial}` : ""}{match.source === "photo" && match.detail.distance !== undefined ? ` (diferencia ${match.detail.distance} de 64)` : ""}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid content-start gap-2">
                  <p className="t-micro text-ink-2">Reporte</p>
                  <ReportSummary report={match.report} photos={signed} />
                </div>
                <div className="grid content-start gap-2">
                  <p className="t-micro text-ink-2">Coincide con</p>
                  {match.listing ? (
                    <>
                      <AdminPhoto src={match.listing.photo} label="Foto principal de la publicación" />
                      <p className="t-ui font-semibold text-ink">{match.listing.title}</p>
                      <p className="t-meta">{match.listing.seller ?? "Sin nombre"}</p>
                      <Link href={`/admin/publicaciones?buscar=${encodeURIComponent(match.listing.id)}`} className="link w-fit t-meta font-semibold">Abrir en gestión</Link>
                    </>
                  ) : match.inventory_item ? (
                    <p className="t-body text-ink">{match.inventory_item.name ?? "Producto"} · SKU {match.inventory_item.sku ?? "?"} · {match.inventory_item.store ?? "Tienda"}</p>
                  ) : <p className="t-body text-ink-2">Un equipo de «Mi equipo» (privado).</p>}
                </div>
              </div>
              {match.status === "pending" ? (
                <AdminReviewActions
                  endpoint="/api/admin/stolen-gear"
                  body={{ kind: "match", id: match.id }}
                  options={[{ status: "confirmed", label: "Coincide: avisar a quien reportó", variant: "danger" }, { status: "dismissed", label: "No coincide" }]}
                  done="Guardado. La publicación no cambió: ocúltala o recházala desde gestión si corresponde."
                />
              ) : match.admin_note ? <p className="t-meta">Nota: {match.admin_note}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No hay coincidencias en este estado" description="Se buscan al publicar o editar un número de serie, al guardar el inventario de una tienda, al comparar fotos y al llegar un reporte nuevo." />
      )}
    </div>
  );
}

function ReportSummary({ report, photos }: { report: Report; photos: Map<string, string> }) {
  return (
    <div className="grid gap-2">
      <p className="t-ui font-semibold text-ink">{report.code} · {report.brand}{report.model ? ` ${report.model}` : ""}</p>
      <p className="t-meta">
        {report.serial ? `Serie ${report.serial} · ` : ""}{report.stolen_on} en {report.place} · Denuncia {report.police_report}{report.police_station ? ` (${report.police_station})` : ""}
      </p>
      <p className="t-meta">Reportado por {report.reporter}{report.reporter_email ? ` · ${report.reporter_email}` : ""}</p>
      <p className="max-w-[68ch] t-body text-ink-2">{report.description}</p>
      {report.photos.length ? (
        <div className="grid grid-cols-3 gap-2">
          {report.photos.slice(0, 6).map((path, index) => <AdminPhoto key={path} src={photos.get(path) ?? null} label={`Foto ${index + 1} del reporte`} />)}
        </div>
      ) : null}
    </div>
  );
}

// Report photos live in a private bucket: ten-minute signed links for this page only.
async function signedPhotos(paths: string[]) {
  const map = new Map<string, string>();
  const admin = getSupabaseAdminClient();
  const unique = [...new Set(paths)];
  if (!admin || !unique.length) return map;
  const { data } = await admin.storage.from("stolen-gear-photos").createSignedUrls(unique, 600);
  for (const row of data ?? []) if (row.path && row.signedUrl) map.set(row.path, row.signedUrl);
  return map;
}
