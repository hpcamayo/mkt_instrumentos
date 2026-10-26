"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { StatusTag } from "@/components/ui/tag";
import {
  formatServicePrice,
  readOwnerService,
  serviceCategoryLabel,
  serviceErrorMessage,
  serviceModalityLabel,
  servicePhotoUrl,
  servicePlaceLine,
  serviceSkillLabel,
} from "@/lib/services";
import { servicesDb } from "@/lib/services-db";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type Decision = "approve" | "reject" | "hide" | "restore" | "recheck_ok";
const DECISION_LABELS: Record<Decision, string> = {
  approve: "Aprobar",
  reject: "Rechazar",
  hide: "Ocultar",
  restore: "Volver a publicar",
  recheck_ok: "Cambios correctos",
};
const NEEDS_REASON: Decision[] = ["reject", "hide"];

const REPORT_REASONS: Record<string, string> = {
  posible_estafa: "Posible estafa",
  informacion_falsa: "Información falsa o engañosa",
  articulo_prohibido: "Contenido prohibido",
  contenido_inapropiado: "Contenido inapropiado",
  acoso: "Acoso",
  spam: "Spam",
  otro: "Otro",
};

function useDecision() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  async function run(key: string, call: () => PromiseLike<{ error: { message: string } | null }>) {
    if (busy) return;
    setBusy(key);
    setMessage(null);
    const { error } = await call();
    setBusy(null);
    if (error) return setMessage({ tone: "danger", text: serviceErrorMessage(error.message, "No se pudo guardar la decisión.") });
    setMessage({ tone: "success", text: "Decisión guardada." });
    router.refresh();
  }
  return { supabase, busy, message, run };
}

