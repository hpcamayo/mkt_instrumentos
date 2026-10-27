"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { getSafeAuthRedirect } from "@/lib/auth/redirects";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { useFormErrors } from "@/components/use-form-errors";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { Notice } from "@/components/ui/notice";
import { ResendConfirmation } from "@/components/auth/resend-confirmation";
import { isEmailNotConfirmedError } from "@/lib/auth/confirmation";
import { TOO_MANY_ATTEMPTS, TOO_MANY_EMAILS, isAuthRateLimited } from "@/lib/auth/limits";
import { twoStepPath } from "@/lib/auth/two-step";

type FormState = "idle" | "submitting" | "sent" | "error";
type LoginMode = "password" | "magic-link";

export function LoginForm() {
  const searchParams = useSearchParams();
  const [validation, errorSummary] = useFormErrors("login", "ingresar");
  const [mode, setMode] = useState<LoginMode>("password");
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState<string | null>(
    searchParams.get("error"),
  );
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  // auth-01: after a failed password, offer the e-mail link for the address already typed.
  const [failedEmail, setFailedEmail] = useState<string | null>(null);
  const nextPath = useMemo(
    () => getSafeAuthRedirect(searchParams.get("next")),
    [searchParams],
  );

  const signupHref = nextPath && nextPath !== "/mi-cuenta" ? `/registro/vendedor?next=${encodeURIComponent(nextPath)}` : "/registro/vendedor";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage(null);
    setUnconfirmedEmail(null);
    setFailedEmail(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    if (!validation.validate(event.currentTarget)) {
      setState("idle");
      return;
    }
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

      // Launch audit A16: the browser signs in itself, so Supabase Auth counts attempts per visitor instead of
      // against the server's address, which every visitor shares.
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setState("error");
        setMessage("No se pudo iniciar sesión.");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setState("error");
        // Supabase checks the password before the confirmation, so this answer does not reveal unconfirmed accounts.
        if (isEmailNotConfirmedError(error)) {
          setUnconfirmedEmail(email);
          setMessage("Te enviamos un enlace al registrarte. Ábrelo para activar tu cuenta y vuelve a ingresar.");
          return;
        }
        if (isAuthRateLimited(error)) {
          setMessage(TOO_MANY_ATTEMPTS);
          return;
        }
        setFailedEmail(email);
        setMessage("No se pudo iniciar sesión. Revisa tu correo y contraseña.");
        return;
      }

      // Launch audit A15: an account with an authenticator app finishes signing in with its code.
      const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      window.location.assign(level?.currentLevel === "aal1" && level.nextLevel === "aal2" ? twoStepPath("codigo", nextPath) : nextPath);
      return;
    }

    await sendMagicLink(email);
  }

  async function sendMagicLink(email: string) {
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
        isAuthRateLimited(error) ? TOO_MANY_EMAILS : "No se pudo enviar el enlace. Verifica que ya tengas una cuenta.",
      );
      return;
    }

    setState("sent");
    setMessage(`Te enviamos un enlace de ingreso a ${email}. Ábrelo en este dispositivo para volver aquí.`);
  }

  async function switchToLink(email: string) {
    setMode("magic-link");
    validation.clear();
    setFailedEmail(null);
    setState("submitting");
    setMessage(null);
    await sendMagicLink(email);
  }

  function switchMode(nextMode: LoginMode) {
    setMode(nextMode);
    validation.clear();
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

      <form ref={validation.formRef} noValidate className="space-y-4" onSubmit={handleSubmit} onChange={validation.onChange}>
        {errorSummary}
        <Field id="login-email" error={validation.errorFor("email")} label="Correo">
          <Input type="email" name="email" required autoComplete="email" placeholder="tu@email.com" />
        </Field>

        {mode === "password" ? (
          <Field id="login-password" error={validation.errorFor("password")} label="Contraseña">
            <PasswordInput name="password" required autoComplete="current-password" placeholder="Tu contraseña" />
          </Field>
        ) : (
          <p className="t-ui text-ink-2">
            Te enviaremos un enlace seguro. Esta opción no crea cuentas nuevas.
          </p>
        )}

        {message ? (
          <Notice tone={state === "sent" ? "success" : "warning"} title={unconfirmedEmail ? "Confirma tu correo" : undefined}>
            <p>{message}</p>
            {unconfirmedEmail ? <ResendConfirmation email={unconfirmedEmail} next={nextPath} /> : null}
            {failedEmail && mode === "password" ? (
              <button type="button" onClick={() => void switchToLink(failedEmail)} className="link mt-2 inline-flex min-h-6 items-center t-ui font-semibold">
                ¿Prefieres un enlace? Te lo enviamos a {failedEmail}
              </button>
            ) : null}
          </Notice>
        ) : null}

        <Button
          type="submit"
          block
          loading={state === "submitting"}
          loadingLabel="Procesando…"
        >
          {mode === "password" ? "Ingresar" : "Enviar enlace"}
        </Button>
        {mode === "password" ? (
          <Link href="/recuperar-contrasena" className="link block text-center t-ui font-semibold">
            ¿Olvidaste tu contraseña?
          </Link>
        ) : null}
      </form>

      {/* save-02, save-03: creating an account is an equal choice, and it keeps the way back. */}
      <div className="space-y-3 border-t border-subtle pt-4 t-ui text-ink-2">
        <p>¿Es tu primera vez en Laria?</p>
        <Link href={signupHref} className={buttonClasses({ variant: "secondary", block: true })}>
          Crear cuenta
        </Link>
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
