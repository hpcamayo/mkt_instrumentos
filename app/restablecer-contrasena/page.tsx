import { Suspense } from "react";
import { PageContainer } from "@/components/page-container";
import { PasswordUpdateForm } from "@/components/password-form";

export const metadata = { title: "Restablecer contraseña" };
export default function ResetPasswordPage() {
  return <PageContainer className="py-10"><div className="mx-auto max-w-md rounded-lg border border-laria-fog bg-white p-6 shadow-sm"><h1 className="text-2xl font-black text-laria-ink">Crea una nueva contraseña</h1><p className="mt-2 text-sm leading-6 text-laria-text-soft">Usa al menos 8 caracteres.</p><Suspense><PasswordUpdateForm mode="reset" /></Suspense></div></PageContainer>;
}
