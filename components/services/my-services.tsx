"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { ServiceCategoryIcon } from "@/components/services/service-card";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Radio } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import { StatusTag } from "@/components/ui/tag";
import { formatMonthYear } from "@/lib/listing-page";
import {
  formatServicePrice,
  readBookingCandidates,
  serviceCategoryLabel,
  serviceErrorMessage,
  serviceRatingLabel,
  SERVICE_PHOTO_BUCKET,
  type BookingCandidate,
  type OwnerService,
} from "@/lib/services";
import { servicesDb } from "@/lib/services-db";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type Feedback = { tone: "success" | "danger"; text: string } | null;

// bet-02, Mi cuenta › Servicios: the account's services with their state, what Admin said, their figures (views and
// WhatsApp contacts in the last 30 days, reviews) and the actions: see the page, edit, pause or resume, confirm a client
// and delete. A service with confirmed clients or reviews can only be paused, so its reviews are never wiped.
export function MyServices({ services }: { services: OwnerService[] }) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [confirm, dialog] = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [picking, setPicking] = useState<OwnerService | null>(null);

  async function run(service: OwnerService, action: "pause" | "resume" | "delete") {
    if (!supabase || busy) return;
    if (action === "delete") {
      const ok = await confirm({
        title: "¿Eliminar este servicio?",
        body: "Se borran la página y sus fotos. Si solo quieres dejar de recibir mensajes por un tiempo, puedes pausarlo.",
        confirmLabel: "Eliminar servicio",
        tone: "danger",
      });
      if (!ok) return;
    }
    setBusy(`${service.id}:${action}`);
    const db = servicesDb(supabase);
    const { error } = action === "delete"
      ? await db.rpc("delete_service", { p_service_id: service.id })
      : await db.rpc("set_service_paused", { p_service_id: service.id, p_paused: action === "pause" });
    setBusy(null);
    // The page is gone; its photos go too (best effort; the bucket refuses a photo another service still uses).
    if (!error && action === "delete" && service.photoPaths.length) void supabase.storage.from(SERVICE_PHOTO_BUCKET).remove(service.photoPaths).catch(() => undefined);
    setFeedback((current) => ({
      ...current,
      [service.id]: error
        ? { tone: "danger", text: serviceErrorMessage(error.message, "No pudimos guardar el cambio. Intenta nuevamente.") }
        : { tone: "success", text: action === "pause" ? "Pausaste el servicio: ya no aparece en Servicios." : action === "resume" ? "El servicio vuelve a aparecer en Servicios." : "Eliminaste el servicio." },
    }));
    if (!error) router.refresh();
  }

  return (
    <>
      <ul className="grid gap-4">
        {services.map((service) => {
          const rating = service.rating ? serviceRatingLabel(service.rating) : null;
          const note = feedback[service.id];
          return (
            <li key={service.id} className="grid gap-3 rounded-panel border border-subtle bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <ServiceCategoryIcon category={service.category} className="mt-1 h-6 w-6 shrink-0" />
                  <div className="grid min-w-0 gap-1">
                    <p className="t-micro text-ink-2">{serviceCategoryLabel(service.category)}</p>
                    <h3 className="break-words t-card-title text-ink">{service.title}</h3>
                    <p className="t-meta tabular-nums">{formatServicePrice(service.priceFrom, service.priceUnit)} · {service.city}</p>
                  </div>
                </div>
                <StatusTag domain="service" status={service.status} />
              </div>
              {service.status === "pending" ? (
                <p className="t-ui text-ink-2">Moderación lo revisa antes de publicarlo. Te avisaremos por aquí y por correo.</p>
              ) : null}
              {(service.status === "rejected" || service.status === "hidden") && service.moderationReason ? (
                <Notice tone={service.status === "rejected" ? "danger" : "warning"} title={service.status === "rejected" ? "Qué corregir" : "Por qué se ocultó"}>
                  {service.moderationReason} Edítalo y guárdalo para enviarlo otra vez a revisión.
                </Notice>
              ) : null}
              {service.needsRecheck && service.status !== "pending" ? (
                <p className="t-meta">Moderación revisará tus últimos cambios de título, descripción, nombre o fotos. Mientras tanto el servicio sigue visible.</p>
              ) : null}
              {service.stats ? (
                <dl className="grid grid-cols-3 gap-2 rounded-control bg-canvas p-3">
                  <div>
                    <dt className="t-meta">Visitas, 30 días</dt>
                    <dd className="t-card-title tabular-nums text-ink">{service.stats.views30d}</dd>
                  </div>
                  <div>
                    <dt className="t-meta">Contactos, 30 días</dt>
                    <dd className="t-card-title tabular-nums text-ink">{service.stats.contacts30d}</dd>
                  </div>
                  <div>
                    <dt className="t-meta">Reseñas</dt>
                    <dd className="t-ui text-ink">{rating ?? "Aún no tiene"}</dd>
                  </div>
                </dl>
              ) : null}
              {note ? <Notice tone={note.tone} role={note.tone === "danger" ? "alert" : "status"}>{note.text}</Notice> : null}
              <div className="flex flex-wrap gap-2">
                {service.isPublic || service.status !== "approved" ? (
                  <Button href={service.path} variant="secondary" size="sm">{service.isPublic ? "Ver página" : "Vista previa"}</Button>
                ) : null}
                <Button href={`/mi-cuenta/servicios/${service.id}/editar`} variant="secondary" size="sm">Editar</Button>
                {service.status === "approved" || service.status === "paused" ? (
                  <Button variant="secondary" size="sm" onClick={() => setPicking(service)}>Confirmar un cliente</Button>
                ) : null}
                {service.status === "approved" ? (
                  <Button variant="quiet" size="sm" loading={busy === `${service.id}:pause`} loadingLabel="Pausando…" onClick={() => void run(service, "pause")}>Pausar</Button>
                ) : null}
                {service.status === "paused" ? (
                  <Button variant="quiet" size="sm" loading={busy === `${service.id}:resume`} loadingLabel="Reanudando…" onClick={() => void run(service, "resume")}>Reanudar</Button>
                ) : null}
                {service.canDelete ? (
                  <Button variant="quiet" size="sm" loading={busy === `${service.id}:delete`} loadingLabel="Eliminando…" onClick={() => void run(service, "delete")}>Eliminar</Button>
                ) : null}
              </div>
              {!service.canDelete ? (
                <p className="t-meta">Tiene clientes confirmados o reseñas, así que no se puede eliminar; puedes pausarlo.</p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {picking ? <ConfirmClientSheet service={picking} onClose={(sent) => { setPicking(null); if (sent) router.refresh(); }} /> : null}
      {dialog}
    </>
  );
}

// "Confirmar un cliente": the people who wrote through Laria's button with their account in the last 180 days, by
// first name and initial, the last contact and the last three digits of their WhatsApp. Nobody is preselected.
function ConfirmClientSheet({ service, onClose }: { service: OwnerService; onClose: (sent: boolean) => void }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const id = useId();
  const [candidates, setCandidates] = useState<BookingCandidate[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    void servicesDb(supabase).rpc("get_service_booking_candidates", { p_service_id: service.id }).then(({ data, error }) => {
      if (error) setFailed(serviceErrorMessage(error.message, "No pudimos cargar a tus contactos. Intenta nuevamente."));
      else setCandidates(readBookingCandidates(data));
    });
  }, [service.id, supabase]);

  async function send() {
    if (!supabase || !chosen || busy) return;
    setBusy(true);
    setFailed(null);
    const { error } = await servicesDb(supabase).rpc("request_service_booking", { p_service_id: service.id, p_client_user_id: chosen });
    setBusy(false);
    if (error) return setFailed(serviceErrorMessage(error.message, "No pudimos enviar la solicitud. Intenta nuevamente."));
    setSent(true);
  }

  return (
    <Sheet
      title="Confirmar un cliente"
      closeLabel="Cerrar"
      layout="responsive"
      onDismiss={() => onClose(sent)}
      footer={sent ? (
        <Button variant="secondary" onClick={() => onClose(true)}>Listo</Button>
      ) : (
        <Button variant="secondary" loading={busy} loadingLabel="Enviando…" disabled={!chosen} onClick={() => void send()}>Pedir confirmación</Button>
      )}
    >
      <div className="grid gap-3">
        <p className="t-ui text-ink-2">
          Elige a quién le diste «{service.title}». Le pediremos que lo confirme; cuando lo haga, podrá dejar su reseña. Solo
          aparecen quienes te escribieron con el botón de WhatsApp de Laria con su cuenta abierta en los últimos 180 días.
        </p>
        {sent ? <Notice tone="success" role="status">Enviamos la solicitud. Te avisaremos cuando responda.</Notice> : null}
        {failed ? <Notice tone="danger" role="alert">{failed}</Notice> : null}
        {!sent && candidates === null && !failed ? <p role="status" className="t-meta">Cargando…</p> : null}
        {!sent && candidates?.length === 0 ? (
          <p className="t-ui text-ink">Todavía no hay personas para confirmar. Aparecerán aquí cuando te escriban desde tu página de servicio.</p>
        ) : null}
        {!sent && candidates?.length ? (
          <fieldset className="grid gap-1">
            <legend className="sr-only">Personas que te escribieron</legend>
            {candidates.map((candidate) => (
              <Radio
                key={candidate.userId}
                name={`${id}-cliente`}
                value={candidate.userId}
                checked={chosen === candidate.userId}
                onChange={() => setChosen(candidate.userId)}
                label={candidate.name}
                description={[
                  candidate.lastContactAt ? `Te escribió en ${formatMonthYear(candidate.lastContactAt) ?? "los últimos meses"}` : null,
                  candidate.phoneTail ? `WhatsApp terminado en ${candidate.phoneTail}` : null,
                ].filter(Boolean).join(" · ")}
              />
            ))}
          </fieldset>
        ) : null}
      </div>
    </Sheet>
  );
}

export function ServiceIntro({ hasServices }: { hasServices: boolean }) {
  return (
    <p className="max-w-3xl">
      {hasServices
        ? "Tus servicios para músicos, aparte de tus instrumentos. "
        : "Ofrece clases, reparaciones, tu sala de ensayo, tu estudio o sonido para eventos. "}
      Moderación revisa cada servicio antes de publicarlo. No aparecen en el catálogo de instrumentos.{" "}
      <Link href="/servicios" className="link">Ver Servicios para músicos</Link>
    </p>
  );
}
