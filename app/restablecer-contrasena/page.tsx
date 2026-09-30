import { NOINDEX_ROBOTS } from "@/lib/site";
import { Suspense } from "react";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { PasswordUpdateForm } from "@/components/password-form";

export const metadata = { robots: NOINDEX_ROBOTS, title: "Restablecer contraseña" };
export default function ResetPasswordPage() {
  return <PageContainer className="py-10"><div className="mx-auto max-w-md rounded-panel border border-subtle bg-white p-6"><PageHeader title="Crea una nueva contraseña" meta="Usa al menos 8 caracteres." /><Suspense><PasswordUpdateForm mode="reset" /></Suspense></div></PageContainer>;
}
