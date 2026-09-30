import Link from "next/link";
import { NOINDEX_ROBOTS } from "@/lib/site";
import { PageContainer } from "@/components/page-container";
import { StoreOwnerSignupForm } from "@/components/store-owner-signup-form";

export const metadata = { robots: NOINDEX_ROBOTS, title: "Crear cuenta de Tienda" };

export default function StoreOwnerRegistrationPage() {
  return (
    <PageContainer as="section" className="py-8 sm:py-12">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <p className="t-micro text-ink-2">Cuenta de Tienda</p>
          <h1 className="t-page text-ink">Crea una identidad separada para tu negocio</h1>
          <p className="text-sm leading-6 text-ink-2 sm:text-base">
            Esta cuenta administra una sola tienda y su inventario. No convierte ni reemplaza una cuenta Particular existente.
          </p>
          <div className="rounded-panel border border-subtle bg-white p-4 text-sm leading-6 text-ink-2">
            ¿Quieres publicar equipo usado a título personal? <Link href="/registro/vendedor" className="link font-semibold">Crea una cuenta Particular</Link>.
          </div>
        </div>
        <div className="rounded-panel border border-subtle bg-white p-6">
          <StoreOwnerSignupForm />
        </div>
      </div>
    </PageContainer>
  );
}
