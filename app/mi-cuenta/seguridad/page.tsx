import { Suspense, type ReactNode } from "react";
import { AccountSettingsTabs } from "@/components/account-settings-tabs";
import { DeviceSessions, type DeviceSession } from "@/components/account/device-sessions";
import { EmailChangeForm } from "@/components/account/email-change-form";
import { TwoStepSetup, type TwoStepState } from "@/components/auth/two-step-setup";
import { PasswordUpdateForm } from "@/components/password-form";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { deviceLabel } from "@/lib/auth/devices";
import { getAssurance } from "@/lib/auth/mfa";
import { getSafeAuthRedirect } from "@/lib/auth/redirects";

export const metadata = { title: "Seguridad" };

// safe-08 and safe-09 (feature ideas, accounts batch): two-step sign-in, the devices with an open session, the sign-in
// e-mail and the password. A session that still owes its authenticator code sees only the code step.

type Requirement = { required?: boolean; reason?: "store" | "admin" | null; recovery_codes_left?: number };

const lastActive = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Lima" });

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ paso?: string; next?: string; correo?: string }> }) {
  const params = await searchParams;
  const { supabase, user } = await getAccountContext();
  const next = params.next ? getSafeAuthRedirect(params.next, "") || null : null;
  const assurance = supabase ? await getAssurance(supabase) : null;

  if (assurance?.needsCode) {
    return (
      <div className="max-w-md rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <PageHeader title="Escribe tu código" meta="Tu cuenta tiene la verificación en dos pasos activa." />
        <div className="mt-6">
          <TwoStepSetup state={{ hasFactor: true, aal: "aal1", required: false, reason: null, recoveryCodesLeft: 0 }} next={next} />
        </div>
      </div>
    );
  }

  const [{ data: requirementData }, { data: sessionRows }] = supabase
    ? await Promise.all([supabase.rpc("my_two_step_requirement"), supabase.rpc("list_my_sessions")])
    : [{ data: null }, { data: null }];
  const requirement = (requirementData ?? {}) as Requirement;
  const state: TwoStepState = {
    hasFactor: Boolean(assurance?.hasFactor),
    aal: assurance?.currentLevel === "aal2" ? "aal2" : "aal1",
    required: requirement.required === true,
    reason: requirement.reason === "store" || requirement.reason === "admin" ? requirement.reason : null,
    recoveryCodesLeft: Number(requirement.recovery_codes_left) || 0,
  };
  const sessions: DeviceSession[] = (sessionRows ?? []).map((row) => {
    const label = row.device_label ?? deviceLabel(row.user_agent);
    return {
      id: row.session_id,
      label,
      lastActive: lastActive.format(new Date(row.last_active_at ?? row.created_at)),
      current: row.is_current,
      phone: /iPhone|Android/.test(label),
    };
  });
  const confirmedEmail = params.correo === "confirmado" && !user.new_email;

  return (
    <>
      <AccountSettingsTabs current="/mi-cuenta/seguridad" />
      <div className="grid max-w-2xl gap-5">
        <PageHeader title="Seguridad" meta="Cómo ingresas a Laria y desde qué dispositivos." />
        {confirmedEmail ? <Notice tone="success"><p>Listo: desde ahora ingresas con {user.email}.</p></Notice> : null}
        <Section id="dos-pasos" title="Verificación en dos pasos">
          <TwoStepSetup state={state} next={next} startSetup={params.paso === "activar"} />
        </Section>
        <Section id="dispositivos" title="Dispositivos con sesión iniciada" meta="Si no reconoces uno, cierra su sesión y cambia tu contraseña.">
          <DeviceSessions sessions={sessions} />
        </Section>
        <Section id="correo" title="Correo de acceso">
          <EmailChangeForm current={user.email ?? ""} pending={user.new_email ?? null} />
        </Section>
        <Section id="contrasena" title="Cambiar contraseña" meta="La nueva contraseña debe tener al menos 8 caracteres.">
          <Suspense><PasswordUpdateForm mode="change" /></Suspense>
        </Section>
      </div>
    </>
  );
}

function Section({ id, title, meta, children }: { id: string; title: string; meta?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-titulo`} className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
      <h2 id={`${id}-titulo`} className="t-section text-ink">{title}</h2>
      {meta ? <p className="mt-1 t-meta">{meta}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
