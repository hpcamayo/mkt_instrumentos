import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CampaignJoinForm, CampaignWithdrawButton } from "@/components/store-reach/campaign-forms";
import { CampaignEntryLine, CampaignRules } from "@/components/store-reach/campaign-rules";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { campaignPeriodLabel, parseCampaignOptions, type CampaignListingOption } from "@/lib/campaigns";
import { isEntityId } from "@/lib/marketplace-event-payload";
import { formatPrice } from "@/lib/price";
import { storeReachDb, storeReachErrorMessage } from "@/lib/store-reach-db";

export const metadata = { title: "Elegir publicaciones" };

// reach-05 (docs/feature-ideas/store-reach.md): the store's publications for one campaign. Those that can join get a
// form with an empty price and no preselected choice; the rest say why not, in the database's words.
export default async function StoreCampaignOptionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isEntityId(id)) notFound();
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const { data, error } = await storeReachDb(supabase).rpc("get_campaign_listing_options", { p_campaign_id: id });
  const campaign = error ? null : parseCampaignOptions(data);

  if (!campaign) {
    return (
      <div className="space-y-4">
        <Notice tone="warning">{storeReachErrorMessage(error, "No se pudo cargar la campaña. Intenta nuevamente más tarde.")}</Notice>
        <Link href="/mi-cuenta/tienda/campanas" className="link t-ui font-semibold">Volver a Campañas</Link>
      </div>
    );
  }

  const inCampaign = campaign.listings.filter((option) => option.entry && ["scheduled", "live"].includes(option.entry.status));
  const canJoin = campaign.listings.filter((option) => !inCampaign.includes(option) && !option.problemCode);
  const cannot = campaign.listings.filter((option) => !inCampaign.includes(option) && option.problemCode);

  return (
    <div className="space-y-6">
      <section className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <PageHeader
          eyebrow="Campañas Laria"
          title={campaign.name}
          meta={<p>{campaignPeriodLabel(campaign)}. Descuento mínimo: {campaign.minDiscountPct} % respecto del precio más bajo de los 30 días anteriores.</p>}
        />
        <p className="mt-3"><Link href="/mi-cuenta/tienda/campanas" className="link t-ui font-semibold">Volver a Campañas</Link></p>
      </section>

      <CampaignRules />

      <section aria-labelledby="campana-inscritas" className="space-y-3">
        <h2 id="campana-inscritas" className="t-section text-ink">En una campaña ({inCampaign.length})</h2>
        {inCampaign.length ? (
          <ul className="grid gap-3">
            {inCampaign.map((option) => (
              <li key={option.id} className="flex flex-wrap items-start justify-between gap-3 rounded-panel border border-subtle bg-surface p-4">
                <div className="min-w-0">
                  <ListingTitle option={option} />
                  {option.entry!.campaignId === campaign.id ? <CampaignEntryLine entry={option.entry!} /> : <p className="t-meta text-ink-2">Está en otra campaña.</p>}
                </div>
                {option.entry!.campaignId === campaign.id ? (
                  <CampaignWithdrawButton entryId={option.entry!.id} live={option.entry!.status === "live"} restore={option.entry!.afterCampaign === "restore"} />
                ) : null}
              </li>
            ))}
          </ul>
        ) : <p className="t-meta">Ninguna todavía.</p>}
      </section>

      <section aria-labelledby="campana-pueden" className="space-y-3">
        <h2 id="campana-pueden" className="t-section text-ink">Pueden participar ({canJoin.length})</h2>
        {canJoin.length ? (
          <ul className="grid gap-3">
            {canJoin.map((option) => (
              <li key={option.id} className="space-y-3 rounded-panel border border-subtle bg-surface p-4">
                <div>
                  <ListingTitle option={option} />
                  <p className="t-meta text-ink-2">
                    Precio actual {formatPrice(option.price)}
                    {option.referencePrice !== null ? ` · más bajo de los últimos 30 días: ${formatPrice(option.referencePrice)}` : ""}
                  </p>
                  {option.entry ? <CampaignEntryLine entry={option.entry} /> : null}
                </div>
                <CampaignJoinForm campaign={campaign} option={option} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState headingLevel={3} title="Ninguna puede participar ahora" description="Abajo verás por qué cada publicación no cumple las reglas todavía." />
        )}
      </section>

      {cannot.length ? (
        <section aria-labelledby="campana-no-pueden" className="space-y-3">
          <details className="rounded-panel border border-subtle bg-surface">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 t-ui font-semibold text-ink">
              <h2 id="campana-no-pueden" className="t-ui font-semibold">No pueden participar todavía ({cannot.length})</h2>
            </summary>
            <ul className="grid gap-3 border-t border-subtle p-4">
              {cannot.map((option) => (
                <li key={option.id}>
                  <ListingTitle option={option} />
                  <p className="t-meta text-ink-2">{option.problem}</p>
                </li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}
    </div>
  );
}

function ListingTitle({ option }: { option: CampaignListingOption }) {
  return option.slug
    ? <Link href={`/instrumentos/${option.slug}`} className="link t-ui font-semibold">{option.title}</Link>
    : <p className="t-ui font-semibold text-ink">{option.title}</p>;
}
