"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { SERVICE_CONTACTED_EVENT } from "@/components/services/service-contact";
import { ServiceReviewForm } from "@/components/services/service-review-form";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { EMPTY_VIEWER_STATE, readServiceViewerState, serviceErrorMessage, type ServiceViewerState } from "@/lib/services";
import { servicesDb } from "@/lib/services-db";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// bet-02: "¿Contrataste este servicio?". Reviews come only from confirmed clients: someone who wrote through Laria's
// WhatsApp button while signed in presses "Contraté este servicio", and the provider confirms (or the provider asks
// and the client confirms, from Mi cuenta › Servicios). Confirming only opens the review; Laria never verifies the
// payment or the work. The state is read again when the visitor comes back from WhatsApp.
export function ServiceHirePanel({ serviceId, providerName }: { serviceId: string; providerName: string }) {
  const account = useMarketplaceAccount();
  const pathname = usePathname();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [state, setState] = useState<ServiceViewerState>(EMPTY_VIEWER_STATE);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<"claim" | "yes" | "no" | "cancel" | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !account.authenticated) return;
    const { data, error } = await servicesDb(supabase).rpc("get_service_viewer_state", { p_service_id: serviceId });
    if (!error) setState(readServiceViewerState(data));
    setLoaded(true);
  }, [account.authenticated, serviceId, supabase]);

  useEffect(() => {
    void load();
    const again = () => { if (document.visibilityState === "visible") void load(); };
    const contacted = (event: Event) => { if ((event as CustomEvent).detail === serviceId) void load(); };
    document.addEventListener("visibilitychange", again);
    window.addEventListener(SERVICE_CONTACTED_EVENT, contacted);
    return () => {
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener(SERVICE_CONTACTED_EVENT, contacted);
    };
  }, [load, serviceId]);

  async function act(kind: "claim" | "yes" | "no" | "cancel") {
    if (!supabase || busy) return;
    setBusy(kind);
    setMessage(null);
    const db = servicesDb(supabase);
    const booking = state.booking;
    const { error } = kind === "claim"
      ? await db.rpc("claim_service_booking", { p_service_id: serviceId })
      : kind === "cancel"
      ? await db.rpc("cancel_service_booking", { p_booking_id: booking?.id })
      : await db.rpc("respond_service_booking", { p_booking_id: booking?.id, p_accept: kind === "yes" });
    setBusy(null);
    if (error) {
      setMessage({ tone: "danger", text: serviceErrorMessage(error.message, "No pudimos guardar tu respuesta. Intenta nuevamente.") });
      return;
    }
    setMessage({
      tone: "success",
      text: kind === "claim" ? `Le avisamos a ${providerName}. Cuando lo confirme, podrás dejar tu reseña.`
        : kind === "yes" ? "Listo, confirmaste la contratación. Ya puedes dejar tu reseña."
        : kind === "no" ? "Anotamos que no hubo contratación."
        : "Cancelaste la solicitud.",
    });
    await load();
  }

  if (!account.ready) return null;

  const rule = (
    <p className="t-meta">
      Solo reseñan clientes confirmados por ambas partes. Confirmar habilita la reseña; Laria no verifica el pago, la
      calidad del trabajo ni los títulos de quien ofrece el servicio.
    </p>
  );

  if (!account.authenticated) {
    return (
      <section aria-labelledby="contratacion" className="grid gap-2 rounded-panel bg-canvas p-4">
        <h2 id="contratacion" className="t-section text-ink">¿Contrataste este servicio?</h2>
        <p className="t-ui text-ink-2">
          Para dejar una reseña, ingresa a tu cuenta, escribe a {providerName} con el botón de WhatsApp de esta página y,
          después de contratar, confírmalo aquí.
        </p>
        <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="link inline-flex min-h-6 w-fit items-center t-ui font-semibold">Ingresar</Link>
        {rule}
      </section>
    );
  }
  if (!loaded) return null;
  if (state.isOwner) {
    return (
      <section className="grid gap-2 rounded-panel bg-canvas p-4">
        <h2 className="t-section text-ink">Este es tu servicio</h2>
        <p className="t-ui text-ink-2">Confirma a tus clientes, responde solicitudes y mira tus cifras en Mi cuenta.</p>
        <Link href="/mi-cuenta/servicios" className="link inline-flex min-h-6 w-fit items-center t-ui font-semibold">Ir a Mi cuenta › Servicios</Link>
      </section>
    );
  }

  const booking = state.booking;
  return (
    <section aria-labelledby="contratacion" className="grid gap-3 rounded-panel bg-canvas p-4">
      <h2 id="contratacion" className="t-section text-ink">¿Contrataste este servicio?</h2>
      {message ? <Notice tone={message.tone} role={message.tone === "danger" ? "alert" : "status"}>{message.text}</Notice> : null}
      {state.hasReview ? (
        <p className="t-ui text-ink">Ya dejaste tu reseña de este servicio. Gracias por ayudar a otros músicos.</p>
      ) : state.canReview && booking ? (
        <>
          <p className="t-ui text-ink-2">Tu contratación está confirmada. Tienes 30 días para reseñar.</p>
          <ServiceReviewForm bookingId={booking.id} providerName={providerName} onDone={() => { setMessage({ tone: "success", text: "Publicamos tu reseña. Gracias." }); void load(); }} />
        </>
      ) : booking?.status === "pending" && booking.requestedBy === "provider" ? (
        <>
          <p className="t-ui text-ink">{providerName} te pide confirmar que contrataste este servicio.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" loading={busy === "yes"} loadingLabel="Guardando…" onClick={() => void act("yes")}>Sí, lo contraté</Button>
            <Button variant="quiet" loading={busy === "no"} loadingLabel="Guardando…" onClick={() => void act("no")}>No lo contraté</Button>
          </div>
        </>
      ) : booking?.status === "pending" ? (
        <>
          <p className="t-ui text-ink">Esperando que {providerName} confirme tu contratación. Si no responde en 30 días, la solicitud vence.</p>
          <div>
            <Button variant="quiet" loading={busy === "cancel"} loadingLabel="Cancelando…" onClick={() => void act("cancel")}>Cancelar solicitud</Button>
          </div>
        </>
      ) : booking?.status === "confirmed" ? (
        <p className="t-ui text-ink">Tu contratación está confirmada. El plazo para reseñar terminó.</p>
      ) : state.canClaim ? (
        <>
          <p className="t-ui text-ink-2">Si acordaste el servicio con {providerName} después de escribirle desde Laria, avísale para que lo confirme.</p>
          <div>
            <Button variant="secondary" loading={busy === "claim"} loadingLabel="Enviando…" onClick={() => void act("claim")}>Contraté este servicio</Button>
          </div>
        </>
      ) : state.contacted ? (
        <p className="t-ui text-ink-2">Esta contratación ya se respondió con un no, así que no se puede volver a pedir.</p>
      ) : (
        <p className="t-ui text-ink-2">Para poder reseñar, escribe a {providerName} con el botón de WhatsApp de esta página con tu cuenta abierta. Después de contratar, vuelve aquí y confírmalo.</p>
      )}
      {rule}
    </section>
  );
}
