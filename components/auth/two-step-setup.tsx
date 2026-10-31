"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { readTwoStepCode, twoStepErrorMessage } from "@/lib/auth/two-step-input";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// Two-step sign-in with an authenticator app (safe-08, accounts batch; the Admin requirement is launch audit A15).
// One component for the three moments: the code after signing in (the session is first-step only), turning it on
// (with ten recovery codes), and managing it. TwoStepCode is the code step alone, for the forms that need it first
// (a password change or reset in a first-step session). The session keeps its level for as long as it lasts, so with "Mantener
// sesión iniciada" the code is asked again only on a new device or after signing out.

export type TwoStepState = {
  hasFactor: boolean;
  aal: "aal1" | "aal2";
  required: boolean;
  reason: "admin" | null;
  recoveryCodesLeft: number;
};

type Enrolment = { factorId: string; qrCode: string; secret: string };

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : null;
}

export function TwoStepCode({ next }: { next: string | null }) {
  return <CodeStep destination={safeNext(next)} />;
}

export function TwoStepSetup({ state, next, startSetup = false }: { state: TwoStepState; next: string | null; startSetup?: boolean }) {
  const destination = safeNext(next);
  if (state.hasFactor && state.aal === "aal1") return <CodeStep destination={destination} />;
  if (!state.hasFactor) return <SetupStep state={state} destination={destination} startSetup={startSetup} />;
  return <ManageStep state={state} />;
}

function requirementText(reason: TwoStepState["reason"]) {
  if (reason === "admin") return "Las cuentas de Admin necesitan la verificación en dos pasos.";
  return null;
}

// ------------------------------------------------------------------ the code after signing in

function CodeStep({ destination }: { destination: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = readTwoStepCode(new FormData(event.currentTarget).get("code"));
    if (!code) return setError("Escribe los 6 números que muestra tu app.");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setError("No pudimos conectar con Laria. Vuelve a intentarlo.");
    setBusy(true);
    setError(null);
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.[0];
    if (!factor) {
      setBusy(false);
      return setError("No encontramos tu app de autenticación. Vuelve a ingresar.");
    }
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (verifyError) {
      setBusy(false);
      return setError(twoStepErrorMessage(verifyError));
    }
    window.location.assign(destination ?? "/mi-cuenta");
  }

  async function submitRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("recovery") ?? "").trim();
    if (code.replace(/[^0-9A-Za-z]/g, "").length !== 8) return setError("Escribe uno de tus códigos de recuperación (8 caracteres).");
    setBusy(true);
    setError(null);
    const response = await fetch("/api/account/two-step/recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { message?: string } | null;
    if (!response?.ok) {
      setBusy(false);
      return setError(result?.message ?? "No pudimos revisar el código. Vuelve a intentarlo.");
    }
    // Removing the app closes every session of the account: sign in again with the password, then set it up again.
    window.location.assign(`/login?motivo=recuperado&next=${encodeURIComponent("/mi-cuenta/seguridad?paso=activar")}`);
  }

  return (
    <div className="grid gap-4">
      <p className="t-body text-ink-2">
        Abre tu app de autenticación y escribe el código de 6 números de Laria. En este dispositivo no te lo volveremos a
        pedir mientras no cierres sesión.
      </p>
      {!recovery ? (
        <form noValidate onSubmit={verify} className="grid gap-4">
          <Field id="two-step-code" label="Código de 6 números" error={error ?? undefined}>
            <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} required autoFocus placeholder="123456" />
          </Field>
          <Button type="submit" block loading={busy} loadingLabel="Verificando…">Verificar</Button>
          <button type="button" className="link min-h-6 justify-self-start t-ui font-semibold" onClick={() => { setRecovery(true); setError(null); }}>
            No tengo mi teléfono: usar un código de recuperación
          </button>
        </form>
      ) : (
        <form noValidate onSubmit={submitRecovery} className="grid gap-4">
          <Field id="two-step-recovery" label="Código de recuperación" hint="Uno de los 10 códigos que guardaste al activar la verificación. Cada uno sirve una vez." error={error ?? undefined}>
            <Input name="recovery" autoComplete="off" autoCapitalize="characters" required autoFocus placeholder="ABCD-2345" />
          </Field>
          <Notice tone="info">
            <p>Al usarlo se desactiva tu app de autenticación, se cierran tus sesiones y te avisamos por correo. Luego ingresas con tu contraseña y la configuras de nuevo.</p>
          </Notice>
          <Button type="submit" block loading={busy} loadingLabel="Revisando…">Usar código de recuperación</Button>
          <button type="button" className="link min-h-6 justify-self-start t-ui font-semibold" onClick={() => { setRecovery(false); setError(null); }}>
            Volver al código de la app
          </button>
        </form>
      )}
      <form action="/logout" method="post">
        <button type="submit" className="link min-h-6 t-ui font-semibold">Cerrar sesión</button>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ turning it on

