import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { GUIDES_PATH, buyingGuides, checklistItemCount, guidePath } from "@/lib/discovery/buying-guides";
import { DEFAULT_OG_IMAGES, OPEN_GRAPH_BASE, SITE_NAME } from "@/lib/site";

const TITLE = "Guías de compra de instrumentos";
const DESCRIPTION = "Cómo elegir tu primer instrumento y qué revisar en uno usado antes de pagar: guías cortas y listas para la prueba.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: GUIDES_PATH },
  openGraph: { ...OPEN_GRAPH_BASE, title: `${TITLE} | ${SITE_NAME}`, description: DESCRIPTION, url: GUIDES_PATH, images: DEFAULT_OG_IMAGES },
};

// disc-02 "Guías de compra" (docs/feature-ideas/discovery.md): every guide, the try-out checklists first.
export default function GuidesPage() {
  const checklists = buyingGuides.filter((guide) => guide.kind === "revisar");
  const choosing = buyingGuides.filter((guide) => guide.kind === "elegir");
  return (
    <section className="bg-surface">
      <PageContainer className="grid gap-8 py-6 lg:py-8">
        <div className="grid gap-3">
          <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Guías de compra" }]} />
          <PageHeader title="Guías de compra" meta={<p className="max-w-[68ch]">Cómo elegir y qué revisar antes de pagar. Abre la lista en tu celular durante la prueba y márcala mientras revisas.</p>} />
        </div>
        <GuideList id="listas" title="Qué revisar en la prueba" guides={checklists} />
        <GuideList id="elegir" title="Cómo elegir" guides={choosing} />
      </PageContainer>
    </section>
  );
}

function GuideList({ id, title, guides }: { id: string; title: string; guides: typeof buyingGuides }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="t-section text-ink">{title}</h2>
      <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {guides.map((guide) => (
          <li key={guide.slug} className="rounded-panel border border-subtle p-4">
            <h3 className="t-card-title text-ink">
              <Link href={guidePath(guide.slug)} className="link">{guide.title}</Link>
            </h3>
            <p className="mt-1 t-ui text-ink-2">{guide.summary}</p>
            {guide.checklist ? <p className="mt-2 t-meta">{checklistItemCount(guide)} puntos para revisar</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
