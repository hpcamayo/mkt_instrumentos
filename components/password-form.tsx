"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { getSafeAuthRedirect } from "@/lib/auth/redirects";
import { PageNotice } from "@/components/page-notice";
import { useFormErrors } from "@/components/use-form-errors";
import { getPasswordUpdateErrorMessage, getPasswordValidationMessage, PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [validation, errorSummary] = useFormErrors("recuperar", "enviar el enlace");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!validation.validate(event.currentTarget)) return;
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim().toLowerCase();
    const supabase = getSupabaseBrowserClient();
    if (!email || !supabase) return setMessage("Ingresa un correo válido.");
    setBusy(true);
    const redirectTo = window.location.origin + "/auth/callback?next=/restablecer-contrasena";
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setBusy(false);
    setMessage(error ? "No se pudo enviar el enlace. Intenta nuevamente." : "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.");
  }

  return (
    <form ref={validation.formRef} noValidate onSubmit={submit} onChange={validation.onChange} className="mt-6 grid gap-4">
      {errorSummary}
      <AuthInput label="Correo" name="email" type="email" autoComplete="email" error={validation.errorFor("email")} />
      <Status message={message} />
      <Button type="submit" loading={busy} loadingLabel="Enviando…">Enviar enlace</Button>
      <Link href="/login" className="link text-center t-ui font-semibold">Volver a ingresar</Link>
    </form>
  );
}

export function PasswordUpdateForm({ mode }: { mode: "reset" | "change" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [validation, errorSummary] = useFormErrors("clave-" + mode, "guardar tu contraseña");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    setMessage("");
    if (!validation.validate(event.currentTarget, password !== confirmation ? { confirmation: "Las contraseñas no coinciden." } : {})) return;
    const validationMessage = getPasswordValidationMessage(password, confirmation);
    if (validationMessage) return setMessage(validationMessage);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setMessage("No se pudo conectar con Laria.");
    setBusy(true);
    if (mode === "reset") {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setBusy(false);
        return setMessage("El enlace venció o no es válido. Solicita uno nuevo.");
      }
    }
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      if (error.code === "same_password") {
        validation.setFieldError("password", getPasswordUpdateErrorMessage(error));
        return;
      }
      return setMessage(getPasswordUpdateErrorMessage(error));
    }
    const next = getSafeAuthRedirect(searchParams.get("next"), "/mi-cuenta");
    const destination = new URL(next, window.location.origin);
    destination.searchParams.set("password", "updated");
    router.push(destination.pathname + destination.search);
    router.refresh();
  }

  return (
    <form ref={validation.formRef} noValidate onSubmit={submit} onChange={validation.onChange} className="mt-6 grid gap-4">
      {errorSummary}
      <AuthInput label="Nueva contraseña" name="password" type="password" autoComplete="new-password" error={validation.errorFor("password")} />
      <AuthInput label="Confirmar contraseña" name="confirmation" type="password" autoComplete="new-password" error={validation.errorFor("confirmation")} />
      <Status message={message} />
      <Button type="submit" loading={busy} loadingLabel="Guardando…">Guardar contraseña</Button>
    </form>
  );
}

function AuthInput({ label, name, type, autoComplete, error }: { label: string; name: string; type: string; autoComplete: string; error?: string }) {
  return <Field id={"clave-" + name} label={label} error={error} hint={name === "password" ? `Mínimo ${PASSWORD_MIN_LENGTH} caracteres.` : undefined}>{type === "password" ? <PasswordInput name={name} required minLength={PASSWORD_MIN_LENGTH} autoComplete={autoComplete} /> : <Input name={name} type={type} required autoComplete={autoComplete} />}</Field>;
}

function Status({ message }: { message: string }) {
  if (!message) return null;
  return <PageNotice kind={message.startsWith("Si el correo") ? "success" : "error"} message={message} />;
}
