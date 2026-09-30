import { Suspense } from "react";
import { AccountSettingsTabs } from "@/components/account-settings-tabs";
import { PasswordUpdateForm } from "@/components/password-form";

export const metadata = { title: "Cambiar contraseña" };
export default async function SecurityPage() {
  return <><AccountSettingsTabs current="/mi-cuenta/seguridad" /><div className="max-w-md rounded-panel border border-subtle bg-white p-6"><h1 className="t-page text-ink">Cambiar contraseña</h1><p className="mt-2 t-ui text-ink-2">La nueva contraseña debe tener al menos 8 caracteres.</p><Suspense><PasswordUpdateForm mode="change" /></Suspense></div></>;
}
