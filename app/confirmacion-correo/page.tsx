import { NOINDEX_ROBOTS } from "@/lib/site";
import Link from "next/link";
import { PageContainer } from "@/components/page-container";
import { getCurrentUser } from "@/lib/auth/session";
import { buttonClasses } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = {
  robots: NOINDEX_ROBOTS,
  title: "Correo confirmado",
};

export default async function EmailConfirmationPage() {
  const user = await getCurrentUser();

  return (
    <PageContainer as="section" className="py-10 sm:py-14">
      <div className="mx-auto max-w-2xl rounded-panel border border-subtle bg-white p-6 sm:p-8">
        <PageHeader eyebrow="Cuenta Laria" title="Tu correo ha sido confirmado" />
        <p className="mt-4 t-body text-ink-2">
          Tu cuenta Particular está lista para comprar, vender y administrar tu
          información en Laria.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className={buttonClasses()}
            href={user ? "/mi-cuenta" : "/login"}
          >
            {user ? "Ir a Mi cuenta" : "Ingresar"}
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
