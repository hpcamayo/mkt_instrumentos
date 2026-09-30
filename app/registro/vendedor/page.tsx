import { NOINDEX_ROBOTS } from "@/lib/site";
import { SellerSignupForm } from "@/components/seller-signup-form";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = {
  robots: NOINDEX_ROBOTS,
  title: "Crear cuenta Particular",
};

export default function SellerRegistrationPage() {
  return (
    <PageContainer as="section" className="py-8 sm:py-12">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <PageHeader eyebrow="Cuenta Particular" title="Compra y vende con tu cuenta Laria" />
          <p className="t-body text-ink-2">
            Guarda tus datos como Particular para comprar, publicar equipos
            usados y recibir contactos directos por WhatsApp.
          </p>
          <div className="rounded-panel border border-subtle bg-white p-4 t-ui text-ink-2">
            Tu perfil se guarda al registrarte. Después de confirmar el correo,
            entrarás directamente a Mi cuenta; no tendrás que completar los
            mismos datos otra vez.
          </div>
        </div>

        <div className="rounded-panel border border-subtle bg-white p-6">
          <SellerSignupForm />
        </div>
      </div>
    </PageContainer>
  );
}
