import Link from "next/link";
import { PageContainer } from "@/components/page-container";
import { StoreOwnerSignupForm } from "@/components/store-owner-signup-form";

export const metadata = { title: "Crear cuenta de Tienda" };

export default function StoreOwnerRegistrationPage() {
  return (
    <PageContainer as="section" className="py-8 sm:py-12">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <p className="text-sm font-black uppercase tracking-wide text-laria-blue">Cuenta de Tienda</p>
          <h1 className="text-3xl font-black tracking-tight text-laria-ink sm:text-4xl">Crea una identidad separada para tu negocio</h1>
          <p className="text-sm leading-6 text-laria-text-soft sm:text-base">
            Esta cuenta administra una sola tienda y su inventario. No convierte ni reemplaza una cuenta Particular existente.
          </p>
          <div className="rounded-lg border border-laria-fog bg-white p-4 text-sm leading-6 text-laria-text-soft">
            ¿Quieres publicar equipo usado a título personal? <Link href="/registro/vendedor" className="font-black text-laria-blue">Crea una cuenta Particular</Link>.
          </div>
        </div>
        <div className="rounded-lg border border-laria-fog bg-white p-6 shadow-sm">
          <StoreOwnerSignupForm />
        </div>
      </div>
    </PageContainer>
  );
}
