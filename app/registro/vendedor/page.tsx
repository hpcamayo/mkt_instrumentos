import { NOINDEX_ROBOTS } from "@/lib/site";
import { Suspense } from "react";
import { SellerSignupForm } from "@/components/seller-signup-form";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = {
  robots: NOINDEX_ROBOTS,
  title: "Crear cuenta",
};

export default function SellerRegistrationPage() {
  return (
    <PageContainer as="section" className="py-8 sm:py-12">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <PageHeader eyebrow="Cuenta Laria" title="Compra y vende con tu cuenta Laria" />
          <p className="t-body text-ink-2">
            Guarda favoritos en todos tus dispositivos, recibe alertas de
            instrumentos nuevos y publica tus equipos usados.
          </p>
          <div className="rounded-panel border border-subtle bg-white p-4 t-ui text-ink-2">
            Solo te pedimos tu nombre, correo y una contraseña. Tu WhatsApp y
            tu ciudad los pedimos recién cuando publiques algo.
          </div>
        </div>

        <div className="rounded-panel border border-subtle bg-white p-6">
          <Suspense>
            <SellerSignupForm />
          </Suspense>
        </div>
      </div>
    </PageContainer>
  );
}
