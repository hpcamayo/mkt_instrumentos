"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { getSafeAuthRedirect } from "@/lib/auth/redirects";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type FormState = "idle" | "submitting" | "sent" | "error";
type LoginMode = "password" | "magic-link";

export function LoginForm() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<LoginMode>("password");
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState<string | null>(
    searchParams.get("error"),
  );
  const nextPath = useMemo(
    () => getSafeAuthRedirect(searchParams.get("next")),
    [searchParams],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    if (!email) {
      setState("error");
      setMessage("Ingresa un correo válido.");
      return;
    }

    if (mode === "password") {
      if (!password) {
        setState("error");
        setMessage("Ingresa tu contraseña.");
        return;
      }

      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        setState("error");
        setMessage("No se pudo iniciar sesión. Revisa tu correo y contraseña.");
        return;
      }

      window.location.assign(nextPath);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setState("error");
      setMessage("No se pudo iniciar sesión.");
      return;
    }

    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      nextPath,
    )}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
        shouldCreateUser: false,
      },
    });

    if (error) {
      setState("error");
      setMessage(
        "No se pudo enviar el enlace. Verifica que ya tengas una cuenta.",
      );
      return;
    }

    setState("sent");
    setMessage("Te enviamos un enlace de ingreso. Revisa tu correo.");
  }

  function switchMode(nextMode: LoginMode) {
    setMode(nextMode);
    setState("idle");
    setMessage(null);
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="grid grid-cols-2 rounded-md border border-slate-200 bg-slate-50 p-1">
        <button
          type="button"
          onClick={() => switchMode("password")}
          className={`rounded px-3 py-2 text-sm font-semibold transition ${
            mode === "password"
              ? "bg-white text-ink shadow-sm"
              : "text-slate-600 hover:text-ink"
          }`}
        >
          Contraseña
        </button>
        <button
          type="button"
          onClick={() => switchMode("magic-link")}
          className={`rounded px-3 py-2 text-sm font-semibold transition ${
            mode === "magic-link"
              ? "bg-white text-ink shadow-sm"
              : "text-slate-600 hover:text-ink"
          }`}
        >
          Enlace mágico
        </button>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
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

        {mode === "password" ? (
          <label className="block">
            <span className="text-sm font-semibold text-ink">Contraseña</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-brass/20"
              placeholder="Tu contraseña"
            />
          </label>
        ) : (
          <p className="text-sm leading-6 text-slate-600">
            Te enviaremos un enlace seguro. Esta opción no crea cuentas nuevas.
          </p>
        )}

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
          {state === "submitting"
            ? "Procesando..."
            : mode === "password"
              ? "Ingresar"
              : "Enviar enlace"}
        </button>
        {mode === "password" ? (
          <Link
            href="/recuperar-contrasena"
            className="block text-center text-sm font-semibold text-laria-blue hover:underline"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        ) : null}
      </form>

      <div className="space-y-2 border-t border-slate-200 pt-4 text-sm text-slate-600">
        <p>
          ¿Quieres comprar o vender como Particular?{" "}
          <Link className="font-semibold text-ink hover:text-brass" href="/registro/vendedor">
            Crea tu cuenta
          </Link>
        </p>
        <p>
          ¿Tienes una tienda?{" "}
          <Link className="font-semibold text-ink hover:text-brass" href="/registrar-tienda">
            Registra tu tienda
          </Link>
        </p>
      </div>
    </div>
  );
}
