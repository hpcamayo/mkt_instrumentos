"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";

// safe-09 (accounts batch): "Eliminar mi cuenta" in two steps, the password (or the account's e-mail when it only uses
// Google or Apple) and one confirmation.
export function AccountDeletion({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const typedEmail = String(data.get("email") ?? "").trim();
    if (hasPassword && !password) return setError("Escribe tu contraseña.");
    if (!hasPassword && !typedEmail) return setError("Escribe el correo de tu cuenta.");
    if (!(await confirm({
      title: "¿Eliminar tu cuenta?",
      body: "No se puede deshacer. Tus publicaciones dejarán de verse y no podrás volver a entrar con esta cuenta.",
      confirmLabel: "Eliminar mi cuenta",
      tone: "danger",
    }))) return;
    setBusy(true);
    setError(null);
    const response = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(hasPassword ? { password } : { email: typedEmail }),
    }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { message?: string; redirect?: string } | null;
    if (!response?.ok) {
      setBusy(false);
      return setError(result?.message ?? "No pudimos eliminar tu cuenta. Vuelve a intentarlo.");
    }
    window.location.assign(result?.redirect ?? "/login?motivo=cuenta-eliminada");
  }

  return (
    <form noValidate onSubmit={submit} className="grid gap-4">
      {hasPassword ? (
        <Field id="delete-password" label="Tu contraseña" error={error ?? undefined}>
          <PasswordInput name="password" autoComplete="current-password" required />
        </Field>
      ) : (
        <Field id="delete-email" label="Escribe tu correo para confirmar" hint={email} error={error ?? undefined}>
          <Input name="email" type="email" autoComplete="off" required />
        </Field>
      )}
      <Button type="submit" variant="danger" className="justify-self-start" loading={busy} loadingLabel="Eliminando…">
        Eliminar mi cuenta
      </Button>
      {confirmDialog}
    </form>
  );
}
