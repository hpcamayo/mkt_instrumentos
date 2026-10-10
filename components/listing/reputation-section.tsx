import { ContentReport } from "@/components/content-report";
import { TRUST_COPY } from "@/components/listing/trust-note";
import { formatMonthYear, formatRating, reviewCountLabel, reviewerDisplayName } from "@/lib/listing-page";
import type { PublicReputation } from "@/lib/transactions";
import { cn } from "@/lib/utils";

// "Reseñas de <vendedor>" (UX-4 L11 B), shared by the listing and store pages. A server component: only the report
// links are client parts. Reviews come only from verified transactions (get_public_reputation, REVW-018–020). A failed
// reputation call passes null and the section is left out instead of claiming there are no reviews.
export function ReputationSection({
  reputation,
  title,
  id = "resenas",
  className,
}: {
  reputation: PublicReputation | null;
  title: string;
  id?: string;
  className?: string;
}) {
  if (!reputation) return null;
  const count = reputation.review_count;
  const shown = reputation.items.length;
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={cn("scroll-mt-4", className)}>
      <h2 id={`${id}-titulo`} className="t-section text-ink">{title}</h2>
      {count > 0 && reputation.average_rating !== null ? (
        <p className="mt-1 t-ui text-ink">
          <span className="font-semibold">{formatRating(reputation.average_rating)} de 5</span> · {reviewCountLabel(count)}
        </p>
      ) : (
        <p className="mt-1 t-ui text-ink-2">Aún no tiene reseñas.</p>
      )}
      {shown > 0 ? (
        <ol className="mt-4 grid gap-3">
          {reputation.items.map((review) => (
            <li key={review.id} className="rounded-panel border border-subtle p-4">
              <p className="flex flex-wrap gap-x-2 t-ui">
                <span className="font-semibold text-ink">{reviewerDisplayName(review.reviewer_name)}</span>
                <span className="text-ink">
                  <span aria-hidden="true">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)} </span>
                  {review.rating} de 5
                </span>
                {formatMonthYear(review.submitted_at) ? <span className="t-meta">{formatMonthYear(review.submitted_at)}</span> : null}
              </p>
              {review.comment ? <p className="mt-2 whitespace-pre-line t-ui text-ink-2">{review.comment}</p> : null}
              <div className="mt-3">
                <ContentReport targetType="review" targetId={review.id} label="Reportar reseña" />
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      {count > shown && shown > 0 ? <p className="mt-3 t-meta">Mostrando las {shown} más recientes de {count}</p> : null}
      <p className="mt-4 t-meta">{TRUST_COPY.reviews}</p>
    </section>
  );
}