// bet-02, Admin › Servicios: one service as its owner wrote it, with who is behind it (account, e-mail, store), and the
// decisions that apply to its state. Rejecting and hiding need a reason the owner sees; a decision applies only to the
// version shown (a newer edit asks to reload).
export function AdminServiceRow({ row }: { row: Record<string, unknown> }) {
  const service = readOwnerService(row);
  const id = useId();
  const { supabase, busy, message, run } = useDecision();
  if (!service) return null;
  const store = typeof row.store === "object" && row.store ? (row.store as { name?: string; slug?: string }) : null;
  const decisions: Decision[] = service.status === "pending" ? ["approve", "reject"]
    : service.status === "hidden" ? ["restore"]
    : service.status === "approved" || service.status === "paused" ? [...(service.needsRecheck ? (["recheck_ok"] as Decision[]) : []), "hide"]
    : [];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const decision = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value as Decision | undefined;
    if (!decision || !decisions.includes(decision) || !supabase || !service) return;
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    void run(decision, () => servicesDb(supabase).rpc("admin_review_service", { p_service_id: service.id, p_decision: decision, p_reason: reason || null, p_expected_version: service.version }));
  }

  return (
    <li className="grid gap-3 rounded-panel border border-subtle bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-1">
          <p className="t-micro text-ink-2">{serviceCategoryLabel(service.category)}</p>
          <Link href={service.path} className="link break-words t-section">{service.title}</Link>
          <p className="t-ui text-ink-2">
            {store?.name ? <>Tienda <Link href={`/tiendas/${store.slug}`} className="link font-semibold">{store.name}</Link></> : <>Particular: <strong className="font-semibold text-ink">{service.providerName}</strong></>}
            {typeof row.owner_email === "string" ? ` · ${row.owner_email}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusTag domain="service" status={service.status} />
          {service.needsRecheck ? <span className="t-meta font-semibold text-ink">Cambios por revisar</span> : null}
          {Number(row.open_reports) > 0 ? <span className="t-meta font-semibold text-danger">{String(row.open_reports)} reportes abiertos</span> : null}
        </div>
      </div>
      <dl className="grid gap-x-6 gap-y-1 t-ui sm:grid-cols-2">
        <div><dt className="inline font-semibold text-ink">Precio: </dt><dd className="inline text-ink-2">{formatServicePrice(service.priceFrom, service.priceUnit)}</dd></div>
        <div><dt className="inline font-semibold text-ink">Lugar: </dt><dd className="inline text-ink-2">{servicePlaceLine(service) || service.city}</dd></div>
        <div><dt className="inline font-semibold text-ink">Dónde: </dt><dd className="inline text-ink-2">{service.modalities.map((modality) => serviceModalityLabel(modality)).join(" · ")}</dd></div>
        {service.skills.length ? <div><dt className="inline font-semibold text-ink">Qué: </dt><dd className="inline text-ink-2">{service.skills.map(serviceSkillLabel).join(" · ")}</dd></div> : null}
        {service.areas.length ? <div className="sm:col-span-2"><dt className="inline font-semibold text-ink">Zonas: </dt><dd className="inline text-ink-2">{service.areas.join(" · ")}</dd></div> : null}
        {service.moderationReason ? <div className="sm:col-span-2"><dt className="inline font-semibold text-ink">Motivo registrado: </dt><dd className="inline text-ink-2">{service.moderationReason}</dd></div> : null}
      </dl>
      <p className="max-h-48 overflow-y-auto whitespace-pre-line rounded-control bg-canvas p-3 t-ui text-ink-2">{service.description}</p>
      {service.photoPaths.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Fotos">
          {service.photoPaths.map((path, index) => {
            const url = servicePhotoUrl(path);
            return url ? (
              <li key={path}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="link t-meta">Foto {index + 1}</a>
              </li>
            ) : null;
          })}
        </ul>
      ) : null}
      {decisions.length ? (
        <form onSubmit={submit} className="grid gap-3">
          <Field id={`${id}-motivo`} label="Motivo" hint={decisions.some((decision) => NEEDS_REASON.includes(decision)) ? "Obligatorio para rechazar u ocultar; quien ofrece el servicio lo verá." : "Opcional."}>
            <Input name="reason" maxLength={500} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {decisions.map((decision) => (
              <Button key={decision} type="submit" name="decision" value={decision} variant={NEEDS_REASON.includes(decision) ? "danger" : "secondary"} loading={busy === decision} loadingLabel="Guardando">
                {DECISION_LABELS[decision]}
              </Button>
            ))}
          </div>
        </form>
      ) : null}
      {message ? <Notice tone={message.tone} role={message.tone === "danger" ? "alert" : "status"}>{message.text}</Notice> : null}
    </li>
  );
}

// An open report on a service or one of its reviews. Closing it never moderates the target by itself: hiding the
// review or the service is its own button here, and the note doubles as the reason the owner sees.
export function AdminServiceReportRow({ row }: { row: Record<string, unknown> }) {
  const id = useId();
  const { supabase, busy, message, run } = useDecision();
  const service = (row.service ?? {}) as { id?: string; title?: string; path?: string; status?: string; provider_name?: string; version?: number };
  const review = row.review && typeof row.review === "object" ? (row.review as { id: string; rating: number; comment: string | null; status: string }) : null;
  const reportId = String(row.id ?? "");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
    const note = String(new FormData(event.currentTarget).get("note") ?? "").trim();
    if (!supabase || !action) return;
    if (action === "hide_review" && review) {
      void run(action, () => servicesDb(supabase).rpc("admin_moderate_service_review", { p_review_id: review.id, p_action: "hide", p_reason: note }));
    } else if (action === "hide_service" && service.id) {
      void run(action, () => servicesDb(supabase).rpc("admin_review_service", { p_service_id: service.id, p_decision: "hide", p_reason: note, p_expected_version: service.version ?? null }));
    } else if (action === "resolved" || action === "dismissed") {
      void run(action, () => servicesDb(supabase).rpc("admin_close_service_report", { p_report_id: reportId, p_status: action, p_note: note }));
    }
  }

  return (
    <li className="grid gap-3 rounded-panel border border-subtle bg-white p-4 sm:p-5">
      <div className="grid gap-1">
        <p className="t-micro text-ink-2">{row.target_type === "service_review" ? "Reporte de reseña" : "Reporte de servicio"}</p>
        <p className="t-section text-ink">{REPORT_REASONS[String(row.reason)] ?? String(row.reason)}</p>
        <p className="t-ui text-ink-2">
          {service.path ? <Link href={service.path} className="link font-semibold">{service.title}</Link> : service.title}
          {service.provider_name ? ` · ${service.provider_name}` : ""} · reportó {String(row.reporter_name ?? "una persona")}
        </p>
      </div>
      {typeof row.detail === "string" && row.detail ? <p className="whitespace-pre-line rounded-control bg-canvas p-3 t-ui text-ink-2">{row.detail}</p> : null}
      {review ? (
        <p className="t-ui text-ink">
          Reseña: {review.rating} de 5{review.comment ? ` · «${review.comment}»` : ""} <StatusTag domain="review" status={review.status} />
        </p>
      ) : null}
      <form onSubmit={submit} className="grid gap-3">
        <Field id={`${id}-nota`} label="Nota de moderación" hint="Obligatoria, de 3 a 500 caracteres. Queda en la auditoría; si ocultas el servicio, quien lo ofrece la verá como motivo.">
          <Input name="note" maxLength={500} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {review && review.status === "visible" ? <Button type="submit" value="hide_review" variant="danger" loading={busy === "hide_review"} loadingLabel="Guardando">Ocultar reseña</Button> : null}
          {!review && (service.status === "approved" || service.status === "paused") ? <Button type="submit" value="hide_service" variant="danger" loading={busy === "hide_service"} loadingLabel="Guardando">Ocultar servicio</Button> : null}
          <Button type="submit" value="resolved" variant="secondary" loading={busy === "resolved"} loadingLabel="Guardando">Resolver</Button>
          <Button type="submit" value="dismissed" variant="quiet" loading={busy === "dismissed"} loadingLabel="Guardando">Desestimar</Button>
        </div>
      </form>
      {message ? <Notice tone={message.tone} role={message.tone === "danger" ? "alert" : "status"}>{message.text}</Notice> : null}
    </li>
  );
}

// A review (newest first): hide it or show it again, always with a reason.
export function AdminServiceReviewRow({ row }: { row: Record<string, unknown> }) {
  const id = useId();
  const { supabase, busy, message, run } = useDecision();
  const service = (row.service ?? {}) as { title?: string; path?: string; provider_name?: string };
  const status = String(row.status ?? "visible");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    if (!supabase) return;
    void run("review", () => servicesDb(supabase).rpc("admin_moderate_service_review", { p_review_id: String(row.id), p_action: status === "hidden" ? "restore" : "hide", p_reason: reason }));
  }
  return (
    <li className="grid gap-3 rounded-panel border border-subtle bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="t-ui text-ink">
          <strong className="font-semibold">{String(row.reviewer_name ?? "Cliente")}</strong> · {String(row.rating)} de 5 ·{" "}
          {service.path ? <Link href={service.path} className="link">{service.title}</Link> : service.title}
        </p>
        <StatusTag domain="review" status={status} />
      </div>
      {typeof row.comment === "string" && row.comment ? <p className="whitespace-pre-line t-ui text-ink-2">{row.comment}</p> : null}
      {typeof row.hidden_reason === "string" && row.hidden_reason ? <p className="t-meta">Motivo: {row.hidden_reason}</p> : null}
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field id={`${id}-motivo`} label="Motivo">
          <Input name="reason" maxLength={500} />
        </Field>
        <Button type="submit" variant={status === "hidden" ? "secondary" : "danger"} loading={busy === "review"} loadingLabel="Guardando">
          {status === "hidden" ? "Mostrar reseña" : "Ocultar reseña"}
        </Button>
      </form>
      {message ? <Notice tone={message.tone} role={message.tone === "danger" ? "alert" : "status"}>{message.text}</Notice> : null}
    </li>
  );
}