function SetupStep({ state, destination, startSetup }: { state: TwoStepState; destination: string | null; startSetup: boolean }) {
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requirement = requirementText(state.reason);

  async function start() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setError("No pudimos conectar con Laria. Vuelve a intentarlo.");
    setBusy(true);
    setError(null);
    // A setup left half-way blocks a new one: remove the unverified leftovers first.
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const factor of existing?.all ?? []) {
      if (factor.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data, error: enrolError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      issuer: "Laria",
      friendlyName: `Laria ${new Date().toISOString().slice(0, 16)}`,
    });
    setBusy(false);
    if (enrolError || !data) return setError("No pudimos empezar la configuración. Vuelve a intentarlo en unos minutos.");
    setEnrolment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
  }

  useEffect(() => {
    if (startSetup) void start();
    // Only on the first render: the "activar" link from Mi tienda or Admin starts the setup directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrolment) return;
    const code = readTwoStepCode(new FormData(event.currentTarget).get("code"));
    if (!code) return setError("Escribe los 6 números que muestra tu app.");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setError("No pudimos conectar con Laria. Vuelve a intentarlo.");
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolment.factorId, code });
    if (verifyError) {
      setBusy(false);
      return setError("El código no coincide. Revisa que la app muestre «Laria» y escribe el código actual.");
    }
    const { data } = await supabase.rpc("create_my_recovery_codes");
    setBusy(false);
    setCodes(Array.isArray(data) ? data : []);
  }

  async function cancel() {
    const supabase = getSupabaseBrowserClient();
    if (supabase && enrolment) await supabase.auth.mfa.unenroll({ factorId: enrolment.factorId });
    setEnrolment(null);
    setError(null);
  }

  if (codes) {
    return <RecoveryCodes codes={codes} onDone={() => window.location.assign(destination ?? "/mi-cuenta/seguridad")} doneLabel={destination ? "Continuar" : "Listo"} />;
  }

  if (!enrolment) {
    return (
      <div className="grid gap-4">
        {requirement ? <Notice tone="warning" title="Necesitas activarla"><p>{requirement}</p></Notice> : null}
        <p className="t-body text-ink-2">
          Además de tu contraseña, Laria te pedirá un código de una app de autenticación (Google Authenticator, Microsoft
          Authenticator u otra) cuando ingreses en un dispositivo nuevo. Si alguien consigue tu contraseña, no podrá entrar.
        </p>
        {error ? <Notice tone="danger"><p>{error}</p></Notice> : null}
        <Button type="button" onClick={() => void start()} loading={busy} loadingLabel="Preparando…" className="justify-self-start">
          Activar verificación en dos pasos
        </Button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={confirm} className="grid gap-4">
      {requirement ? <Notice tone="warning" title="Necesitas activarla"><p>{requirement}</p></Notice> : null}
      <ol className="grid gap-2 pl-5 t-body text-ink [list-style:decimal]">
        <li>Abre tu app de autenticación y elige agregar una cuenta.</li>
        <li>Escanea este código, o escribe la clave si estás en el mismo teléfono.</li>
        <li>Escribe el código de 6 números que aparece en la app para «Laria».</li>
      </ol>
      <div className="flex flex-wrap items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns the QR as an inline SVG data URL */}
        <img src={enrolment.qrCode} alt="Código QR para tu app de autenticación" width={176} height={176} className="h-44 w-44 rounded-panel border border-subtle bg-white p-2" />
        <div className="min-w-0 grid gap-1">
          <p className="t-meta">Clave para escribir a mano</p>
          <code className="break-all rounded-control bg-canvas px-2 py-1 font-mono t-ui text-ink">{enrolment.secret}</code>
          <CopyButton text={enrolment.secret} label="Copiar clave" />
        </div>
      </div>
      <Field id="two-step-new-code" label="Código de 6 números" error={error ?? undefined}>
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} required placeholder="123456" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy} loadingLabel="Verificando…">Confirmar y activar</Button>
        <Button type="button" variant="secondary" onClick={() => void cancel()} disabled={busy}>Cancelar</Button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ managing it

