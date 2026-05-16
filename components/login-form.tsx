"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSafeAuthRedirect } from "@/lib/auth/redirects";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type FormState = "idle" | "submitting" | "sent" | "error";

export function LoginForm() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState<string | null>(
    searchParams.get("error"),
  );
  const nextPath = useMemo(
    () => getSafeAuthRedirect(searchParams.get("next")),
    [searchParams],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const supabase = getSupabaseBrowserClient();

    if (!email || !supabase) {
      setState("error");
      setMessage("Ingresa un correo valido.");
      return;
    }

    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      nextPath,
    )}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
      },
    });

    if (error) {
      setState("error");
      setMessage("No se pudo enviar el enlace. Intenta nuevamente.");
      return;
    }

    setState("sent");
    setMessage("Te enviamos un enlace de ingreso. Revisa tu correo.");
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
      <label className="block">
        <span className="text-sm font-semibold text-ink">Correo</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-brass/20"
          placeholder="tu@email.com"
        />
      </label>

      {message ? (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            state === "sent"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-800"
          }`}
        >
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={state === "submitting"}
        className="inline-flex w-full items-center justify-center rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "submitting" ? "Enviando..." : "Enviar enlace"}
      </button>
    </form>
  );
}
