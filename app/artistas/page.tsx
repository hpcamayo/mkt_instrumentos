import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DiscoveryListingRow } from "@/components/discovery/listing-row";
import { PageContainer } from "@/components/page-container";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getCardsByIds, getPublicArtists } from "@/lib/discovery/data";
import { getLegalContactEmail } from "@/lib/legal-pages";
import { ARTISTS_PATH, ARTIST_DISCLAIMER } from "@/lib/discovery/makers";
import { DEFAULT_OG_IMAGES, OPEN_GRAPH_BASE, SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TITLE = "Equipo de artistas peruanos";
const DESCRIPTION = "Instrumentos y equipos que músicos peruanos usaron en sus giras y grabaciones, publicados por ellos mismos en Laria.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: ARTISTS_PATH },
  openGraph: { ...OPEN_GRAPH_BASE, title: `${TITLE} | ${SITE_NAME}`, description: DESCRIPTION, url: ARTISTS_PATH, images: DEFAULT_OG_IMAGES },
};

// disc-05 "Equipo de artistas" (docs/feature-ideas/discovery.md): the artists Laria verified, each with a short story
// and their newest public listings. Each section's id is the artist's slug, so a listing's mark links straight to it.
export default async function ArtistsPage() {
  const artists = await getPublicArtists(4);
  const cards = artists ? await getCardsByIds(artists.flatMap((artist) => artist.listing_ids)) : null;
  const byId = new Map((cards ?? []).map((card) => [card.id, card]));
  const email = getLegalContactEmail();

  return (
    <section className="bg-surface">
      <PageContainer className="grid gap-8 py-6 lg:py-8">
        <div className="grid gap-3">
          <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Equipo de artistas" }]} />
          <PageHeader title="Equipo de artistas" meta={<p className="max-w-[68ch]">Músicos peruanos que venden el equipo con el que tocaron. Laria comprobó quién es cada artista antes de mostrarlo aquí.</p>} />
        </div>
        {artists === null ? (
          <Notice tone="danger">No pudimos cargar a los artistas. Vuelve a intentarlo en unos minutos.</Notice>
        ) : artists.length ? (
          artists.map((artist, index) => {
            const listings = cards === null ? null : artist.listing_ids.flatMap((id) => byId.get(id) ?? []);
            return (
              <article key={artist.slug} id={artist.slug} aria-labelledby={`artista-${index}`} className="grid scroll-mt-24 gap-4 border-t border-line-deco pt-6">
                <header className="grid gap-1">
                  <h2 id={`artista-${index}`} className="t-section text-ink">{artist.display_name}</h2>
                  {artist.link_url ? (
                    <a href={artist.link_url} rel="noopener noreferrer nofollow" target="_blank" className="link w-fit t-ui">Su página oficial</a>
                  ) : null}
                </header>
                {artist.story ? <p className="max-w-[68ch] whitespace-pre-line t-body text-ink">{artist.story}</p> : null}
                <DiscoveryListingRow id={`artista-${index}-publicaciones`} title={`Equipo de ${artist.display_name}`} listings={listings} empty="Por ahora no tiene publicaciones a la venta." />
              </article>
            );
          })
        ) : (
          <EmptyState
            title="Pronto, equipo de artistas peruanos"
            description={
              <>
                ¿Tocas y quieres vender tu equipo aquí? <Link href="/vender" className="link font-semibold">Publícalo en Laria</Link>
                {email ? <> y escríbenos a <a href={`mailto:${email}`} className="link font-semibold">{email}</a> para verificar tu identidad.</> : "."}
              </>
            }
          />
        )}
        <p className="t-meta">{ARTIST_DISCLAIMER}</p>
      </PageContainer>
    </section>
  );
}