function ManageStep({ state }: { state: TwoStepState }) {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const requirement = requirementText(state.reason);

  async function newCodes() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    if (!(await confirm({ title: "¿Crear códigos nuevos?", body: "Los códigos anteriores dejarán de funcionar.", confirmLabel: "Crear códigos nuevos" }))) return;
    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc("create_my_recovery_codes");
    setBusy(false);
    if (rpcError || !Array.isArray(data)) return setError("No pudimos crear los códigos. Vuelve a intentarlo.");
    setCodes(data);
  }

  async function turnOff() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    if (!(await confirm({
      title: "¿Desactivar la verificación en dos pasos?",
      body: "Para ingresar bastará tu contraseña. Puedes volver a activarla cuando quieras.",
      confirmLabel: "Desactivar",
      tone: "danger",
    }))) return;
    setBusy(true);
    const { data } = await supabase.auth.mfa.listFactors();
    for (const factor of data?.all ?? []) await supabase.auth.mfa.unenroll({ factorId: factor.id });
    window.location.reload();
  }

  if (codes) return <RecoveryCodes codes={codes} onDone={() => window.location.reload()} doneLabel="Listo" />;

  return (
    <div className="grid gap-4">
      <p className="t-body text-ink">
        <strong className="font-semibold">Activa.</strong>{" "}
        <span className="text-ink-2">Te pediremos el código solo al ingresar en un dispositivo nuevo o después de cerrar sesión.</span>
      </p>
      {requirement ? <p className="t-meta">{requirement}</p> : null}
      <p className="t-meta">
        Códigos de recuperación sin usar: {state.recoveryCodesLeft} de 10.
        {state.recoveryCodesLeft <= 3 ? " Te quedan pocos: crea códigos nuevos y guárdalos." : ""}
      </p>
      {error ? <Notice tone="danger"><p>{error}</p></Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => void newCodes()} disabled={busy}>Crear códigos de recuperación nuevos</Button>
        {!state.required ? (
          <Button type="button" variant="danger" onClick={() => void turnOff()} disabled={busy}>Desactivar</Button>
        ) : null}
      </div>
      {confirmDialog}
    </div>
  );
}

function RecoveryCodes({ codes, onDone, doneLabel }: { codes: string[]; onDone: () => void; doneLabel: string }) {
  function download() {
    const text = `Códigos de recuperación de Laria\nCada código sirve una sola vez si no tienes tu teléfono.\n\n${codes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "laria-codigos-de-recuperacion.txt";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="grid gap-4">
      <Notice tone="success" title="Guarda estos códigos">
        <p>
          Si pierdes tu teléfono, cada código te deja entrar una vez. Guárdalos fuera de este dispositivo (en papel o en
          tu gestor de contraseñas). No los volveremos a mostrar.
        </p>
      </Notice>
      <ul className="grid grid-cols-2 gap-2 rounded-panel border border-subtle bg-canvas p-3 font-mono t-body text-ink" aria-label="Códigos de recuperación">
        {codes.map((code) => <li key={code}>{code}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={codes.join("\n")} label="Copiar códigos" />
        <Button type="button" variant="secondary" onClick={download}>Descargar</Button>
        <Button type="button" onClick={onDone}>{doneLabel}</Button>
      </div>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="justify-self-start"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => setCopied(true), () => setCopied(false));
      }}
    >
      <span aria-live="polite">{copied ? "Copiado" : label}</span>
    </Button>
  );
}
