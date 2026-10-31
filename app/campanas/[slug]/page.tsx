import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ListingCard } from "@/components/listing-card";
import { PageContainer } from "@/components/page-container";
import { Pagination } from "@/components/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { CAMPAIGN_PAGE_SIZE, CAMPAIGN_PHASE_LABELS, CAMPAIGN_SLUG, campaignCards, campaignPagePath, campaignPeriodLabel, campaignPhaseLine, parsePublicCampaign } from "@/lib/campaigns";
import { catalogCardSelect } from "@/lib/catalog";
import { formatNumber } from "@/lib/catalog-filters";
import type { ListingCardData } from "@/lib/listings";
import { parsePage } from "@/lib/pagination";
import { NOINDEX_FOLLOW_ROBOTS, truncateDescription } from "@/lib/site";
import { storeReachDb } from "@/lib/store-reach-db";
import { getRequestReads } from "@/lib/supabase/public-read-client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const GRID = "grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-x-5 md:gap-y-8 lg:grid-cols-4";
const GRID_SIZES = "(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 300px";

const loadCampaign = cache(async (slug: string, page: number) => {
  const { supabase } = getRequestReads();
  if (!supabase) return { campaign: null, failed: true };
  const { data, error } = await storeReachDb(supabase).rpc("get_public_campaign", {
    p_slug: slug,
    p_offset: (page - 1) * CAMPAIGN_PAGE_SIZE,
    p_limit: CAMPAIGN_PAGE_SIZE,
  });
  return { campaign: error ? null : parsePublicCampaign(data), failed: Boolean(error) };
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  if (!CAMPAIGN_SLUG.test(slug)) return { title: "Campaña no disponible", robots: NOINDEX_FOLLOW_ROBOTS };
  const page = parsePage(query.page);
  const { campaign } = await loadCampaign(slug, page);
  if (!campaign) return { title: "Campaña no disponible", robots: NOINDEX_FOLLOW_ROBOTS };
  return {
    title: campaign.name,
    description: truncateDescription(campaign.description || `${campaign.name} en Laria: ${campaignPeriodLabel(campaign).toLowerCase()}.`),
    alternates: { canonical: campaignPagePath(campaign.slug) },
    // Only the first page of a running campaign is worth indexing.
    ...(campaign.phase !== "live" || page > 1 ? { robots: NOINDEX_FOLLOW_ROBOTS } : {}),
  };
}

// reach-05 "Campañas Laria" (docs/feature-ideas/store-reach.md): one campaign's page. Its live publications, 24 a
// page, the latest to join first; each card shows the store's campaign price and the "Antes" Laria checked. Plain
// dates, no countdowns, no "quedan pocas".
export default async function CampaignPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  if (!CAMPAIGN_SLUG.test(slug)) notFound();
  const page = parsePage(query.page);
  const { campaign, failed } = await loadCampaign(slug, page);
  if (!campaign && !failed) notFound();
  if (campaign && page > 1 && campaign.entries.length === 0) redirect(campaignPagePath(campaign.slug));

  let cards: ListingCardData[] = [];
  let cardsFailed = false;
  const { supabase } = getRequestReads();
  if (campaign?.entries.length && supabase) {
    const { data, error } = await supabase
      // public_listings: the card's photo_count reads a row of public columns (lib/catalog.ts).
      .from("public_listings")
      .select(catalogCardSelect())
      .in("id", campaign.entries.map((entry) => entry.listingId))
      .eq("status", "approved")
      .order("sort_order", { foreignTable: "listing_photos", ascending: true })
      .limit(1, { foreignTable: "listing_photos" })
      .returns<ListingCardData[]>();
    cardsFailed = Boolean(error);
    cards = campaignCards(campaign.entries, data ?? []);
  }

  return (
    <section className="bg-surface">
      <PageContainer className="py-6 lg:py-8">
        <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Campañas", href: "/campanas" }, { label: campaign?.name ?? "Campaña" }]} className="mb-3" />
        {!campaign ? (
          <Notice tone="warning">No pudimos cargar la campaña. Intenta nuevamente en unos minutos.</Notice>
        ) : (
          <>
            <h1 className="t-page text-ink">{campaign.name}</h1>
            <p className="mt-1 t-ui font-semibold text-ink">{CAMPAIGN_PHASE_LABELS[campaign.phase]} · {campaignPeriodLabel(campaign)}</p>
            {campaign.description ? <p className="text-lead mt-2 max-w-[68ch] t-body text-ink-2">{campaign.description}</p> : null}
            <details className="mt-4 max-w-[68ch] rounded-panel border border-subtle bg-white">
              <summary className="flex min-h-11 cursor-pointer items-center px-4 t-ui font-semibold text-ink">Qué revisó Laria</summary>
              <div className="space-y-2 border-t border-subtle px-4 py-3 t-meta text-ink-2">
                <p>
                  Cada precio «Antes» es el más bajo que tuvo esa publicación en Laria durante los 30 días anteriores a entrar a la campaña, y
                  el precio de campaña es al menos {campaign.minDiscountPct} % menor.
                </p>
                <p>
                  Los precios, el stock, la garantía y la entrega son de cada tienda. Laria no vende, no cobra y no recibe pagos: coordinas
                  todo directamente con la tienda.
                </p>
              </div>
            </details>
            <div className="mt-6">
              {campaign.phase !== "live" ? (
                <EmptyState
                  title={campaign.phase === "upcoming" ? "La campaña aún no empieza" : "La campaña terminó"}
                  description={campaign.phase === "upcoming" ? `Las publicaciones aparecerán aquí desde el inicio. ${campaignPhaseLine(campaign)}.` : "Gracias por visitarla. Mira el catálogo o las otras campañas."}
                  actions={<Link href="/campanas" className="link t-ui font-semibold">Ver campañas</Link>}
                />
              ) : cardsFailed ? (
                <Notice tone="warning">No pudimos cargar las publicaciones. Intenta nuevamente en unos minutos.</Notice>
              ) : cards.length ? (
                <div className="grid gap-5">
                  <p className="t-meta tabular-nums">
                    {formatNumber(campaign.total)} {campaign.total === 1 ? "publicación" : "publicaciones"} · Las más recientes en entrar primero
                  </p>
                  <div className={GRID}>
                    {cards.map((listing, index) => (
                      <ListingCard key={listing.id} listing={listing} eager={index < 4} headingLevel={2} sizes={GRID_SIZES} source="other" />
                    ))}
                  </div>
                  <Pagination page={page} total={campaign.total} path={campaignPagePath(campaign.slug)} />
                </div>
              ) : (
                <EmptyState title="Aún no hay publicaciones en esta campaña" description="Las tiendas pueden inscribirlas mientras la campaña siga en curso." actions={<Link href="/listados" className="link t-ui font-semibold">Ver el catálogo</Link>} />
              )}
            </div>
          </>
        )}
      </PageContainer>
    </section>
  );
}
