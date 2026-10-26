import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminCampaignForm, AdminCampaignStatus, AdminRemoveEntry } from "@/components/store-reach/campaign-forms";
import { CampaignEntryLine } from "@/components/store-reach/campaign-rules";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/admin-server";
import { CAMPAIGN_PHASE_LABELS, campaignPagePath, campaignPeriodLabel, parseAdminCampaign } from "@/lib/campaigns";
import { isEntityId } from "@/lib/marketplace-event-payload";
import { storeReachDb, storeReachErrorMessage } from "@/lib/store-reach-db";

export const metadata = { title: "Campaña" };

// reach-05 (docs/feature-ideas/store-reach.md): one campaign for Admin: its details, its status and the publications
// stores entered, each removable with a reason the store reads.
export default async function AdminCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isEntityId(id)) notFound();
  const { supabase } = await requireAdmin(`/admin/campanas/${id}`);
  const { data, error } = await storeReachDb(supabase).rpc("admin_get_campaign", { p_id: id });
  const campaign = error ? null : parseAdminCampaign(data);
  if (!campaign) {
    return <Notice tone="danger">{storeReachErrorMessage(error, "No pudimos cargar la campaña.")}</Notice>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        meta={(
          <p>
            <span className="font-semibold text-ink">{CAMPAIGN_PHASE_LABELS[campaign.phase]}</span>
            {` · ${campaignPeriodLabel(campaign)} · `}
            {campaign.status === "published" ? <Link href={campaignPagePath(campaign.slug)} className="link font-semibold">Ver la página</Link> : "Sin página pública"}
          </p>
        )}
      />
      <p><Link href="/admin/campanas" className="link t-ui font-semibold">Volver a Campañas</Link></p>

      <section aria-labelledby="campana-estado" className="space-y-3 rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <h2 id="campana-estado" className="t-section text-ink">Estado</h2>
        <p className="t-body text-ink-2">
          {campaign.status === "draft" ? "Borrador: solo Admin la ve. Al publicarla, las tiendas pueden inscribir publicaciones hasta que termine." : null}
          {campaign.status === "published" ? "Publicada: el trabajo de campañas pone los precios al empezar y los devuelve al terminar, cada 10 minutos." : null}
          {campaign.status === "cancelled" ? "Cancelada: sus publicaciones salieron y volvieron a su precio si la tienda lo pidió." : null}
        </p>
        <AdminCampaignStatus campaign={campaign} canUnpublish={campaign.entries.length === 0} />
      </section>

      {campaign.status !== "cancelled" ? (
        <section aria-labelledby="campana-datos" className="space-y-4 rounded-panel border border-subtle bg-white p-5 sm:p-6">
          <h2 id="campana-datos" className="t-section text-ink">Datos</h2>
          <AdminCampaignForm key={campaign.revision} campaign={campaign} />
        </section>
      ) : null}

      <section aria-labelledby="campana-publicaciones" className="space-y-3">
        <h2 id="campana-publicaciones" className="t-section text-ink">Publicaciones ({campaign.entries.length})</h2>
        {campaign.entries.length ? (
          <ul className="grid gap-3">
            {campaign.entries.map((entry) => (
              <li key={entry.id} className="space-y-2 rounded-panel border border-subtle bg-white p-4">
                <div>
                  {entry.listingSlug ? <Link href={`/instrumentos/${entry.listingSlug}`} className="link t-ui font-semibold">{entry.listingTitle}</Link> : <p className="t-ui font-semibold">{entry.listingTitle}</p>}
                  {entry.storeSlug ? <p className="t-meta"><Link href={`/tiendas/${entry.storeSlug}`} className="link">{entry.storeName}</Link></p> : null}
                  <CampaignEntryLine entry={entry} />
                </div>
                {entry.status === "scheduled" || entry.status === "live" ? <AdminRemoveEntry entryId={entry.id} /> : null}
              </li>
            ))}
          </ul>
        ) : <p className="t-meta">Ninguna tienda inscribió publicaciones todavía.</p>}
      </section>
    </div>
  );
}
