import Link from "next/link";
import type { Metadata } from "next";
import { PageContainer } from "@/components/page-container";
import { NOINDEX_ROBOTS } from "@/lib/site";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: NOINDEX_ROBOTS,
};

export default function NotFound() {
  return (
    <PageContainer as="section" className="py-12 sm:py-16">
      <div className="mx-auto max-w-xl rounded-lg border border-laria-fog bg-white p-6 text-center shadow-sm sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-laria-blue">Error 404</p>
        <h1 className="mt-2 text-2xl font-black text-laria-ink sm:text-3xl">No encontramos esta página</h1>
        <p className="mt-3 text-sm leading-6 text-laria-text-soft">
          La publicación o tienda puede haber sido retirada, o el enlace no es correcto.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/listados" className="laria-button-primary min-h-11 px-5 py-3 text-sm">Ver instrumentos</Link>
          <Link href="/" className="laria-button-secondary min-h-11 px-5 py-3 text-sm">Ir al inicio</Link>
        </div>
      </div>
    </PageContainer>
  );
}
