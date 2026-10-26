import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DiscoveryListingRow } from "@/components/discovery/listing-row";
import { SharePageButton } from "@/components/discovery/share-page-button";
import { PageContainer } from "@/components/page-container";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { COLLECTIONS_PATH, collectionPath, collectionSetFilters, collectionSetHref } from "@/lib/discovery/collections";
import { getCollection, getSetListings } from "@/lib/discovery/data";
import { DEFAULT_OG_IMAGES, OPEN_GRAPH_BASE, SITE_NAME, absoluteUrl, truncateDescription } from "@/lib/site";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type CollectionPageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const collection = await getCollection((await params).slug);
  if (!collection) return {};
  const path = collectionPath(collection.slug);
  const description = truncateDescription(collection.intro);
  return {
    title: collection.title,
    description,
    alternates: { canonical: path },
    openGraph: { ...OPEN_GRAPH_BASE, title: `${collection.title} | ${SITE_NAME}`, description, url: path, images: DEFAULT_OG_IMAGES },
  };
}

const ROW_SIZE = 4;

// disc-03: one collection, a row per filter set (newest first), each with "Ver las N" to the catalog's same results.
export default async function CollectionPage({ params }: CollectionPageProps) {
  const collection = await getCollection((await params).slug);
  if (collection === null) notFound();
  if (collection === undefined) {
    return (
      <section className="bg-surface">
        <PageContainer className="py-6 lg:py-8">
          <Notice tone="danger">No pudimos cargar esta colección. Vuelve a intentarlo en unos minutos.</Notice>
        </PageContainer>
      </section>
    );
  }
  const rows = await Promise.all(collection.sets.map(async (set) => ({ set, result: await getSetListings(collectionSetFilters(set), ROW_SIZE) })));
  return (
    <section className="bg-surface">
      <PageContainer className="grid gap-8 py-6 lg:py-8">
        <div className="grid gap-3">
          <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Colecciones", href: COLLECTIONS_PATH }, { label: collection.title }]} />
          <PageHeader
            eyebrow="Colección"
            title={collection.title}
            meta={<p className="max-w-[68ch]">{collection.intro}</p>}
            actions={<SharePageButton url={absoluteUrl(collectionPath(collection.slug))} title={collection.title} />}
          />
        </div>
        {rows.map(({ set, result }, index) => (
          <DiscoveryListingRow key={set.label} id={`grupo-${index}`} title={set.label} listings={result?.listings ?? null} total={result?.total ?? null} href={collectionSetHref(set)} />
        ))}
      </PageContainer>
    </section>
  );
}
