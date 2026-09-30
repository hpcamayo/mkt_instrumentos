import Link from "next/link";
import type { Metadata } from "next";
import { PageContainer } from "@/components/page-container";
import { NOINDEX_ROBOTS } from "@/lib/site";
import { buttonClasses } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: NOINDEX_ROBOTS,
};

export default function NotFound() {
  return (
    <PageContainer as="section" className="py-12 sm:py-16">
      <div className="mx-auto max-w-xl rounded-panel border border-subtle bg-white p-6 text-center sm:p-8">
        <PageHeader
          className="justify-center"
          eyebrow="Error 404"
          title="No encontramos esta página"
          meta="La publicación o tienda puede haber sido retirada, o el enlace no es correcto."
        />
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/listados" className={buttonClasses()}>Ver instrumentos</Link>
          <Link href="/" className={buttonClasses({ variant: "secondary" })}>Ir al inicio</Link>
        </div>
      </div>
    </PageContainer>
  );
}
