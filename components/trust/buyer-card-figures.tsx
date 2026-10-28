import { BadgeCheck, CalendarDays, Star } from "lucide-react";
import type { ReactNode } from "react";
import { StarMeter } from "@/components/ui/star-meter";
import { formatAverage, monthYearLong, type BuyerCard } from "@/lib/deal-trust";
import { cn } from "@/lib/utils";

// One block per confirmed purchase, up to this many: the bar shows how much someone has bought at a glance, and the
// figure above it says the exact number. No empty blocks, so the bar never reads as a goal to reach.
const PURCHASE_BLOCKS = 10;

// «Comprador con historial» (safe-07): the card's facts as figures a seller takes in at a glance, each on its own tile
// with an icon. Confirmed purchases (also as a bar) and the sellers' rating (also as stars) side by side, and since when
// the buyer buys in Laria under them. Every figure is also said in words. Shared by the card and the buyer's own
// preview in Compras y ventas, so both look the same.
export function BuyerCardFigures({ card, className }: { card: BuyerCard; className?: string }) {
  const since = monthYearLong(card.memberSince);
  const average = card.ratingCount > 0 ? card.averageRating : null;
  return (
    <dl className={cn("grid grid-cols-2 gap-2 sm:gap-3", className)}>
      <Figure icon={<BadgeCheck />} label="Compras confirmadas">
        <dd className="grid gap-1.5">
          <span className="t-page tabular-nums text-ink">{card.verifiedPurchases}</span>
          <span aria-hidden="true" className="flex gap-[3px]">
            {Array.from({ length: Math.min(card.verifiedPurchases, PURCHASE_BLOCKS) }, (_, block) => (
              <span key={block} className="h-2.5 w-2 rounded-[2px] bg-accent" />
            ))}
          </span>
        </dd>
        <dd className="t-meta">por quien vendió y quien compró</dd>
      </Figure>
      <Figure icon={<Star />} label="Nota de los vendedores">
        {average !== null ? (
          <>
            <dd className="flex items-baseline gap-1 text-ink">
              <span className="t-page tabular-nums">{formatAverage(average)}</span>
              <span className="t-ui">de 5</span>
            </dd>
            <dd className="grid gap-1">
              <StarMeter value={average} size={20} />
              <span className="t-meta">{card.ratingCount === 1 ? "1 reseña" : `${card.ratingCount} reseñas`}</span>
            </dd>
          </>
        ) : (
          <dd className="t-ui text-ink-2">Aún sin reseñas</dd>
        )}
      </Figure>
      {since ? (
        <Figure icon={<CalendarDays />} label="Compra en Laria desde" wide>
          <dd className="t-ui font-semibold text-ink">{since}</dd>
        </Figure>
      ) : null}
    </dl>
  );
}

function Figure({ icon, label, wide = false, children }: { icon: ReactNode; label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={cn("grid content-start gap-1 rounded-panel bg-canvas p-3 sm:p-4", wide && "col-span-2")}>
      <dt className="mb-1 flex items-center gap-2 t-meta font-semibold text-ink">
        <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-tint [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
        {label}
      </dt>
      {children}
    </div>
  );
}
