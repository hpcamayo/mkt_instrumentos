import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { PageContainer } from "@/components/page-container";

export const metadata = {
  title: "Ingresar",
};

export default function LoginPage() {
  return (
    <PageContainer as="section" className="py-8 sm:py-12">
      <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-brass">
            Cuenta Laria
          </p>
          <h1 className="text-2xl font-bold text-ink">Ingresar</h1>
          <p className="text-sm leading-6 text-slate-600">
            Ingresa con tu contraseña o solicita un enlace seguro por correo.
          </p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </PageContainer>
  );
}
