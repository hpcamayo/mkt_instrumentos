import { MoreReviews, ReviewCard } from "@/components/listing/review-list";
import { TRUST_COPY } from "@/components/listing/trust-note";
import { formatRating, reviewCountLabel, type ReviewPage } from "@/lib/listing-page";
import type { PublicReputation } from "@/lib/transactions";
import { cn } from "@/lib/utils";

// "Reseñas de <vendedor>" (UX-4 L11 B), shared by the listing and store pages. A server component: the review cards
// and "Ver las N reseñas" are client parts. Reviews come only from verified transactions (get_public_reputation, REVW-018–020). A failed
// reputation call passes null and the section is left out instead of claiming there are no reviews.
// Effortless Laria (list-06): with `breakdown` it shows the count per star, and with `subject` "Ver las N reseñas" loads
// every other review in place.
export function ReputationSection({
  reputation,
  title,
  id = "resenas",
  breakdown,
  subject,
  className,
}: {
  reputation: PublicReputation | null;
  title: string;
  id?: string;
  breakdown?: ReviewPage["breakdown"] | null;
  subject?: { user?: string; store?: string } | null;
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
      {breakdown && count > 0 ? <RatingBreakdown breakdown={breakdown} total={count} /> : null}
      {shown > 0 ? (
        <ol className="mt-4 grid gap-3">
          {reputation.items.map((review) => <ReviewCard key={review.id} review={review} />)}
        </ol>
      ) : null}
      {count > shown && shown > 0 ? (
        subject ? (
          <div className="mt-3"><MoreReviews subject={subject} shown={shown} total={count} /></div>
        ) : (
          <p className="mt-3 t-meta">Mostrando las {shown} más recientes de {count}</p>
        )
      ) : null}
      <p className="mt-4 t-meta">{TRUST_COPY.reviews}</p>
    </section>
  );
}

// Five rows, 5 to 1 stars: the label, a bar and the count in words, so nothing depends on the bar alone.
function RatingBreakdown({ breakdown, total }: { breakdown: ReviewPage["breakdown"]; total: number }) {
  return (
    <dl className="mt-3 grid max-w-sm gap-1.5">
      {([5, 4, 3, 2, 1] as const).map((star) => {
        const value = breakdown[star];
        return (
          <div key={star} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 t-meta">
            <dt className="text-ink">{star} {star === 1 ? "estrella" : "estrellas"}</dt>
            <dd className="h-2 overflow-hidden rounded-full bg-canvas" aria-hidden="true">
              <span className="block h-full rounded-full bg-ink" style={{ width: `${total ? Math.round((value / total) * 100) : 0}%` }} />
            </dd>
            <dd className="text-right tabular-nums text-ink">{value}</dd>
          </div>
        );
      })}
    </dl>
  );
}
