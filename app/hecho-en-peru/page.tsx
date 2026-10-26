import type { Metadata } from "next";
import Link from "next/link";
import { Hammer } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DiscoveryListingRow } from "@/components/discovery/listing-row";
import { SharePageButton } from "@/components/discovery/share-page-button";
import { PageContainer } from "@/components/page-container";
import { ChipLink } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { VerifiedIcon } from "@/components/ui/verified-mark";
import { categoryLandingPath } from "@/lib/category-pages";
import { getCardsByIds, getPublicMakers } from "@/lib/discovery/data";
import { MAKERS_PATH, MAKER_DISCLAIMER, MAKER_KIND_LABELS, handmadeLabel } from "@/lib/discovery/makers";
import { DEFAULT_OG_IMAGES, OPEN_GRAPH_BASE, SITE_NAME, absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TITLE = "Hecho en Perú: luthiers y talleres";
const DESCRIPTION = "Charangos, cajones, quenas y guitarras de luthiers, talleres y fabricantes peruanos, con su historia. Contacta directo por WhatsApp.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: MAKERS_PATH },
  openGraph: { ...OPEN_GRAPH_BASE, title: `${TITLE} | ${SITE_NAME}`, description: DESCRIPTION, url: MAKERS_PATH, images: DEFAULT_OG_IMAGES },
};

// disc-04 "Hecho en Perú" (docs/feature-ideas/discovery.md): every maker store (Fabricante or Taller) with its story
// and its newest handmade listings. Each section's id is the store's slug, so a listing's mark links straight to it.
export default async function MakersPage() {
  const makers = await getPublicMakers(4);
  const cards = makers ? await getCardsByIds(makers.flatMap((maker) => maker.listing_ids)) : null;
  const byId = new Map((cards ?? []).map((card) => [card.id, card]));

  return (
    <section className="bg-surface">
      <PageContainer className="grid gap-8 py-6 lg:py-8">
        <div className="grid gap-3">
          <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Hecho en Perú" }]} />
          <PageHeader
            title="Hecho en Perú"
            meta={<p className="max-w-[68ch]">Luthiers, talleres y fabricantes que hacen sus instrumentos en el Perú. Conoce su historia y escríbeles directo: muchos hacen instrumentos a pedido.</p>}
            actions={<SharePageButton url={absoluteUrl(MAKERS_PATH)} title={TITLE} />}
          />
          <ul className="flex flex-wrap gap-2">
            <li><ChipLink href={categoryLandingPath("andean")}>Instrumentos andinos</ChipLink></li>
            <li><ChipLink href="/listados?category=percussion&instrument_type=hand_percussion&percussion_type=cajon">Cajones</ChipLink></li>
            <li><ChipLink href="/listados?category=guitars&instrument_type=acoustic_guitar&acoustic_type=classical">Guitarras criollas</ChipLink></li>
          </ul>
        </div>
        {makers === null ? (
          <Notice tone="danger">No pudimos cargar los talleres. Vuelve a intentarlo en unos minutos.</Notice>
        ) : makers.length ? (
          makers.map((maker, index) => {
            const listings = cards === null ? null : maker.listing_ids.flatMap((id) => byId.get(id) ?? []);
            return (
              <article key={maker.store_id} id={maker.store_slug} aria-labelledby={`taller-${index}`} className="grid scroll-mt-24 gap-4 border-t border-line-deco pt-6">
                <header className="grid gap-1">
                  <p className="t-micro text-ink-2">{MAKER_KIND_LABELS[maker.kind]}{maker.since_year ? ` desde ${maker.since_year}` : ""}</p>
                  <h2 id={`taller-${index}`} className="flex flex-wrap items-center gap-2 t-section text-ink">
                    <Link href={`/tiendas/${maker.store_slug}`} className="link">{maker.store_name}</Link>
                    {maker.is_verified ? <><VerifiedIcon /><span className="sr-only">Tienda verificada</span></> : null}
                  </h2>
                  <p className="inline-flex items-center gap-1.5 t-ui font-semibold text-ink">
                    <Hammer aria-hidden className="h-4 w-4" />
                    {handmadeLabel(maker)}
                  </p>
                </header>
                {maker.story ? <p className="max-w-[68ch] whitespace-pre-line t-body text-ink">{maker.story}</p> : null}
                <DiscoveryListingRow
                  id={`taller-${index}-publicaciones`}
                  title={`Hecho por ${maker.store_name}`}
                  listings={listings}
                  href={`/tiendas/${maker.store_slug}`}
                  empty="Por ahora no tiene publicaciones marcadas como hechas por su taller."
                />
              </article>
            );
          })
        ) : (
          <EmptyState
            title="Aún no hay talleres en Laria"
            description={<>¿Haces instrumentos en el Perú? <Link href="/registrar-tienda" className="link font-semibold">Registra tu tienda</Link> y márcala como Fabricante o Taller en Mi tienda.</>}
          />
        )}
        <p className="t-meta">{MAKER_DISCLAIMER}</p>
      </PageContainer>
    </section>
  );
}
