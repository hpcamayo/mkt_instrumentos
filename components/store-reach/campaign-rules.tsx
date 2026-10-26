import { CAMPAIGN_ENTRY_STATUS_LABELS, type CampaignEntry } from "@/lib/campaigns";
import { formatPrice } from "@/lib/price";

// reach-05 "Campañas Laria" (docs/feature-ideas/store-reach.md): the rules a store reads before opting in, the same on
// the list and on each campaign.
export function CampaignRules() {
  return (
    <section aria-labelledby="campanas-reglas" className="space-y-2 rounded-panel border border-subtle bg-surface p-5 sm:p-6">
      <h2 id="campanas-reglas" className="t-section text-ink">Cómo revisa Laria el precio «Antes»</h2>
      <ul className="list-disc space-y-2 pl-5 t-body text-ink">
        <li>El precio «Antes» es el más bajo que tuvo la publicación en Laria durante los 30 días anteriores. Si subiste el precio en ese tiempo, no participa.</li>
        <li>El precio de campaña lo eliges tú y debe ser al menos el descuento mínimo de la campaña por debajo de ese precio.</li>
        <li>La publicación necesita 30 días publicada con su precio registrado en Laria.</li>
        <li>Laria pone tu precio de campaña cuando empieza. Al terminar vuelve al precio anterior solo si lo elegiste.</li>
        <li>Si cambias el precio durante la campaña, la publicación sale de ella y queda con el precio que pusiste.</li>
        <li>Participar no cuesta nada. Laria no cobra comisiones ni recibe pagos; la venta sigue siendo entre tu tienda y quien compra.</li>
      </ul>
    </section>
  );
}

export function CampaignEntryLine({ entry }: { entry: CampaignEntry }) {
  return (
    <p className="t-meta text-ink-2">
      <span className="font-semibold text-ink">{CAMPAIGN_ENTRY_STATUS_LABELS[entry.status]}</span>
      {` · ${formatPrice(entry.campaignPrice)} (antes ${formatPrice(entry.referencePrice)})`}
      {entry.status === "scheduled" || entry.status === "live" ? ` · al terminar: ${entry.afterCampaign === "restore" ? `vuelve a ${formatPrice(entry.priceBefore)}` : "mantiene el precio de campaña"}` : ""}
      {entry.statusReason && entry.status !== "ended" ? ` · ${entry.statusReason}` : ""}
    </p>
  );
}
