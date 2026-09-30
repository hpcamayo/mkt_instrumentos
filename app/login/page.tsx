import { NOINDEX_ROBOTS } from "@/lib/site";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = {
  robots: NOINDEX_ROBOTS,
  title: "Ingresar",
};

export default function LoginPage() {
  return (
    <PageContainer as="section" className="py-8 sm:py-12">
      <div className="mx-auto max-w-md rounded-panel border border-subtle bg-white p-6">
        <PageHeader
          eyebrow="Cuenta Laria"
          title="Ingresar"
          meta="Ingresa con tu contraseña o solicita un enlace seguro por correo."
        />
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </PageContainer>
  );
}
