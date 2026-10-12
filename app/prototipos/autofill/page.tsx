import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogAutofillPrototype } from "@/components/catalog-autofill-prototype";
import { PageContainer } from "@/components/page-container";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/admin-server";
import { isAutofillPrototypeEnabled, readJevConfig } from "@/lib/catalog-intelligence/config";
import { NOINDEX_ROBOTS } from "@/lib/site";

export const metadata: Metadata = { title: "Prototipo de autocompletado", robots: NOINDEX_ROBOTS };
// Read the flag at request time, never at build time.
export const dynamic = "force-dynamic";

// Post-V1 prototype (docs/catalog-autofill-jev-prototype.md). Off unless CATALOG_AUTOFILL_PROTOTYPE=1, and only for
// Admin. It publishes nothing: the form ends in a shadow evaluation, not in a submission.
export default async function CatalogAutofillPrototypePage() {
  if (!isAutofillPrototypeEnabled()) notFound();
  await requireAdmin("/prototipos/autofill");
  const config = readJevConfig();
  return (
    <PageContainer className="space-y-6 py-6 lg:py-8">
      <PageHeader
        eyebrow="Prototipo para administración"
        title="Autocompletado del catálogo y evaluación de Jev"
        meta={<p className="max-w-[68ch]">Escribe la marca y el modelo como lo haría quien vende. Nada de esta página se publica ni se guarda.</p>}
      />
      <Notice tone="warning" role="note" title="Solo para revisión">
        La evaluación corre en modo sombra: registra qué habría pasado y nunca cambia una publicación.{" "}
        {config.provider === "gateway"
          ? "Jev se consulta a través del AI Gateway configurado."
          : "No hay credenciales de Jev en este entorno: las respuestas vienen de un proveedor de prueba con reglas fijas y no son resultados de Jev."}
      </Notice>
      <CatalogAutofillPrototype provider={config.provider} />
    </PageContainer>
  );
}
