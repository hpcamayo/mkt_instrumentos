import { SellerSignupForm } from "@/components/seller-signup-form";
import { PageContainer } from "@/components/page-container";

export const metadata = {
  title: "Crear cuenta Particular",
};

export default function SellerRegistrationPage() {
  return (
    <PageContainer as="section" className="py-8 sm:py-12">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-brass">
            Cuenta Particular
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Compra y vende con tu cuenta Laria
          </h1>
          <p className="text-sm leading-6 text-slate-600 sm:text-base">
            Guarda tus datos como Particular para comprar, publicar equipos
            usados y recibir contactos directos por WhatsApp.
          </p>
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600 shadow-sm">
            Tu perfil se guarda al registrarte. Después de confirmar el correo,
            entrarás directamente a Mi cuenta; no tendrás que completar los
            mismos datos otra vez.
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <SellerSignupForm />
        </div>
      </div>
    </PageContainer>
  );
}
