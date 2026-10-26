import Link from "next/link";
import { Archive, Check, Clock } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageContainer } from "@/components/page-container";
import { ReportStatusActions } from "@/components/stolen-gear/report-status-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Tag } from "@/components/ui/tag";
import { requireUser } from "@/lib/auth/session";
import { NOINDEX_ROBOTS } from "@/lib/site";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const metadata = { title: "Mis reportes", robots: NOINDEX_ROBOTS };

type Report = { id: string; code: string; brand: string; model: string | null; serial: string | null; stolen_on: string; place: string; police_report: string; status: string; created_at: string; photos: string[]; confirmed_matches: number };

const STATUS: Record<string, { label: string; tone: "warning" | "neutral" | "accent"; icon: React.ReactNode }> = {
  active: { label: "Activo", tone: "accent", icon: <Clock aria-hidden /> },
  recovered: { label: "Recuperado", tone: "neutral", icon: <Check aria-hidden /> },
  withdrawn: { label: "Retirado", tone: "neutral", icon: <Archive aria-hidden /> },
  rejected: { label: "No aceptado", tone: "warning", icon: <Archive aria-hidden /> },
};

const dates = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// safe-02 (feature ideas, accounts batch): the person's own reports. Matches stay with Admin until reviewed; a report
// shows only how many Admin confirmed (each one also arrived by e-mail).
export default async function MyStolenReportsPage() {
  await requireUser("/reportar-robo/mis-reportes");
  const supabase = await getSupabaseServerClient();
  const { data, error } = supabase ? await supabase.rpc("my_stolen_reports") : { data: null, error: true };
  const reports = Array.isArray(data) ? (data as unknown as Report[]) : [];

  return (
    <section className="bg-canvas/70">
      <PageContainer className="grid max-w-3xl gap-5 py-6 sm:py-8">
        <Breadcrumbs phoneBackLink items={[{ label: "Reportar un robo", href: "/reportar-robo" }, { label: "Mis reportes" }]} />
        <PageHeader title="Mis reportes" meta="Tus reportes son privados: solo tú y el equipo de Laria los ven." actions={<Link href="/reportar-robo" className="link t-ui font-semibold">Nuevo reporte</Link>} />
        {error ? <Notice tone="danger"><p>No pudimos cargar tus reportes. Vuelve a intentarlo.</p></Notice> : null}
        {!error && !reports.length ? <EmptyState title="No tienes reportes" description="Si te robaron un instrumento, repórtalo y te avisaremos si aparece en Laria." actions={<Link href="/reportar-robo" className="link font-semibold">Reportar un robo</Link>} /> : null}
        <ul className="grid gap-4">
          {reports.map((report) => {
            const status = STATUS[report.status] ?? STATUS.active;
            return (
              <li key={report.id} className="grid gap-2 rounded-panel border border-subtle bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="t-ui font-semibold text-ink">{report.code} · {report.brand}{report.model ? ` ${report.model}` : ""}</p>
                  <Tag tone={status.tone} icon={status.icon}>{status.label}</Tag>
                </div>
                <p className="t-meta">
                  {report.serial ? `Serie ${report.serial} · ` : ""}{dates.format(new Date(`${report.stolen_on}T12:00:00Z`))} en {report.place} · Denuncia {report.police_report} · {report.photos.length} {report.photos.length === 1 ? "foto" : "fotos"}
                </p>
                {report.confirmed_matches > 0 ? (
                  <Notice tone="info" role="note">
                    <p>El equipo de Laria confirmó {report.confirmed_matches === 1 ? "una coincidencia" : `${report.confirmed_matches} coincidencias`} con este reporte. Comparte el código {report.code} con la policía.</p>
                  </Notice>
                ) : null}
                {report.status === "active" ? <ReportStatusActions id={report.id} code={report.code} /> : null}
              </li>
            );
          })}
        </ul>
      </PageContainer>
    </section>
  );
}
