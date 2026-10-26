"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ServiceReviewForm } from "@/components/services/service-review-form";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { StatusTag } from "@/components/ui/tag";
import { formatMonthYear } from "@/lib/listing-page";
import { bookingActions, serviceErrorMessage, type ServiceBooking } from "@/lib/services";
import { servicesDb } from "@/lib/services-db";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// bet-02, Mi cuenta › Servicios › Contrataciones: both sides of "Contraté este servicio". The person who did not ask
// answers yes or no; the one who asked can cancel while it waits; a confirmed client has 30 days to review. The open
// ones come first.
export function ServiceBookings({ bookings }: { bookings: ServiceBooking[] }) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, { tone: "success" | "danger"; text: string }>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);
  const ordered = [...bookings].sort((a, b) => Number(bookingActions(b).canAnswer || bookingActions(b).canReview) - Number(bookingActions(a).canAnswer || bookingActions(a).canReview));

  async function act(booking: ServiceBooking, kind: "yes" | "no" | "cancel") {
    if (!supabase || busy) return;
    setBusy(`${booking.id}:${kind}`);
    const db = servicesDb(supabase);
    const { error } = kind === "cancel"
      ? await db.rpc("cancel_service_booking", { p_booking_id: booking.id })
      : await db.rpc("respond_service_booking", { p_booking_id: booking.id, p_accept: kind === "yes" });
    setBusy(null);
    setNotes((current) => ({
      ...current,
      [booking.id]: error
        ? { tone: "danger", text: serviceErrorMessage(error.message, "No pudimos guardar tu respuesta. Intenta nuevamente.") }
        : { tone: "success", text: kind === "yes" ? "Confirmaste la contratación." : kind === "no" ? "Anotamos que no hubo contratación." : "Cancelaste la solicitud." },
    }));
    if (!error) router.refresh();
  }

  if (!bookings.length) {
    return (
      <p className="t-ui text-ink-2">
        Aún no hay contrataciones. Cuando un cliente o quien ofrece el servicio pida confirmar una, aparecerá aquí.
      </p>
    );
  }

  return (
    <ul className="grid gap-3">
      {ordered.map((booking) => {
        const actions = bookingActions(booking);
        const note = notes[booking.id];
        const asked = formatMonthYear(booking.createdAt);
        const line = booking.status === "confirmed"
          ? booking.role === "provider" ? `Cliente: ${booking.otherName}.` : `Contrataste a ${booking.otherName}.`
          : booking.status !== "pending" ? `Con ${booking.otherName}.`
          : booking.role === "provider"
            ? booking.requestedBy === "client" ? `${booking.otherName} dice que contrató tu servicio.` : `Le pediste a ${booking.otherName} que confirme.`
            : booking.requestedBy === "provider" ? `${booking.otherName} te pide confirmar que contrataste su servicio.` : `Le pediste a ${booking.otherName} que confirme tu contratación.`;
        return (
          <li key={booking.id} className="grid gap-2 rounded-panel border border-subtle bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="grid min-w-0 gap-1">
                {booking.service.isPublic ? (
                  <Link href={booking.service.path} className="link break-words t-ui font-semibold">{booking.service.title}</Link>
                ) : (
                  <p className="break-words t-ui font-semibold text-ink">{booking.service.title}</p>
                )}
                <p className="t-meta">{booking.role === "provider" ? "Tu servicio" : `Servicio de ${booking.service.providerName}`}{asked ? ` · ${asked}` : ""}</p>
              </div>
              <StatusTag domain="service_booking" status={booking.status} />
            </div>
            <p className="t-ui text-ink">{line}</p>
            {booking.review ? (
              <p className="t-meta">Reseña: {booking.review.rating} de 5{booking.review.status === "hidden" ? " (oculta por moderación)" : ""}</p>
            ) : null}
            {note ? <Notice tone={note.tone} role={note.tone === "danger" ? "alert" : "status"}>{note.text}</Notice> : null}
            {actions.canAnswer ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" loading={busy === `${booking.id}:yes`} loadingLabel="Guardando…" onClick={() => void act(booking, "yes")}>
                  {booking.role === "provider" ? "Sí, fue mi cliente" : "Sí, lo contraté"}
                </Button>
                <Button variant="quiet" size="sm" loading={busy === `${booking.id}:no`} loadingLabel="Guardando…" onClick={() => void act(booking, "no")}>
                  {booking.role === "provider" ? "No fue mi cliente" : "No lo contraté"}
                </Button>
              </div>
            ) : null}
            {actions.canCancel ? (
              <div>
                <Button variant="quiet" size="sm" loading={busy === `${booking.id}:cancel`} loadingLabel="Cancelando…" onClick={() => void act(booking, "cancel")}>Cancelar solicitud</Button>
              </div>
            ) : null}
            {actions.canReview ? (
              reviewing === booking.id ? (
                <ServiceReviewForm bookingId={booking.id} providerName={booking.service.providerName || "quien te dio el servicio"} onDone={() => { setReviewing(null); router.refresh(); }} />
              ) : (
                <div className="grid gap-1">
                  <p className="t-meta">Tienes hasta {booking.reviewDeadline ? new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", timeZone: "America/Lima" }).format(new Date(booking.reviewDeadline)) : "30 días"} para reseñar.</p>
                  <div><Button variant="secondary" size="sm" onClick={() => setReviewing(booking.id)}>Dejar mi reseña</Button></div>
                </div>
              )
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
