import { Suspense } from "react";
import { AccountSettingsTabs } from "@/components/account-settings-tabs";
import { TwoStepVerification } from "@/components/auth/two-step-verification";
import { PasswordUpdateForm } from "@/components/password-form";
import { PageHeader } from "@/components/ui/page-header";
import { getAssurance } from "@/lib/auth/mfa";
import { getSafeAuthRedirect } from "@/lib/auth/redirects";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const metadata = { title: "Seguridad" };

// Admin accounts also get the two-step section (launch audit A15): alone while the session still owes the
// authenticator code (?paso=codigo), and before the password panel when an Admin page sent them to set it up
// (?paso=activar). Both come back to ?next= afterwards.
export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ paso?: string; next?: string }> }) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const next = params.next ? getSafeAuthRedirect(params.next, "") || null : null;
  const admin = user?.app_metadata?.role === "admin";
  const supabase = admin ? await getSupabaseServerClient() : null;
  const assurance = supabase ? await getAssurance(supabase) : null;

  if (assurance?.needsCode) {
    return (
      <div className="max-w-md rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <PageHeader title="Escribe tu código" meta="Tu cuenta tiene la verificación en dos pasos activa." />
        <TwoStepVerification next={next} framed={false} />
      </div>
    );
  }

  const twoStep = admin ? <TwoStepVerification next={next} /> : null;
  const setupFirst = admin && params.paso === "activar";
  return (
    <>
      <AccountSettingsTabs current="/mi-cuenta/seguridad" />
      <div className="grid gap-4">
        {setupFirst ? twoStep : null}
        <div className="max-w-md rounded-panel border border-subtle bg-white p-6"><PageHeader title="Cambiar contraseña" meta="La nueva contraseña debe tener al menos 8 caracteres." /><Suspense><PasswordUpdateForm mode="change" /></Suspense></div>
        {setupFirst ? null : twoStep}
      </div>
    </>
  );
}
