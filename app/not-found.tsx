import Link from "next/link";
import type { Metadata } from "next";
import { PageContainer } from "@/components/page-container";
import { NOINDEX_ROBOTS } from "@/lib/site";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: NOINDEX_ROBOTS,
};

export default function NotFound() {
  return (
    <PageContainer as="section" className="py-12 sm:py-16">
      <div className="mx-auto max-w-xl rounded-panel border border-subtle bg-white p-6 text-center sm:p-8">
        <p className="t-micro text-ink-2">Error 404</p>
        <h1 className="mt-2 t-page text-ink">No encontramos esta página</h1>
        <p className="mt-3 text-sm leading-6 text-ink-2">
          La publicación o tienda puede haber sido retirada, o el enlace no es correcto.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/listados" className={buttonClasses()}>Ver instrumentos</Link>
          <Link href="/" className={buttonClasses({ variant: "secondary" })}>Ir al inicio</Link>
        </div>
      </div>
    </PageContainer>
  );
}
