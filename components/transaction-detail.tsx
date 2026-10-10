"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageNotice } from "@/components/page-notice";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import {
  transactionErrorMessage,
  type EligibleBuyer,
  type TransactionDetail,
  type TransactionReview,
} from "@/lib/transactions";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { StatusTag } from "@/components/ui/tag";
import { Textarea } from "@/components/ui/textarea";

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
  const [confirm, confirmDialog] = useConfirm();
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
    if (!supabase) return;
    if (!(await confirm({
      title: "¿Registrar esta venta como realizada fuera de Laria o con una persona sin cuenta?",
      body: "No habilita reseñas verificadas.",
      confirmLabel: "Registrar venta",
    }))) return;
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
    if (!supabase || !detail.claim_id) return;
    if (!(await confirm({ title: "¿Cancelar esta solicitud de confirmación?", confirmLabel: "Cancelar solicitud", cancelLabel: "Volver", tone: "danger" }))) return;
    await run(
      () => supabase.rpc("cancel_transaction_claim", { p_claim_id: detail.claim_id! }),
      "La solicitud fue cancelada. Puedes seleccionar otro contacto elegible.",
    );
  }

  return (
    <div className="grid gap-5">
      {message ? <PageNotice kind={messageKind} message={message} /> : null}
      {confirmDialog}
      <section className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <PageHeader
          eyebrow={detail.role === "buyer" ? "Compra" : "Venta"}
          title={detail.listing_title}
          meta={<><StatusTag domain="claim" status={detail.state} className="mt-1" /><p className="mt-2">Marcada vendida: {formatDateTime(detail.sold_at)}</p></>}
          actions={<Link href={`/instrumentos/${detail.listing_slug}`} className={buttonClasses({ variant: "secondary" })}>Ver publicación vendida</Link>}
        />
        <Notice tone="info" role="note" className="mt-5">
          La verificación significa únicamente que vendedor y comprador reconocen una relación originada en Laria. No verifica pago, entrega, envío, autenticidad ni condición.
        </Notice>
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
        <section className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
          <h2 className="t-section text-ink">¿Compraste este equipo?</h2>
          <p className="mt-2 t-ui text-ink-2">Vendedor: {detail.seller_name}. Responde solo si reconoces esta compra.</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button type="button" disabled={busy} onClick={() => void respond(true)} className={buttonClasses()}>Sí, lo compré</button>
            <button type="button" disabled={busy} onClick={() => void respond(false)} className={buttonClasses({ variant: "secondary" })}>No, no fui yo</button>
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
    <section className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
      <h2 className="t-section text-ink">¿Cómo se realizó la venta?</h2>
      {pending ? (
        <>
          <p className="mt-2 t-ui text-ink-2">
            {detail.buyer_name ?? "El contacto seleccionado"} debe confirmar. Puedes cancelar antes de su respuesta si elegiste por error.
          </p>
          <button type="button" disabled={busy} onClick={onCancel} className={buttonClasses({ variant: "secondary", className: "mt-4" })}>Cancelar solicitud</button>
        </>
      ) : (
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div className="rounded-control border border-subtle p-4">
            <h3 className="font-semibold text-ink">Me contactó por Laria</h3>
            <p className="mt-2 t-meta">Solo se muestran cuentas autenticadas que abrieron WhatsApp desde esta publicación antes de marcarla vendida.</p>
            {candidates.length ? (
              <>
                <Field id="atribucion-comprador" label="Contacto elegible" className="mt-4">
                  <Select value={selectedBuyer} onChange={(event) => onSelect(event.target.value)}>
                    {candidates.map((candidate) => (
                      <option key={candidate.buyer_user_id} value={candidate.buyer_user_id}>
                        {candidate.display_name || "Cuenta de Laria"} · contacto {formatDateTime(candidate.last_contact_at)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <button type="button" disabled={busy || !selectedBuyer} onClick={onCreate} className={buttonClasses({ className: "mt-4" })}>Solicitar confirmación</button>
              </>
            ) : <p className="mt-4 text-sm font-semibold text-ink-2">No hay otros contactos autenticados elegibles para esta publicación.</p>}
          </div>
          <div className="rounded-control border border-subtle p-4">
            <h3 className="font-semibold text-ink">Venta fuera de Laria / comprador sin cuenta</h3>
            <p className="mt-2 text-meta leading-5 text-ink-2">Mantiene la publicación vendida, pero no crea una transacción verificada ni habilita reseñas.</p>
            <button type="button" disabled={busy} onClick={onExternal} className={buttonClasses({ variant: "secondary", className: "mt-4" })}>Registrar venta externa</button>
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
  const [confirm, confirmDialog] = useConfirm();
  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !detail.transaction_id) return;
    // Read the form before the confirmation: the event's target is gone after an await.
    const form = new FormData(event.currentTarget);
    if (!(await confirm({
      title: "¿Deseas enviar tu reseña?",
      body: "La reseña será final: no podrás editarla ni eliminarla libremente.",
      confirmLabel: "Enviar reseña",
    }))) return;
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
    <section className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
      {confirmDialog}
      <h2 className="t-section text-ink">Reseñas de la transacción</h2>
      <p className="mt-2 t-ui text-ink-2">
        Plazo: hasta {formatDateTime(detail.review_deadline!)}. Las reseñas son doble ciego: se revelan cuando ambas partes envían o al terminar los 10 días.
      </p>
      {detail.own_review ? (
        <Notice tone="success" role="note" title="Tu reseña fue enviada" className="mt-4">
          <p className="mt-1 text-ink-2">{stars(detail.own_review.rating)}{detail.own_review.comment ? ` · ${detail.own_review.comment}` : ""}</p>
          <p className="mt-2 t-meta">No puede editarse ni eliminarse libremente.</p>
        </Notice>
      ) : detail.review_window_open ? (
        <form onSubmit={submitReview} className="mt-5 grid gap-4">
          <Field id="resena-rating" label="Calificación" className="max-w-xs">
            <Select name="rating" required defaultValue="">
              <option value="" disabled>Selecciona 1 a 5</option>
              {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} {rating === 1 ? "estrella" : "estrellas"}</option>)}
            </Select>
          </Field>
          <Field id="resena-comment" label="Comentario opcional">
            <Textarea name="comment" maxLength={2000} rows={4} />
          </Field>
          <Button type="submit" className="w-fit" loading={busy}>Enviar reseña final</Button>
        </form>
      ) : <p className="mt-4 rounded-panel bg-canvas px-4 py-3 t-ui font-semibold text-ink-2">El plazo para enviar una reseña terminó.</p>}

      {detail.visible_reviews.length ? (
        <div className="mt-6 grid gap-3">
          <h3 className="font-semibold text-ink">Reseñas visibles</h3>
          {detail.visible_reviews.map((review) => <VisibleReview key={review.id} review={review} busy={busy} run={run} />)}
        </div>
      ) : <p className="mt-5 text-sm text-ink-2">Todavía no hay reseñas reveladas.</p>}
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
    <article className="rounded-control border border-subtle p-4">
      <p className="font-semibold text-ink">{review.reviewer_name ?? "Usuario de Laria"} · {stars(review.rating)}</p>
      {review.comment ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink-2">{review.comment}</p> : null}
      <button type="button" onClick={() => setReportOpen((current) => !current)} className="link mt-3 t-meta font-semibold">Reportar reseña</button>
      {reportOpen ? (
        <form onSubmit={report} className="mt-3 grid gap-3 rounded-control bg-canvas p-3">
          <Field id={`reporte-resena-${review.id}-reason`} label="Motivo">
            <Select name="reason">
              <option value="acoso">Acoso</option><option value="contenido_inapropiado">Contenido inapropiado</option><option value="informacion_falsa">Información falsa</option><option value="spam">Spam</option><option value="otro">Otro</option>
            </Select>
          </Field>
          <Field id={`reporte-resena-${review.id}-detail`} label="Detalle opcional">
            <Textarea name="detail" maxLength={1000} rows={2} />
          </Field>
          <Button type="submit" variant="secondary" className="w-fit" loading={busy}>Enviar reporte</Button>
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
