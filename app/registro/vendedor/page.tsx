import { SellerSignupForm } from "@/components/seller-signup-form";
import { PageContainer } from "@/components/page-container";

export const metadata = {
  title: "Registro de vendedor",
};

export default function SellerRegistrationPage() {
  return (
    <PageContainer as="section" className="py-8 sm:py-12">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-brass">
            Vendedores particulares
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Crea tu cuenta para vender en Laria
          </h1>
          <p className="text-sm leading-6 text-slate-600 sm:text-base">
            Publica instrumentos y equipos musicales usados, administra tus
            avisos y recibe contactos directos por WhatsApp.
          </p>
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600 shadow-sm">
            Las publicaciones de vendedores particulares podran salir publicas
            cuando cumplan los requisitos de calidad: fotos, datos completos,
            precio real y contacto disponible.
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <SellerSignupForm />
        </div>
      </div>
    </PageContainer>
  );
}
