import type { Metadata } from "next";
import { PageContainer } from "@/components/page-container";
import { StoreRegistrationForm } from "@/components/store-registration-form";

export const metadata: Metadata = {
  title: "Registrar tienda",
  description:
    "Registra una tienda musical pequeña para revisión y futura publicación en Instrumentos Perú.",
  openGraph: {
    title: "Registra tu tienda musical",
    description:
      "Solicita una página pública para tu tienda y muestra tus productos aprobados en el marketplace.",
    url: "/registrar-tienda",
  },
};

export default function RegisterStorePage() {
  return (
    <PageContainer as="section" className="py-6">
      <div className="flex w-full max-w-4xl flex-col gap-6">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-brass">
            Tiendas
          </p>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">
            Registra tu tienda
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Envía los datos básicos de tu tienda. Un administrador revisará la
            solicitud antes de activar la página pública.
          </p>
        </div>
        <StoreRegistrationForm />
      </div>
    </PageContainer>
  );
}
