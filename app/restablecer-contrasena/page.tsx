import { NOINDEX_ROBOTS } from "@/lib/site";
import { Suspense } from "react";
import { PageContainer } from "@/components/page-container";
import { PasswordUpdateForm } from "@/components/password-form";

export const metadata = { robots: NOINDEX_ROBOTS, title: "Restablecer contraseña" };
export default function ResetPasswordPage() {
  return <PageContainer className="py-10"><div className="mx-auto max-w-md rounded-panel border border-subtle bg-white p-6"><h1 className="t-page text-ink">Crea una nueva contraseña</h1><p className="mt-2 t-ui text-ink-2">Usa al menos 8 caracteres.</p><Suspense><PasswordUpdateForm mode="reset" /></Suspense></div></PageContainer>;
}
