import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageContainer } from "@/components/page-container";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { COLLECTIONS_PATH, collectionPath } from "@/lib/discovery/collections";
import { getCurrentCollections } from "@/lib/discovery/data";
import { DEFAULT_OG_IMAGES, OPEN_GRAPH_BASE, SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TITLE = "Colecciones de instrumentos";
const DESCRIPTION = "Criollo y afroperuano, andino, banda escolar, alabanza, home studio y más: instrumentos reales elegidos por temporada.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: COLLECTIONS_PATH },
  openGraph: { ...OPEN_GRAPH_BASE, title: `${TITLE} | ${SITE_NAME}`, description: DESCRIPTION, url: COLLECTIONS_PATH, images: DEFAULT_OG_IMAGES },
};

// disc-03: every collection inside its dates.
export default async function CollectionsPage() {
  const collections = await getCurrentCollections();
  return (
    <section className="bg-surface">
      <PageContainer className="grid gap-6 py-6 lg:py-8">
        <div className="grid gap-3">
          <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Colecciones" }]} />
          <PageHeader title="Colecciones" meta={<p className="max-w-[68ch]">Grupos de instrumentos para la música y las temporadas del Perú, armados con publicaciones reales.</p>} />
        </div>
        {collections === null ? (
          <Notice tone="danger">No pudimos cargar las colecciones. Vuelve a intentarlo en unos minutos.</Notice>
        ) : collections.length ? (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {collections.map((collection) => (
              <li key={collection.id} className="rounded-panel border border-subtle p-4">
                <h2 className="t-card-title text-ink"><Link href={collectionPath(collection.slug)} className="link">{collection.title}</Link></h2>
                <p className="mt-1 t-ui text-ink-2">{collection.intro}</p>
                <p className="mt-2 t-meta">{collection.sets.map((set) => set.label).join(" · ")}</p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No hay colecciones por ahora" description="Vuelve pronto o explora el catálogo completo." />
        )}
      </PageContainer>
    </section>
  );
}
