import Link from "next/link";
import { AdminCampaignForm } from "@/components/store-reach/campaign-forms";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/admin-server";
import { CAMPAIGN_PHASE_LABELS, campaignPeriodLabel, parseAdminCampaigns } from "@/lib/campaigns";
import { storeReachDb } from "@/lib/store-reach-db";

export const metadata = { title: "Campañas" };

// reach-05 (docs/feature-ideas/store-reach.md): Admin's campaigns and the form for a new one.
export default async function AdminCampaignsPage() {
  const { supabase } = await requireAdmin("/admin/campanas");
  const { data, error } = await storeReachDb(supabase).rpc("admin_get_campaigns");
  const campaigns = error ? null : parseAdminCampaigns(data);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campañas"
        meta={(
          <p className="max-w-[68ch]">
            Cada campaña tiene su página con fechas simples, sin cuentas regresivas. Las tiendas inscriben publicaciones con un descuento
            real: Laria revisa cada precio «Antes» con los 30 días anteriores. «Cyber Wow» es una marca de IAB Perú; no la uses
            sin la revisión legal.
          </p>
        )}
      />
      {campaigns === null ? (
        <Notice tone="danger">No pudimos cargar las campañas.</Notice>
      ) : campaigns.length ? (
        <ul className="grid gap-3">
          {campaigns.map((campaign) => (
            <li key={campaign.id} className="rounded-panel border border-subtle bg-white p-4">
              <Link href={`/admin/campanas/${campaign.id}`} className="link t-section">{campaign.name}</Link>
              <p className="t-meta text-ink-2">
                <span className="font-semibold text-ink">{CAMPAIGN_PHASE_LABELS[campaign.phase]}</span>
                {` · ${campaignPeriodLabel(campaign)} · mínimo ${campaign.minDiscountPct} % · ${campaign.liveCount} en curso, ${campaign.scheduledCount} inscritas`}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState headingLevel={2} title="Aún no hay campañas" description="Crea un borrador; las tiendas la verán cuando la publiques." />
      )}
      <section aria-labelledby="campana-nueva" className="space-y-4 rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <h2 id="campana-nueva" className="t-section text-ink">Nueva campaña</h2>
        <AdminCampaignForm />
      </section>
    </div>
  );
}
