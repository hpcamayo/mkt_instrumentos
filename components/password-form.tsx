"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { getSafeAuthRedirect } from "@/lib/auth/redirects";
import { getPasswordValidationMessage } from "@/lib/auth/password";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

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
  return <form onSubmit={submit} className="mt-6 grid gap-4"><AuthInput label="Correo" name="email" type="email" autoComplete="email" /><Status message={message} /><button disabled={busy} className="laria-button-primary min-h-12 px-5 py-3 text-sm">{busy ? "Enviando..." : "Enviar enlace"}</button><Link href="/login" className="text-center text-sm font-black text-laria-blue">Volver a ingresar</Link></form>;
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
    if (error) return setMessage("No se pudo actualizar la contraseña. Solicita un nuevo enlace o intenta nuevamente.");
    const next = getSafeAuthRedirect(searchParams.get("next"), "/mi-cuenta");
    const destination = new URL(next, window.location.origin);
    destination.searchParams.set("password", "updated");
    router.push(`${destination.pathname}${destination.search}`);
    router.refresh();
  }
  return <form onSubmit={submit} className="mt-6 grid gap-4"><AuthInput label="Nueva contraseña" name="password" type="password" autoComplete="new-password" /><AuthInput label="Confirmar contraseña" name="confirmation" type="password" autoComplete="new-password" /><Status message={message} /><button disabled={busy} className="laria-button-primary min-h-12 px-5 py-3 text-sm">{busy ? "Guardando..." : "Guardar contraseña"}</button></form>;
}

function AuthInput({ label, name, type, autoComplete }: { label: string; name: string; type: string; autoComplete: string }) {
  return <label className="grid gap-2 text-sm font-bold text-laria-text-soft">{label}<input name={name} type={type} required minLength={type === "password" ? 8 : undefined} autoComplete={autoComplete} className="h-11 rounded-md border border-laria-steel px-3 text-laria-ink outline-none focus:border-laria-blue focus:ring-2 focus:ring-laria-blue/20" /></label>;
}
function Status({ message }: { message: string }) { return message ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">{message}</p> : null; }
