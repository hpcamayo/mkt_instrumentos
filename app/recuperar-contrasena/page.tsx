import { PageContainer } from "@/components/page-container";
import { ForgotPasswordForm } from "@/components/password-form";

export const metadata = { title: "Recuperar contraseña" };
export default function ForgotPasswordPage() {
  return <PageContainer className="py-10"><div className="mx-auto max-w-md rounded-lg border border-laria-fog bg-white p-6 shadow-sm"><h1 className="text-2xl font-black text-laria-ink">Recuperar contraseña</h1><p className="mt-2 text-sm leading-6 text-laria-text-soft">Te enviaremos un enlace seguro al correo de tu cuenta.</p><ForgotPasswordForm /></div></PageContainer>;
}
