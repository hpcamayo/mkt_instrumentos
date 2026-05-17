import Link from "next/link";
import { PageContainer } from "@/components/page-container";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata = {
  title: "Correo confirmado",
};

export default async function EmailConfirmationPage() {
  const user = await getCurrentUser();

  return (
    <PageContainer as="main" className="py-10 sm:py-14">
      <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-brass">
          Cuenta Laria
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink">
          Tu correo ha sido confirmado
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-600 sm:text-base">
          Ya puedes ingresar a tu cuenta de Laria y empezar a administrar tus
          publicaciones.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className="inline-flex items-center justify-center rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            href="/login"
          >
            Ingresar
          </Link>
          {user ? (
            <Link
              className="inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-3 text-sm font-semibold text-ink transition hover:border-brass hover:text-brass"
              href="/mi-cuenta"
            >
              Ir a mis publicaciones
            </Link>
          ) : null}
        </div>
      </div>
    </PageContainer>
  );
}
