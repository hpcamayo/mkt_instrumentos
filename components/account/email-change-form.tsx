"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

// safe-09 (accounts batch): "Correo de acceso" in Seguridad. The account keeps signing in with the current address until
// the person opens the confirmation link.
export function EmailChangeForm({ current, pending }: { current: string; pending: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(pending);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    if (!email) return setError("Escribe tu nuevo correo.");
    setBusy(true);
    setError(null);
    const response = await fetch("/api/account/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { email?: string; message?: string } | null;
    setBusy(false);
    if (!response?.ok) return setError(result?.message ?? "No pudimos pedir el cambio. Vuelve a intentarlo.");
    setSentTo(result?.email ?? email);
  }

  return (
    <div className="grid gap-4">
      <p className="t-body text-ink">
        Ingresas con <strong className="font-semibold break-all">{current}</strong>.
      </p>
      {sentTo ? (
        <Notice tone="info" title={`Falta confirmar ${sentTo}`}>
          <p>
            Abre el enlace que te enviamos a ese correo. Si también te llega uno a {current}, ábrelo también. Hasta
            entonces sigues ingresando con tu correo actual.
          </p>
        </Notice>
      ) : null}
      <form noValidate onSubmit={submit} className="grid gap-4">
        <Field id="new-email" label="Nuevo correo" error={error ?? undefined}>
          <Input name="email" type="email" autoComplete="email" inputMode="email" required />
        </Field>
        <Button type="submit" variant="secondary" className="justify-self-start" loading={busy} loadingLabel="Enviando…">
          Cambiar correo
        </Button>
      </form>
    </div>
  );
}
