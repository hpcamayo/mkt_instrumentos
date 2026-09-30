import { NOINDEX_ROBOTS } from "@/lib/site";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { ForgotPasswordForm } from "@/components/password-form";

export const metadata = { robots: NOINDEX_ROBOTS, title: "Recuperar contraseña" };
export default function ForgotPasswordPage() {
  return <PageContainer className="py-10"><div className="mx-auto max-w-md rounded-panel border border-subtle bg-white p-6"><PageHeader title="Recuperar contraseña" meta="Te enviaremos un enlace seguro al correo de tu cuenta." /><ForgotPasswordForm /></div></PageContainer>;
}
