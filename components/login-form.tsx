"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { getSafeAuthRedirect } from "@/lib/auth/redirects";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

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

  const modeButton = (value: LoginMode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => switchMode(value)}
      className={`h-10 rounded-control px-3 t-ui font-semibold transition-colors duration-120 ${
        mode === value
          ? "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line-strong)]"
          : "text-ink-2 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mt-6 space-y-5">
      <div className="grid grid-cols-2 gap-1 rounded-control bg-canvas p-1">
        {modeButton("password", "Contraseña")}
        {modeButton("magic-link", "Enlace mágico")}
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <Field id="login-email" label="Correo">
          <Input type="email" name="email" required autoComplete="email" placeholder="tu@email.com" />
        </Field>

        {mode === "password" ? (
          <Field id="login-password" label="Contraseña">
            <Input type="password" name="password" required autoComplete="current-password" placeholder="Tu contraseña" />
          </Field>
        ) : (
          <p className="t-ui text-ink-2">
            Te enviaremos un enlace seguro. Esta opción no crea cuentas nuevas.
          </p>
        )}

        {message ? (
          <Notice tone={state === "sent" ? "success" : "warning"}>{message}</Notice>
        ) : null}

        <Button
          type="submit"
          block
          loading={state === "submitting"}
          loadingLabel="Procesando..."
        >
          {mode === "password" ? "Ingresar" : "Enviar enlace"}
        </Button>
        {mode === "password" ? (
          <Link href="/recuperar-contrasena" className="link block text-center t-ui font-semibold">
            ¿Olvidaste tu contraseña?
          </Link>
        ) : null}
      </form>

      <div className="space-y-2 border-t border-subtle pt-4 t-ui text-ink-2">
        <p>
          ¿Quieres comprar o vender como Particular?{" "}
          <Link className="link font-semibold" href="/registro/vendedor">
            Crea tu cuenta
          </Link>
        </p>
        <p>
          ¿Tienes una tienda?{" "}
          <Link className="link font-semibold" href="/registrar-tienda">
            Registra tu tienda
          </Link>
        </p>
      </div>
    </div>
  );
}
