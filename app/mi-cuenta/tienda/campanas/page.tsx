import Link from "next/link";
import { redirect } from "next/navigation";
import { CampaignEntryLine, CampaignRules } from "@/components/store-reach/campaign-rules";
import { CampaignWithdrawButton } from "@/components/store-reach/campaign-forms";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { CAMPAIGN_PHASE_LABELS, campaignPagePath, campaignPeriodLabel, parseStoreCampaigns } from "@/lib/campaigns";
import { storeReachDb } from "@/lib/store-reach-db";

export const metadata = { title: "Campañas Laria" };

// reach-05 (docs/feature-ideas/store-reach.md): the campaigns a store can join or is in, with its entries.
export default async function StoreCampaignsPage() {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const { data, error } = await storeReachDb(supabase).rpc("get_store_campaigns");
  const campaigns = error ? null : parseStoreCampaigns(data);
  const active = store.status === "active";

  return (
    <div className="space-y-6">
      <section className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <PageHeader
          eyebrow="Mi tienda"
          title="Campañas Laria"
          meta={(
            <p>
              Laria abre campañas como Navidad o el Día de la Música, cada una con su página. Inscribe las publicaciones que quieras con un
              descuento real: Laria revisa el precio «Antes» con lo que tuvo la publicación en los 30 días anteriores.
            </p>
          )}
        />
      </section>

      <CampaignRules />

      <section aria-labelledby="campanas-lista" className="space-y-3">
        <h2 id="campanas-lista" className="t-section text-ink">Campañas</h2>
        {!active ? <Notice tone="info">Podrás inscribir publicaciones cuando tu tienda esté activa.</Notice> : null}
        {campaigns === null ? (
          <Notice tone="warning">No se pudieron cargar las campañas. Intenta nuevamente más tarde.</Notice>
        ) : campaigns.length ? (
          <ul className="grid gap-4">
            {campaigns.map((campaign) => {
              const open = campaign.phase === "upcoming" || campaign.phase === "live";
              return (
                <li key={campaign.id} className="space-y-3 rounded-panel border border-subtle bg-surface p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="t-section text-ink">{campaign.name}</h3>
                      <p className="t-meta text-ink-2">
                        <span className="font-semibold text-ink">{CAMPAIGN_PHASE_LABELS[campaign.phase]}</span>
                        {` · ${campaignPeriodLabel(campaign)} · descuento mínimo ${campaign.minDiscountPct} %`}
                      </p>
                      {campaign.description ? <p className="mt-1 t-body text-ink">{campaign.description}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {open && active ? <Button href={`/mi-cuenta/tienda/campanas/${campaign.id}`} size="sm">Elegir publicaciones</Button> : null}
                      {campaign.phase !== "upcoming" ? <Button href={campaignPagePath(campaign.slug)} size="sm" variant="secondary">Ver la página</Button> : null}
                    </div>
                  </div>
                  {campaign.entries.length ? (
                    <ul className="grid gap-2 border-t border-subtle pt-3">
                      {campaign.entries.map((entry) => (
                        <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            {entry.listingSlug ? (
                              <Link href={`/instrumentos/${entry.listingSlug}`} className="link t-ui font-semibold">{entry.listingTitle}</Link>
                            ) : <p className="t-ui font-semibold text-ink">{entry.listingTitle}</p>}
                            <CampaignEntryLine entry={entry} />
                          </div>
                          {entry.status === "scheduled" || entry.status === "live" ? (
                            <CampaignWithdrawButton entryId={entry.id} live={entry.status === "live"} restore={entry.afterCampaign === "restore"} />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : open ? <p className="t-meta">Aún no inscribiste publicaciones.</p> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState headingLevel={3} title="No hay campañas abiertas" description="Cuando Laria abra una, la verás aquí con sus fechas y su descuento mínimo." />
        )}
      </section>
    </div>
  );
}
