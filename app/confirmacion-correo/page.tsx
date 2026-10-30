import { NOINDEX_ROBOTS } from "@/lib/site";
import Link from "next/link";
import { PageContainer } from "@/components/page-container";
import { getCurrentUser } from "@/lib/auth/session";
import { buttonClasses } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmationRecovery } from "@/components/auth/confirmation-recovery";
import { getSafeAuthRedirect } from "@/lib/auth/redirects";

export const metadata = {
  robots: NOINDEX_ROBOTS,
  title: "Confirmación de correo",
};

export default async function EmailConfirmationPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  const next = getSafeAuthRedirect((await searchParams).next);
  const confirmed = Boolean(user?.email_confirmed_at);

  return (
    <PageContainer as="section" className="py-10 sm:py-14">
      <div className="mx-auto max-w-2xl rounded-panel border border-subtle bg-white p-6 sm:p-8">
        <PageHeader eyebrow="Cuenta Laria" title={confirmed ? "Tu correo ha sido confirmado" : "El enlace de confirmación ya no es válido"} />
        <p className="mt-4 t-body text-ink-2">
          {confirmed
            ? "Tu cuenta está lista para ingresar a Laria."
            : "El enlace puede haber vencido o haber sido reemplazado al pedir otro. Abre el correo más reciente y pulsa «Confirmar mi correo». Si no lo encuentras, solicita otro enlace aquí."}
        </p>
        {!confirmed ? <ConfirmationRecovery next={next} /> : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className={buttonClasses()}
            href={confirmed ? next : `/login?next=${encodeURIComponent(next)}`}
          >
            {confirmed ? "Continuar" : "Ya confirmé mi correo: ingresar"}
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
