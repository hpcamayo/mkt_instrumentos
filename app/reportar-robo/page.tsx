import Link from "next/link";
import { PageContainer } from "@/components/page-container";
import { StolenReportForm } from "@/components/stolen-gear/stolen-report-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { NOINDEX_ROBOTS } from "@/lib/site";

export const metadata = { title: "Reportar un robo", robots: NOINDEX_ROBOTS };

// safe-02 (feature ideas, accounts batch): report a stolen instrument so Laria can recognise it if it shows up.
export default async function StolenGearReportPage() {
  const user = await requireUser("/reportar-robo");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

  return (
    <section className="bg-canvas/70">
      <PageContainer className="grid max-w-3xl gap-5 py-6 sm:py-8">
        <PageHeader
          eyebrow="Ayuda"
          title="Reportar un robo"
          meta="Si tu equipo aparece en Laria, lo sabremos. Tu reporte es privado."
          actions={<Link href="/reportar-robo/mis-reportes" className="link t-ui font-semibold">Mis reportes</Link>}
        />
        <ol className="grid list-decimal gap-1.5 rounded-panel border border-subtle bg-white p-5 pl-10 t-body text-ink-2">
          <li>Haz primero la denuncia en la comisaría: te pediremos su número.</li>
          <li>Comparamos el número de serie y tus fotos con las publicaciones y el inventario de las tiendas.</li>
          <li>Si algo coincide, el equipo de Laria lo revisa. Solo entonces te escribimos. No publicamos tu reporte ni acusamos a nadie.</li>
        </ol>
        <div className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
          <StolenReportForm userId={user.id} today={today} />
        </div>
        <p className="t-meta">
          ¿Dudas? Lee <Link href="/ayuda/equipo-robado" className="link font-semibold">Si te robaron un instrumento</Link>.
        </p>
      </PageContainer>
    </section>
  );
}
