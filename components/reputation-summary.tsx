"use client";

import { ContentReport } from "@/components/content-report";
import { type PublicReputation } from "@/lib/transactions";

export function ReputationSummary({ reputation, title = "Reputación en Laria" }: { reputation: PublicReputation; title?: string }) {
  return (
    <section className="rounded-lg border border-laria-fog bg-white p-5 shadow-sm" aria-label={title}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-laria-ink">{title}</h2>
          {reputation.review_count ? (
            <p className="mt-1 text-sm font-black text-laria-blue">{Number(reputation.average_rating).toFixed(1)} / 5 · {reputation.review_count} reseña{reputation.review_count === 1 ? "" : "s"}</p>
          ) : <p className="mt-1 text-sm text-laria-text-soft">Aún no tiene reseñas verificadas visibles.</p>}
        </div>
        <p className="max-w-sm text-xs leading-5 text-laria-muted">Solo incluye compras que comprador y vendedor reconocieron. No implica garantía de pago, entrega o producto.</p>
      </div>
      {reputation.items.length ? (
        <ol className="mt-4 grid gap-3">
          {reputation.items.map((review) => (
            <li key={review.id} className="rounded-md border border-laria-fog p-4">
              <p className="text-sm font-black text-laria-ink">{review.reviewer_name ?? "Comprador de Laria"} · {review.rating}/5 ★</p>
              {review.comment ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-laria-text-soft">{review.comment}</p> : null}
              <div className="mt-3"><ContentReport targetType="review" targetId={review.id} label="Reportar reseña" /></div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
