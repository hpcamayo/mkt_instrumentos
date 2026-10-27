"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { PageNotice } from "@/components/page-notice";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { readTwoStepCode, twoStepErrorMessage } from "@/lib/auth/two-step-input";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// Launch audit A15: Admin's second factor (lib/auth/mfa.ts). Shown to Admin accounts only. The first time it sets up
// an authenticator app with a QR code; after that it asks for the app's code whenever the session was opened with the
// password alone, then opens the page that sent the person here (?next=). Framed, it is a section of the security
// page; unframed, the body of the code step, which the page shows alone.
type BrowserClient = NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
type Enrollment = { factorId: string; qrCode: string; secret: string };
type State =
  | { step: "checking" }
  | { step: "unavailable" }
  | { step: "setup"; enrollment: Enrollment | null }
  | { step: "verify"; factorId: string }
  | { step: "active" };

const SECTION_ID = "dos-pasos";

export function TwoStepVerification({ next, framed = true }: { next: string | null; framed?: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [state, setState] = useState<State>({ step: "checking" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [codeError, setCodeError] = useState("");

  useEffect(() => {
    let active = true;
    void readState(supabase).then((nextState) => {
      if (active) setState(nextState);
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  async function startSetup() {
    if (!supabase) return;
    setBusy(true);
    setError("");
    // A setup left halfway leaves an unverified factor; it is replaced, so the QR code always matches.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const factor of factors?.all ?? []) {
      if (factor.factor_type === "totp" && factor.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Laria Admin", issuer: "Laria" });
    setBusy(false);
    if (enrollError || !data || data.type !== "totp") return setError(twoStepErrorMessage(enrollError ?? {}));
    setState({ step: "setup", enrollment: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret } });
  }

  async function submitCode(event: FormEvent<HTMLFormElement>, factorId: string) {
    event.preventDefault();
    if (!supabase || busy) return;
    setError("");
    const code = readTwoStepCode(new FormData(event.currentTarget).get("code"));
    if (!code) return setCodeError("Escribe los 6 dígitos que muestra tu app.");
    setCodeError("");
    setBusy(true);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (verifyError) {
      setBusy(false);
      return setCodeError(twoStepErrorMessage(verifyError));
    }
    if (next) {
      // A full load, so the page that asked for the code reads the new session's cookies.
      window.location.assign(next);
      return;
    }
    setBusy(false);
    setState({ step: "active" });
    router.refresh();
  }

  if (state.step === "checking") return null;

  const body = (
    <>
      {error ? <div className="mt-4"><PageNotice kind="error" message={error} /></div> : null}
      {state.step === "unavailable" ? (
        <div className="mt-4"><PageNotice kind="error" message="No pudimos revisar tu verificación en dos pasos. Recarga la página para volver a intentarlo." /></div>
      ) : null}
      {state.step === "active" ? (
        <Notice tone="success" className="mt-4">
          <p>Activa. Cada vez que ingreses con tu contraseña, te pediremos el código de tu app.</p>
        </Notice>
      ) : null}
      {state.step === "setup" && !state.enrollment ? (
        <div className="mt-4 grid gap-3">
          <p className="t-body text-ink-2">
            Instala una app como Google Authenticator, Microsoft Authenticator o 1Password en tu teléfono. Luego configúrala aquí una sola vez.
          </p>
          <Button type="button" className="justify-self-start" loading={busy} loadingLabel="Preparando…" onClick={() => void startSetup()}>
            Configurar la verificación
          </Button>
        </div>
      ) : null}
      {state.step === "setup" && state.enrollment ? (
        <div className="mt-4 grid gap-4">
          <ol className="grid list-decimal gap-3 pl-5 t-body text-ink">
            <li>
              Escanea este código QR con tu app de autenticación.
              {/* The QR code is an SVG data URL from Supabase Auth; next/image doesn't optimize data URLs. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={state.enrollment.qrCode} alt="Código QR para tu app de autenticación" width={176} height={176} className="mt-2 rounded-control border border-subtle bg-white p-2" />
              <span className="mt-2 block t-meta text-ink-2">
                ¿No puedes escanearlo? Escribe esta clave en la app: <code className="break-all font-mono text-ink">{state.enrollment.secret}</code>
              </span>
            </li>
            <li>Escribe el código de 6 dígitos que aparece en la app.</li>
          </ol>
          <CodeForm busy={busy} error={codeError} submitLabel="Activar" onSubmit={(event) => void submitCode(event, state.enrollment!.factorId)} />
        </div>
      ) : null}
      {state.step === "verify" ? (
        <div className="mt-4 grid gap-3">
          <p className="t-body text-ink-2">Abre tu app de autenticación y escribe el código de 6 dígitos de Laria.</p>
          <CodeForm busy={busy} error={codeError} submitLabel="Verificar" onSubmit={(event) => void submitCode(event, state.factorId)} />
        </div>
      ) : null}
    </>
  );
  if (!framed) return <div id={SECTION_ID}>{body}</div>;

  return (
    <section id={SECTION_ID} aria-labelledby="dos-pasos-titulo" className="max-w-md scroll-mt-24 rounded-panel border border-subtle bg-white p-6">
      <h2 id="dos-pasos-titulo" className="t-section text-ink">Verificación en dos pasos</h2>
      <p className="mt-1 t-meta text-ink-2">
        Además de tu contraseña, Laria te pide un código de 6 dígitos de una app de autenticación. Para Administración es obligatoria.
      </p>
      {body}
    </section>
  );
}

function CodeForm({ busy, error, submitLabel, onSubmit }: { busy: boolean; error: string; submitLabel: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-3">
      <Field id="dos-pasos-codigo" label="Código de 6 dígitos" error={error || undefined}>
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required className="max-w-40 font-mono tracking-widest" />
      </Field>
      <Button type="submit" className="justify-self-start" loading={busy} loadingLabel="Verificando…">{submitLabel}</Button>
    </form>
  );
}

async function readState(supabase: BrowserClient | null): Promise<State> {
  if (!supabase) return { step: "unavailable" };
  const [factors, level] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
  if (factors.error || level.error) return { step: "unavailable" };
  const verified = factors.data.totp[0];
  if (!verified) return { step: "setup", enrollment: null };
  return level.data.currentLevel === "aal2" ? { step: "active" } : { step: "verify", factorId: verified.id };
}
