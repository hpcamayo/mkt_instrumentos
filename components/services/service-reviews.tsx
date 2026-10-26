"use client";

import { useMemo, useState } from "react";
import { ContentReport } from "@/components/content-report";
import { formatMonthYear } from "@/lib/listing-page";
import { readServiceReviews, type ServiceReview } from "@/lib/services";
import { servicesDb } from "@/lib/services-db";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

export function ServiceReviewCard({ review }: { review: ServiceReview }) {
  const date = formatMonthYear(review.createdAt);
  return (
    <li className="rounded-panel border border-subtle p-4">
      <p className="flex flex-wrap gap-x-2 t-ui">
        <span className="font-semibold text-ink">{review.reviewerName}</span>
        <span className="text-ink">
          <span aria-hidden="true">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)} </span>
          {review.rating} de 5
        </span>
        {date ? <span className="t-meta">{date}</span> : null}
      </p>
      {review.comment ? <p className="mt-2 whitespace-pre-line t-ui text-ink-2">{review.comment}</p> : null}
      <div className="mt-3">
        <ContentReport targetType="service_review" targetId={review.id} label="Reportar reseña" />
      </div>
    </li>
  );
}

// "Ver las 14 reseñas": the rest in pages of 20 under the five shown, without leaving the page.
export function MoreServiceReviews({ serviceId, shown, total }: { serviceId: string; shown: number; total: number }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [items, setItems] = useState<ServiceReview[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const loaded = shown + items.length;
  if (loaded >= total) {
    return items.length ? <ol className="grid gap-3">{items.map((review) => <ServiceReviewCard key={review.id} review={review} />)}</ol> : null;
  }

  async function load() {
    if (!supabase) return setFailed(true);
    setBusy(true);
    setFailed(false);
    const { data, error } = await servicesDb(supabase).rpc("get_service_reviews", { p_service_id: serviceId, p_offset: loaded, p_limit: 20 });
    setBusy(false);
    if (error) return setFailed(true);
    const page = readServiceReviews(data);
    setItems((current) => [...current, ...page.filter((item) => !current.some((known) => known.id === item.id))]);
  }

  return (
    <div className="grid gap-3">
      {items.length ? <ol className="grid gap-3">{items.map((review) => <ServiceReviewCard key={review.id} review={review} />)}</ol> : null}
      <button type="button" onClick={() => void load()} disabled={busy} aria-busy={busy} className="link inline-flex min-h-6 w-fit items-center t-ui font-semibold">
        {busy ? "Cargando reseñas…" : items.length ? "Ver más reseñas" : `Ver las ${total} reseñas`}
      </button>
      {failed ? <p role="alert" className="t-meta font-semibold text-danger">No pudimos cargar las reseñas. Intenta de nuevo.</p> : null}
    </div>
  );
}
