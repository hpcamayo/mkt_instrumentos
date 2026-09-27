import Link from "next/link";
import type { ReactNode } from "react";
import { PageContainer } from "@/components/page-container";
import { LEGAL_LAST_UPDATED, getLegalContactEmail, legalPages } from "@/lib/legal-pages";

// Shared shell for Terms, Privacy, prohibited items and safety guidance.
export function LegalPage({
  path,
  eyebrow,
  title,
  intro,
  children,
}: {
  path: string;
  eyebrow: string;
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-laria-cloud/70">
      <PageContainer className="py-6 sm:py-8">
        <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start xl:gap-6">
          <nav aria-label="Ayuda y legal" className="rounded-lg border border-laria-fog bg-white p-3 shadow-sm lg:sticky lg:top-24">
            <p className="px-3 pb-2 pt-1 text-xs font-black uppercase tracking-[0.15em] text-laria-text-soft">Ayuda y legal</p>
            <ul className="grid gap-1">
              {legalPages.map((page) => {
                const active = page.href === path;
                return (
                  <li key={page.href}>
                    <Link
                      href={page.href}
                      aria-current={active ? "page" : undefined}
                      className={active
                        ? "flex min-h-11 items-center rounded-md border border-laria-blue/35 bg-laria-blue/10 px-3 py-2 text-sm font-black text-laria-blue"
                        : "flex min-h-11 items-center rounded-md border border-transparent px-3 py-2 text-sm font-bold text-laria-text-soft hover:border-laria-fog hover:text-laria-blue"}
                    >
                      {page.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <article className="min-w-0 rounded-lg border border-laria-fog bg-white p-5 shadow-[0_18px_48px_rgb(16_18_23/0.06)] sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-laria-blue">{eyebrow}</p>
            <h1 className="mt-2 text-3xl font-black leading-tight text-laria-ink sm:text-4xl">{title}</h1>
            <p className="mt-2 text-xs font-semibold text-laria-muted">Última actualización: {LEGAL_LAST_UPDATED}</p>
            <div className="mt-4 max-w-3xl text-sm leading-7 text-laria-text-soft sm:text-base">{intro}</div>
            <div className="mt-6 grid max-w-3xl gap-7">{children}</div>
          </article>
        </div>
      </PageContainer>
    </section>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-black text-laria-ink sm:text-xl">{title}</h2>
      <div className="mt-2 grid gap-3 text-sm leading-7 text-laria-text-soft sm:text-base [&_a]:font-bold [&_a]:text-laria-blue [&_li]:pl-1 [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

// States the platform limitations required by the V1 contract in one place.
export function MarketplaceLimitations() {
  return (
    <div className="rounded-md border border-laria-blue/25 bg-laria-blue/10 p-4 text-sm leading-6 text-laria-ink">
      <p className="font-black">Laria conecta compradores y vendedores. La compraventa se acuerda y se realiza directamente entre ellos.</p>
      <ul className="mt-2 grid list-disc gap-1 pl-5 text-laria-text-soft">
        <li>Laria no procesa pagos ni cobra comisiones por venta.</li>
        <li>Laria no retiene ni custodia dinero (no ofrece escrow).</li>
        <li>Laria no gestiona envíos ni entregas.</li>
        <li>Laria no garantiza la autenticidad, el estado ni el funcionamiento de los productos.</li>
        <li>Laria no garantiza que una transacción se concrete ni resuelve disputas entre las partes.</li>
      </ul>
    </div>
  );
}

export function LegalContact({ purpose }: { purpose: string }) {
  const email = getLegalContactEmail();
  if (email) {
    return (
      <p>
        {purpose} escríbenos a <a href={`mailto:${email}`}>{email}</a>.
      </p>
    );
  }
  // NEXT_PUBLIC_CONTACT_EMAIL is a go-live requirement (docs/go-live-checklist.md).
  return <p>{purpose} usa el canal de contacto oficial de Laria, que se publicará en esta página antes del lanzamiento público.</p>;
}
