"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { type PublicReputation, transactionErrorMessage } from "@/lib/transactions";

export function ReputationSummary({ reputation, title = "Reputación en Laria" }: { reputation: PublicReputation; title?: string }) {
  const pathname = usePathname();
  const account = useMarketplaceAccount();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function report(event: FormEvent<HTMLFormElement>, reviewId: string) {
    event.preventDefault();
    if (!supabase) return;
    const data = new FormData(event.currentTarget);
    const { error } = await supabase.rpc("report_review", {
      p_review_id: reviewId,
      p_reason: String(data.get("reason")),
      p_detail: String(data.get("detail") ?? ""),
    });
    setMessage(error ? transactionErrorMessage(error.message) : "Recibimos tu reporte para moderación.");
    if (!error) setReportingId(null);
  }

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
      {message ? <p role="status" className="mt-3 rounded-md bg-laria-cloud p-3 text-xs font-bold text-laria-text-soft">{message}</p> : null}
      {reputation.items.length ? (
        <ol className="mt-4 grid gap-3">
          {reputation.items.map((review) => (
            <li key={review.id} className="rounded-md border border-laria-fog p-4">
              <p className="text-sm font-black text-laria-ink">{review.reviewer_name ?? "Comprador de Laria"} · {review.rating}/5 ★</p>
              {review.comment ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-laria-text-soft">{review.comment}</p> : null}
              {account.authenticated ? (
                <button type="button" onClick={() => setReportingId((current) => current === review.id ? null : review.id)} className="mt-3 text-xs font-black text-laria-blue">Reportar reseña</button>
              ) : (
                <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="mt-3 inline-block text-xs font-black text-laria-blue">Ingresa para reportar</Link>
              )}
              {reportingId === review.id ? (
                <form onSubmit={(event) => void report(event, review.id)} className="mt-3 grid gap-3 rounded-md bg-laria-cloud p-3">
                  <label className="grid gap-1 text-xs font-bold text-laria-text-soft">Motivo
                    <select name="reason" className="min-h-11 rounded-md border border-laria-steel bg-white px-3 text-sm text-laria-ink">
                      <option value="acoso">Acoso</option><option value="contenido_inapropiado">Contenido inapropiado</option><option value="informacion_falsa">Información falsa</option><option value="spam">Spam</option><option value="otro">Otro</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-bold text-laria-text-soft">Detalle opcional
                    <textarea name="detail" maxLength={1000} rows={2} className="rounded-md border border-laria-steel bg-white px-3 py-2 text-sm text-laria-ink" />
                  </label>
                  <button type="submit" className="laria-button-secondary min-h-11 w-fit px-4 py-2 text-xs">Enviar reporte</button>
                </form>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
