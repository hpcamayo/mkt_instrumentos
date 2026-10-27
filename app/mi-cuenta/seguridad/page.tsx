import { Suspense } from "react";
import { AccountSettingsTabs } from "@/components/account-settings-tabs";
import { TwoStepVerification } from "@/components/auth/two-step-verification";
import { PasswordUpdateForm } from "@/components/password-form";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { twoStepNext } from "@/lib/auth/two-step";

export const metadata = { title: "Cambiar contraseña" };

// Admin accounts also get the two-step section (launch audit A15), first when an Admin page sent them here.
export default async function SecurityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [user, query] = await Promise.all([getCurrentUser(), searchParams]);
  const admin = user?.app_metadata?.role === "admin";
  const twoStep = admin ? <TwoStepVerification next={twoStepNext(query.next)} /> : null;
  const sentFromAdmin = admin && query.verificar === "admin";
  return (
    <>
      <AccountSettingsTabs current="/mi-cuenta/seguridad" />
      <div className="grid gap-4">
        {sentFromAdmin ? twoStep : null}
        <div className="max-w-md rounded-panel border border-subtle bg-white p-6"><PageHeader title="Cambiar contraseña" meta="La nueva contraseña debe tener al menos 8 caracteres." /><Suspense><PasswordUpdateForm mode="change" /></Suspense></div>
        {sentFromAdmin ? null : twoStep}
      </div>
    </>
  );
}
