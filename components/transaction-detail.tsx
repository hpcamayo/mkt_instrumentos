"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { PageNotice } from "@/components/page-notice";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import {
  transactionErrorMessage,
  transactionStateLabel,
  type EligibleBuyer,
  type TransactionDetail,
  type TransactionReview,
} from "@/lib/transactions";

export function TransactionDetailView({
  detail,
  candidates,
}: {
  detail: TransactionDetail;
  candidates: EligibleBuyer[];
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();
  const [selectedBuyer, setSelectedBuyer] = useState(candidates[0]?.buyer_user_id ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");
  const eligibleSelectedBuyer = candidates.some(
    (candidate) => candidate.buyer_user_id === selectedBuyer,
  )
    ? selectedBuyer
    : candidates[0]?.buyer_user_id ?? "";

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>, success: string) {
    if (!supabase || busy) return;
    setBusy(true);
    setMessage("");
    const { error } = await action();
    setBusy(false);
    if (error) {
      setMessageKind("error");
      setMessage(transactionErrorMessage(error.message));
      return;
    }
    setMessageKind("success");
    setMessage(success);
    router.refresh();
  }

  async function createClaim() {
    if (!eligibleSelectedBuyer || !supabase) return;
    await run(
      () => supabase.rpc("create_transaction_claim", {
        p_listing_id: detail.listing_id,
        p_buyer_user_id: eligibleSelectedBuyer,
      }),
      "Enviamos la solicitud al contacto seleccionado.",
    );
  }

  async function recordExternal() {
    if (!supabase || !window.confirm("¿Registrar esta venta como realizada fuera de Laria o con una persona sin cuenta?")) return;
    await run(
      () => supabase.rpc("record_external_sale", { p_listing_id: detail.listing_id }),
      "La venta quedó registrada sin comprador Laria. No habilita reseñas verificadas.",
    );
  }

  async function respond(confirmed: boolean) {
    if (!supabase || !detail.claim_id) return;
    await run(
      () => supabase.rpc("respond_transaction_claim", {
        p_claim_id: detail.claim_id!,
        p_confirmed: confirmed,
      }),
      confirmed ? "Confirmaste la compra. Se abrió el plazo de 10 días para ambas reseñas." : "Indicamos al vendedor que no realizaste esta compra.",
    );
  }

  async function cancelClaim() {
    if (!supabase || !detail.claim_id || !window.confirm("¿Cancelar esta solicitud de confirmación?")) return;
    await run(
      () => supabase.rpc("cancel_transaction_claim", { p_claim_id: detail.claim_id! }),
      "La solicitud fue cancelada. Puedes seleccionar otro contacto elegible.",
    );
  }

  return (
    <div className="grid gap-5">
      {message ? <PageNotice kind={messageKind} message={message} /> : null}
      <section className="rounded-lg border border-laria-fog bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-laria-blue">{detail.role === "buyer" ? "Compra" : "Venta"}</p>
            <h1 className="mt-1 text-2xl font-black text-laria-ink">{detail.listing_title}</h1>
            <p className="mt-2 text-sm font-bold text-laria-text-soft">{transactionStateLabel(detail.state)}</p>
            <p className="mt-1 text-xs text-laria-muted">Marcada vendida: {formatDateTime(detail.sold_at)}</p>
          </div>
          <Link href={`/instrumentos/${detail.listing_slug}`} className="laria-button-secondary min-h-11 px-4 py-3 text-sm">Ver publicación vendida</Link>
        </div>
        <div className="mt-5 rounded-md border border-laria-blue/25 bg-laria-blue/10 p-4 text-sm leading-6 text-laria-text-soft">
          La verificación significa únicamente que vendedor y comprador reconocen una relación originada en Laria. No verifica pago, entrega, envío, autenticidad ni condición.
        </div>
      </section>

      {detail.role === "seller" && detail.state !== "verified" ? (
        <SellerAttribution
          detail={detail}
          candidates={candidates}
          selectedBuyer={eligibleSelectedBuyer}
          busy={busy}
          onSelect={setSelectedBuyer}
          onCreate={() => void createClaim()}
          onExternal={() => void recordExternal()}
          onCancel={() => void cancelClaim()}
        />
      ) : null}

      {detail.role === "buyer" && detail.state === "pending" ? (
        <section className="rounded-lg border border-laria-fog bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-black text-laria-ink">¿Compraste este artículo?</h2>
          <p className="mt-2 text-sm leading-6 text-laria-text-soft">Vendedor: {detail.seller_name}. Responde solo si reconoces esta compra.</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button type="button" disabled={busy} onClick={() => void respond(true)} className="laria-button-primary min-h-11 px-5 py-3 text-sm disabled:opacity-50">Sí, lo compré</button>
            <button type="button" disabled={busy} onClick={() => void respond(false)} className="laria-button-secondary min-h-11 px-5 py-3 text-sm disabled:opacity-50">No, no fui yo</button>
          </div>
        </section>
      ) : null}

      {detail.state === "verified" && detail.transaction_id && detail.review_deadline ? (
        <ReviewSection detail={detail} busy={busy} run={run} />
      ) : null}
    </div>
  );
}

function SellerAttribution({
  detail,
  candidates,
  selectedBuyer,
  busy,
  onSelect,
  onCreate,
  onExternal,
  onCancel,
}: {
  detail: TransactionDetail;
  candidates: EligibleBuyer[];
  selectedBuyer: string;
  busy: boolean;
  onSelect: (value: string) => void;
  onCreate: () => void;
  onExternal: () => void;
  onCancel: () => void;
}) {
  const pending = detail.state === "pending";
  return (
    <section className="rounded-lg border border-laria-fog bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-black text-laria-ink">¿Cómo se realizó la venta?</h2>
      {pending ? (
        <>
          <p className="mt-2 text-sm leading-6 text-laria-text-soft">
            {detail.buyer_name ?? "El contacto seleccionado"} debe confirmar. Puedes cancelar antes de su respuesta si elegiste por error.
          </p>
          <button type="button" disabled={busy} onClick={onCancel} className="laria-button-secondary mt-4 min-h-11 px-4 py-3 text-sm disabled:opacity-50">Cancelar solicitud</button>
        </>
      ) : (
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div className="rounded-md border border-laria-fog p-4">
            <h3 className="font-black text-laria-ink">Me contactó por Laria</h3>
            <p className="mt-2 text-xs leading-5 text-laria-text-soft">Solo se muestran cuentas autenticadas que abrieron WhatsApp desde esta publicación antes de marcarla vendida.</p>
            {candidates.length ? (
              <>
                <label className="mt-4 grid gap-2 text-sm font-bold text-laria-text-soft">
                  Contacto elegible
                  <select value={selectedBuyer} onChange={(event) => onSelect(event.target.value)} className="min-h-11 rounded-md border border-laria-steel bg-white px-3 text-laria-ink">
                    {candidates.map((candidate) => (
                      <option key={candidate.buyer_user_id} value={candidate.buyer_user_id}>
                        {candidate.display_name || "Cuenta de Laria"} · contacto {formatDateTime(candidate.last_contact_at)}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" disabled={busy || !selectedBuyer} onClick={onCreate} className="laria-button-primary mt-4 min-h-11 px-4 py-3 text-sm disabled:opacity-50">Solicitar confirmación</button>
              </>
            ) : <p className="mt-4 text-sm font-bold text-laria-text-soft">No hay otros contactos autenticados elegibles para esta publicación.</p>}
          </div>
          <div className="rounded-md border border-laria-fog p-4">
            <h3 className="font-black text-laria-ink">Venta fuera de Laria / comprador sin cuenta</h3>
            <p className="mt-2 text-xs leading-5 text-laria-text-soft">Mantiene la publicación vendida, pero no crea una transacción verificada ni habilita reseñas.</p>
            <button type="button" disabled={busy} onClick={onExternal} className="laria-button-secondary mt-4 min-h-11 px-4 py-3 text-sm disabled:opacity-50">Registrar venta externa</button>
          </div>
        </div>
      )}
    </section>
  );
}

function ReviewSection({
  detail,
  busy,
  run,
}: {
  detail: TransactionDetail;
  busy: boolean;
  run: (action: () => PromiseLike<{ error: { message: string } | null }>, success: string) => Promise<void>;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !detail.transaction_id || !window.confirm("La reseña será final: no podrás editarla ni eliminarla libremente. ¿Deseas enviarla?")) return;
    const form = new FormData(event.currentTarget);
    await run(
      () => supabase.rpc("submit_transaction_review", {
        p_transaction_id: detail.transaction_id!,
        p_rating: Number(form.get("rating")),
        p_comment: String(form.get("comment") ?? ""),
      }),
      "Tu reseña fue enviada. Permanecerá oculta hasta que ambas partes reseñen o termine el plazo.",
    );
  }

  return (
    <section className="rounded-lg border border-laria-fog bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-black text-laria-ink">Reseñas de la transacción</h2>
      <p className="mt-2 text-sm leading-6 text-laria-text-soft">
        Plazo: hasta {formatDateTime(detail.review_deadline!)}. Las reseñas son doble ciego: se revelan cuando ambas partes envían o al terminar los 10 días.
      </p>
      {detail.own_review ? (
        <div className="mt-4 rounded-md border border-laria-blue/25 bg-laria-blue/10 p-4">
          <p className="font-black text-laria-blue">Tu reseña fue enviada</p>
          <p className="mt-1 text-sm text-laria-text-soft">{stars(detail.own_review.rating)}{detail.own_review.comment ? ` · ${detail.own_review.comment}` : ""}</p>
          <p className="mt-2 text-xs text-laria-muted">No puede editarse ni eliminarse libremente.</p>
        </div>
      ) : detail.review_window_open ? (
        <form onSubmit={submitReview} className="mt-5 grid gap-4">
          <label className="grid max-w-xs gap-2 text-sm font-bold text-laria-text-soft">
            Calificación
            <select name="rating" required defaultValue="" className="min-h-11 rounded-md border border-laria-steel bg-white px-3 text-laria-ink">
              <option value="" disabled>Selecciona 1 a 5</option>
              {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} {rating === 1 ? "estrella" : "estrellas"}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold text-laria-text-soft">
            Comentario opcional
            <textarea name="comment" maxLength={2000} rows={4} className="rounded-md border border-laria-steel bg-white px-3 py-2 text-laria-ink" />
          </label>
          <button type="submit" disabled={busy} className="laria-button-primary min-h-11 w-fit px-5 py-3 text-sm disabled:opacity-50">Enviar reseña final</button>
        </form>
      ) : <p className="mt-4 rounded-md border border-laria-fog bg-laria-cloud p-4 text-sm font-bold text-laria-text-soft">El plazo para enviar una reseña terminó.</p>}

      {detail.visible_reviews.length ? (
        <div className="mt-6 grid gap-3">
          <h3 className="font-black text-laria-ink">Reseñas visibles</h3>
          {detail.visible_reviews.map((review) => <VisibleReview key={review.id} review={review} busy={busy} run={run} />)}
        </div>
      ) : <p className="mt-5 text-sm text-laria-text-soft">Todavía no hay reseñas reveladas.</p>}
    </section>
  );
}

function VisibleReview({
  review,
  busy,
  run,
}: {
  review: TransactionReview;
  busy: boolean;
  run: (action: () => PromiseLike<{ error: { message: string } | null }>, success: string) => Promise<void>;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [reportOpen, setReportOpen] = useState(false);
  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const data = new FormData(event.currentTarget);
    await run(
      () => supabase.rpc("report_review", {
        p_review_id: review.id,
        p_reason: String(data.get("reason")),
        p_detail: String(data.get("detail") ?? ""),
      }),
      "Recibimos tu reporte para moderación.",
    );
    setReportOpen(false);
  }
  return (
    <article className="rounded-md border border-laria-fog p-4">
      <p className="font-black text-laria-ink">{review.reviewer_name ?? "Usuario de Laria"} · {stars(review.rating)}</p>
      {review.comment ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-laria-text-soft">{review.comment}</p> : null}
      <button type="button" onClick={() => setReportOpen((current) => !current)} className="mt-3 text-xs font-black text-laria-blue">Reportar reseña</button>
      {reportOpen ? (
        <form onSubmit={report} className="mt-3 grid gap-3 rounded-md bg-laria-cloud p-3">
          <label className="grid gap-1 text-xs font-bold text-laria-text-soft">Motivo
            <select name="reason" className="min-h-11 rounded-md border border-laria-steel bg-white px-3 text-sm text-laria-ink">
              <option value="acoso">Acoso</option><option value="contenido_inapropiado">Contenido inapropiado</option><option value="informacion_falsa">Información falsa</option><option value="spam">Spam</option><option value="otro">Otro</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-laria-text-soft">Detalle opcional
            <textarea name="detail" maxLength={1000} rows={2} className="rounded-md border border-laria-steel bg-white px-3 py-2 text-sm text-laria-ink" />
          </label>
          <button type="submit" disabled={busy} className="laria-button-secondary min-h-11 w-fit px-4 py-2 text-xs disabled:opacity-50">Enviar reporte</button>
        </form>
      ) : null}
    </article>
  );
}

const dateTime = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Lima",
});
function formatDateTime(value: string) {
  return dateTime.format(new Date(value));
}
function stars(rating: number) {
  return `${rating}/5 ★`;
}
