import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageContainer } from "@/components/page-container";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { campaignPagePath, campaignPeriodLabel, campaignPhaseLine, parsePublicCampaigns } from "@/lib/campaigns";
import { formatNumber } from "@/lib/catalog-filters";
import { storeReachDb } from "@/lib/store-reach-db";
import { getRequestReads } from "@/lib/supabase/public-read-client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata: Metadata = {
  title: "Campañas",
  description: "Campañas de Laria con descuentos reales de tiendas de instrumentos: Laria revisa cada precio «Antes» con los 30 días anteriores.",
  alternates: { canonical: "/campanas" },
};

// reach-05 "Campañas Laria" (docs/feature-ideas/store-reach.md): the campaigns that run, are coming or ended in the
// last 60 days. Plain dates, no countdowns.
export default async function CampaignsPage() {
  const { supabase } = getRequestReads();
  const { data, error } = supabase ? await storeReachDb(supabase).rpc("get_public_campaigns") : { data: null, error: { message: "unconfigured" } };
  const campaigns = error ? null : parsePublicCampaigns(data);
  const order = { live: 0, upcoming: 1, ended: 2, draft: 3, cancelled: 3 } as const;
  const sorted = campaigns ? [...campaigns].sort((a, b) => order[a.phase] - order[b.phase] || a.startsAt.localeCompare(b.startsAt)) : null;

  return (
    <section className="bg-surface">
      <PageContainer className="py-6 lg:py-8">
        <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Campañas" }]} className="mb-3" />
        <h1 className="t-page text-ink">Campañas</h1>
        <p className="text-lead mt-2 max-w-[68ch] t-body text-ink-2">
          En cada campaña, las tiendas eligen publicaciones y les ponen un descuento. Laria revisa que el precio «Antes» sea el más bajo
          que tuvo cada publicación en los 30 días anteriores. Los precios y las condiciones son de cada tienda.
        </p>
        <div className="mt-6">
          {sorted === null ? (
            <Notice tone="warning">No pudimos cargar las campañas. Intenta nuevamente en unos minutos.</Notice>
          ) : sorted.length ? (
            <ul className="grid gap-4 md:grid-cols-2">
              {sorted.map((campaign) => (
                <li key={campaign.id} className="flex flex-col gap-1 rounded-panel border border-subtle bg-white p-5">
                  <h2 className="t-section text-ink">
                    {campaign.phase === "upcoming" ? campaign.name : <Link href={campaignPagePath(campaign.slug)} className="link">{campaign.name}</Link>}
                  </h2>
                  <p className="t-ui font-semibold text-ink">{campaignPhaseLine(campaign)}</p>
                  <p className="t-meta">{campaignPeriodLabel(campaign)}</p>
                  {campaign.description ? <p className="mt-1 t-body text-ink-2">{campaign.description}</p> : null}
                  {campaign.phase === "live" ? (
                    <p className="mt-1 t-meta tabular-nums">
                      {formatNumber(campaign.liveCount)} {campaign.liveCount === 1 ? "publicación" : "publicaciones"} con al menos {campaign.minDiscountPct} % menos
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No hay campañas por ahora" description="Cuando Laria abra una, la verás aquí con sus fechas." actions={<Link href="/listados" className="link t-ui font-semibold">Ver el catálogo</Link>} />
          )}
        </div>
      </PageContainer>
    </section>
  );
}
