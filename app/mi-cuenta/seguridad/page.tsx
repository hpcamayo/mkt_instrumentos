import { Suspense } from "react";
import { AccountSettingsTabs } from "@/components/account-settings-tabs";
import { PasswordUpdateForm } from "@/components/password-form";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Cambiar contraseña" };
export default async function SecurityPage() {
  return <><AccountSettingsTabs current="/mi-cuenta/seguridad" /><div className="max-w-md rounded-panel border border-subtle bg-white p-6"><PageHeader title="Cambiar contraseña" meta="La nueva contraseña debe tener al menos 8 caracteres." /><Suspense><PasswordUpdateForm mode="change" /></Suspense></div></>;
}
