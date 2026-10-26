import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { campaignDiscountPct, campaignPagePath, formatCampaignDate, type LiveCampaignMark } from "@/lib/campaigns";
import { formatPrice } from "@/lib/price";

// reach-05 "Campañas Laria" (docs/feature-ideas/store-reach.md): the line under a listing's price while it is in a
// campaign. It names the campaign, the plain end date and what Laria checked about "Antes"; the price is the store's.
export function CampaignMark({ mark }: { mark: LiveCampaignMark }) {
  const discount = campaignDiscountPct(mark.referencePrice, mark.campaignPrice);
  // ends_at is the first moment after the campaign; the last day shown is the one before it.
  const lastDay = formatCampaignDate(new Date(Date.parse(mark.endsAt) - 1).toISOString());
  return (
    <details className="group mt-3 rounded-panel border border-subtle bg-surface">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 t-ui text-ink [&::-webkit-details-marker]:hidden">
        <CalendarDays className="h-5 w-5 shrink-0" aria-hidden />
        <span className="font-semibold">En {mark.name}{discount ? `: ${discount} % menos` : ""}, hasta el {lastDay}</span>
        <span className="ml-auto t-meta underline decoration-accent decoration-2 underline-offset-[3px]">Qué revisó Laria</span>
      </summary>
      <div className="space-y-2 border-t border-subtle px-3 py-3 t-meta text-ink-2">
        <p>
          Laria revisó que {formatPrice(mark.referencePrice)} fue el precio más bajo de esta publicación en los 30 días anteriores a la campaña.
          El precio de campaña lo eligió la tienda.
        </p>
        <p>
          <Link href={campaignPagePath(mark.slug)} className="link font-semibold">Ver más publicaciones de {mark.name}</Link>
        </p>
      </div>
    </details>
  );
}
