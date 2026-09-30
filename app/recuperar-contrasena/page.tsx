import { NOINDEX_ROBOTS } from "@/lib/site";
import { PageContainer } from "@/components/page-container";
import { ForgotPasswordForm } from "@/components/password-form";

export const metadata = { robots: NOINDEX_ROBOTS, title: "Recuperar contraseña" };
export default function ForgotPasswordPage() {
  return <PageContainer className="py-10"><div className="mx-auto max-w-md rounded-panel border border-subtle bg-white p-6"><h1 className="t-page text-ink">Recuperar contraseña</h1><p className="mt-2 t-ui text-ink-2">Te enviaremos un enlace seguro al correo de tu cuenta.</p><ForgotPasswordForm /></div></PageContainer>;
}
