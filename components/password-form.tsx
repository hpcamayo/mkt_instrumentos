"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { getSafeAuthRedirect } from "@/lib/auth/redirects";
import { PageNotice } from "@/components/page-notice";
import {
  getPasswordUpdateErrorMessage,
  getPasswordValidationMessage,
} from "@/lib/auth/password";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { buttonClasses } from "@/components/ui/button";

export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim().toLowerCase();
    const supabase = getSupabaseBrowserClient();
    if (!email || !supabase) return setMessage("Ingresa un correo válido.");
    setBusy(true);
    const redirectTo = `${window.location.origin}/auth/callback?next=/restablecer-contrasena`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setBusy(false);
    setMessage(error ? "No se pudo enviar el enlace. Intenta nuevamente." : "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.");
  }
  return <form onSubmit={submit} className="mt-6 grid gap-4"><AuthInput label="Correo" name="email" type="email" autoComplete="email" /><Status message={message} /><button disabled={busy} className={buttonClasses()}>{busy ? "Enviando..." : "Enviar enlace"}</button><Link href="/login" className="link text-center t-ui font-semibold">Volver a ingresar</Link></form>;
}

export function PasswordUpdateForm({ mode }: { mode: "reset" | "change" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
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
    if (error) return setMessage(getPasswordUpdateErrorMessage(error));
    const next = getSafeAuthRedirect(searchParams.get("next"), "/mi-cuenta");
    const destination = new URL(next, window.location.origin);
    destination.searchParams.set("password", "updated");
    router.push(`${destination.pathname}${destination.search}`);
    router.refresh();
  }
  return <form onSubmit={submit} className="mt-6 grid gap-4"><AuthInput label="Nueva contraseña" name="password" type="password" autoComplete="new-password" /><AuthInput label="Confirmar contraseña" name="confirmation" type="password" autoComplete="new-password" /><Status message={message} /><button disabled={busy} className={buttonClasses()}>{busy ? "Guardando..." : "Guardar contraseña"}</button></form>;
}

function AuthInput({ label, name, type, autoComplete }: { label: string; name: string; type: string; autoComplete: string }) {
  return <label className="grid gap-2 text-sm font-semibold text-ink-2">{label}<input name={name} type={type} required minLength={type === "password" ? 8 : undefined} autoComplete={autoComplete} className="h-11 rounded-control border border-line-strong px-3 text-ink" /></label>;
}
function Status({ message }: { message: string }) {
  if (!message) return null;
  return <PageNotice kind={message.startsWith("Si el correo") ? "success" : "error"} message={message} />;
}
