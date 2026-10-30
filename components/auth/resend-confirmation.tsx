"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RESEND_CONFIRMATION_WAIT_SECONDS } from "@/lib/auth/confirmation";

// fix-08: "Reenviar enlace" with a short wait between sends, on the sign-in form and right after signing up.
export function ResendConfirmation({ email, next, disabled = false }: { email: string; next?: string; disabled?: boolean }) {
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sending = useRef(false);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  async function resend() {
    if (sending.current || wait > 0 || disabled) return;
    sending.current = true;
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/auth/resend-confirmation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, next }),
    }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    sending.current = false;
    if (!response?.ok) {
      setMessage(result?.message ?? "No se pudo enviar el enlace. Intenta nuevamente.");
      return;
    }
    setWait(RESEND_CONFIRMATION_WAIT_SECONDS);
    setMessage(`Si tu cuenta está pendiente de confirmación, recibirás un enlace en ${email}. Abre el correo más reciente y pulsa «Confirmar mi correo». Los enlaces anteriores dejan de funcionar. Revisa también la carpeta de spam.`);
  }

  return (
    <div className="mt-2 flex flex-col items-start gap-1.5">
      <Button type="button" variant="secondary" size="sm" onClick={resend} disabled={disabled || wait > 0} loading={busy} loadingLabel="Enviando…">
        {wait > 0 ? `Reenviar enlace (${wait} s)` : "Reenviar enlace"}
      </Button>
      {message ? <p role="status" className="t-meta">{message}</p> : null}
    </div>
  );
}
