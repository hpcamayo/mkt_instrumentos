import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SharePageButton } from "@/components/discovery/share-page-button";
import { TryoutChecklist } from "@/components/discovery/tryout-checklist";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { categoryLandingPath } from "@/lib/category-pages";
import { GUIDES_PATH, buyingGuides, getBuyingGuide, guidePath } from "@/lib/discovery/buying-guides";
import { getCategoryLabel } from "@/lib/listings";
import { DEFAULT_OG_IMAGES, OPEN_GRAPH_BASE, SITE_NAME, absoluteUrl } from "@/lib/site";

type GuidePageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return buyingGuides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const guide = getBuyingGuide((await params).slug);
  if (!guide) return {};
  const path = guidePath(guide.slug);
  return {
    title: guide.title,
    description: guide.summary,
    alternates: { canonical: path },
    openGraph: { ...OPEN_GRAPH_BASE, title: `${guide.title} | ${SITE_NAME}`, description: guide.summary, url: path, images: DEFAULT_OG_IMAGES },
  };
}

// disc-02: one guide, its text and, for "qué revisar" guides, the interactive try-out checklist. Linked from listings
// of its kind (components/discovery/listing-guide-link.tsx) and from the safe meetup sheet.
export default async function GuidePage({ params }: GuidePageProps) {
  const guide = getBuyingGuide((await params).slug);
  if (!guide) notFound();
  const category = guide.appliesTo.category;
  const related = buyingGuides.filter((item) => item.slug !== guide.slug && item.appliesTo.category === category);
  return (
    <section className="bg-surface">
      <PageContainer className="grid gap-6 py-6 lg:py-8">
        <div className="grid gap-3">
          <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Guías de compra", href: GUIDES_PATH }, { label: guide.title }]} />
          <PageHeader title={guide.title} meta={<p className="max-w-[68ch]">{guide.summary}</p>} actions={<SharePageButton url={absoluteUrl(guidePath(guide.slug))} title={guide.title} />} />
        </div>
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
          <article className="grid content-start gap-6 lg:col-span-7">
            {guide.sections.map((section) => (
              <section key={section.heading} className="grid gap-2">
                <h2 className="t-section text-ink">{section.heading}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="max-w-[68ch] t-body text-ink">{paragraph}</p>
                ))}
              </section>
            ))}
            {guide.checklist ? (
              <section aria-labelledby="lista-de-prueba" className="grid gap-3">
                <h2 id="lista-de-prueba" className="t-section text-ink">Lista para la prueba</h2>
                <TryoutChecklist groups={guide.checklist} />
              </section>
            ) : null}
          </article>
          <aside className="grid content-start gap-4 lg:col-span-5">
            <div className="rounded-panel bg-canvas p-4 t-ui text-ink-2">
              <p className="font-semibold text-ink">Esta guía es un consejo para revisar, no una garantía.</p>
              <p className="mt-1">Lo que promete cada publicación es palabra de quien vende. Laria no revisa los instrumentos ni interviene en el pago.</p>
              <p className="mt-2"><Link href="/consejos-de-seguridad" className="link font-semibold">Consejos para encontrarte con quien vende</Link></p>
            </div>
            <div className="rounded-panel border border-subtle p-4">
              <p className="t-ui font-semibold text-ink">Buscar {getCategoryLabel(category).toLowerCase()}</p>
              <p className="mt-1"><Link href={categoryLandingPath(category)} className="link t-ui">Ver publicaciones de {getCategoryLabel(category).toLowerCase()}</Link></p>
              {related.length ? (
                <ul className="mt-3 grid gap-1 border-t border-line-deco pt-3">
                  {related.map((item) => (
                    <li key={item.slug}><Link href={guidePath(item.slug)} className="link t-ui">{item.title}</Link></li>
                  ))}
                </ul>
              ) : null}
            </div>
          </aside>
        </div>
      </PageContainer>
    </section>
  );
}
