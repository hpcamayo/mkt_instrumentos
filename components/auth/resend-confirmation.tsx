"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RESEND_CONFIRMATION_WAIT_SECONDS } from "@/lib/auth/confirmation";

// fix-08: "Reenviar enlace" with a short wait between sends, on the sign-in form and right after signing up.
export function ResendConfirmation({ email, next }: { email: string; next?: string }) {
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  async function resend() {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/auth/resend-confirmation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, next }),
    }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!response?.ok) {
      setMessage(result?.message ?? "No se pudo enviar el enlace. Intenta nuevamente.");
      return;
    }
    setWait(RESEND_CONFIRMATION_WAIT_SECONDS);
    setMessage(`Te enviamos otro enlace a ${email}. Revisa también la carpeta de spam.`);
  }

  return (
    <div className="mt-2 flex flex-col items-start gap-1.5">
      <Button type="button" variant="secondary" size="sm" onClick={resend} disabled={wait > 0} loading={busy} loadingLabel="Enviando…">
        {wait > 0 ? `Reenviar enlace (${wait} s)` : "Reenviar enlace"}
      </Button>
      {message ? <p role="status" className="t-meta">{message}</p> : null}
    </div>
  );
}
