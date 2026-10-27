"use client";

import { useState } from "react";
import { ContentReport } from "@/components/content-report";
import { ReviewPhotoStrip } from "@/components/trust/review-photo-strip";
import { formatMonthYear, reviewerDisplayName, type ReviewItem, type ReviewPage } from "@/lib/listing-page";

export function ReviewCard({ review }: { review: ReviewItem }) {
  return (
    <li className="rounded-panel border border-subtle p-4">
      <p className="flex flex-wrap gap-x-2 t-ui">
        <span className="font-semibold text-ink">{reviewerDisplayName(review.reviewer_name)}</span>
        <span className="text-ink">
          <span aria-hidden="true">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)} </span>
          {review.rating} de 5
        </span>
        {formatMonthYear(review.submitted_at) ? <span className="t-meta">{formatMonthYear(review.submitted_at)}</span> : null}
      </p>
      {review.comment ? <p className="mt-2 whitespace-pre-line t-ui text-ink-2">{review.comment}</p> : null}
      <ReviewPhotoStrip photos={review.photos} className="mt-3" />
      <div className="mt-3">
        <ContentReport targetType="review" targetId={review.id} label="Reportar reseña" />
      </div>
    </li>
  );
}

// "Ver las 14 reseñas" (list-06): loads the rest in pages of 20 under the five shown, no new page.
export function MoreReviews({ subject, shown, total }: { subject: { user?: string; store?: string }; shown: number; total: number }) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const loaded = shown + items.length;
  if (loaded >= total) {
    return items.length ? <ol className="grid gap-3">{items.map((review) => <ReviewCard key={review.id} review={review} />)}</ol> : null;
  }

  async function load() {
    setBusy(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ ...(subject.user ? { user: subject.user } : { store: subject.store ?? "" }), offset: String(loaded) });
      const response = await fetch(`/api/listing-reviews?${params}`);
      if (!response.ok) throw new Error("load");
      const page = (await response.json()) as ReviewPage;
      setItems((current) => [...current, ...page.items.filter((item) => !current.some((known) => known.id === item.id))]);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      {items.length ? <ol className="grid gap-3">{items.map((review) => <ReviewCard key={review.id} review={review} />)}</ol> : null}
      <button type="button" onClick={() => void load()} disabled={busy} aria-busy={busy} className="link w-fit t-ui font-semibold">
        {busy ? "Cargando reseñas…" : items.length ? "Ver más reseñas" : `Ver las ${total} reseñas`}
      </button>
      {failed ? <p role="alert" className="t-meta font-semibold text-danger">No pudimos cargar las reseñas. Intenta de nuevo.</p> : null}
    </div>
  );
}
