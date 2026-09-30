import Link from "next/link";
import type { ReactNode } from "react";
import { PageContainer } from "@/components/page-container";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
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
    <section className="bg-canvas/70">
      <PageContainer className="py-6 sm:py-8">
        <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start xl:gap-6">
          <nav aria-label="Ayuda y legal" className="rounded-panel border border-subtle bg-white p-3 lg:sticky lg:top-24">
            <p className="px-3 pb-2 pt-1 t-micro text-ink-2">Ayuda y legal</p>
            <ul className="grid gap-1">
              {legalPages.map((page) => {
                const active = page.href === path;
                return (
                  <li key={page.href}>
                    <Link
                      href={page.href}
                      aria-current={active ? "page" : undefined}
                      className={active
                        ? "flex min-h-11 items-center rounded-control bg-accent-tint px-3 py-2 t-ui font-semibold text-ink shadow-[inset_3px_0_0_var(--accent)]"
                        : "flex min-h-11 items-center rounded-control px-3 py-2 t-ui font-semibold text-ink-2 hover:bg-canvas hover:text-ink"}
                    >
                      {page.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <article className="min-w-0 rounded-panel border border-subtle bg-white p-5 sm:p-8">
            <PageHeader eyebrow={eyebrow} title={title} meta={`Última actualización: ${LEGAL_LAST_UPDATED}`} />
            <div className="mt-4 max-w-[68ch] t-body text-ink-2">{intro}</div>
            <div className="mt-6 grid max-w-[68ch] gap-7">{children}</div>
          </article>
        </div>
      </PageContainer>
    </section>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="t-section text-ink">{title}</h2>
      <div className="mt-2 grid gap-3 t-body text-ink-2 [&_a]:font-semibold [&_a]:text-ink [&_a]:underline [&_a]:decoration-accent [&_a]:decoration-2 [&_a]:underline-offset-[3px] [&_li]:pl-1 [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

// States the platform limitations required by the V1 contract in one place.
export function MarketplaceLimitations() {
  return (
    <Notice tone="info" role="note">
      <p className="font-semibold">Laria conecta compradores y vendedores. La compraventa se acuerda y se realiza directamente entre ellos.</p>
      <ul className="mt-2 grid list-disc gap-1 pl-5 text-ink-2">
        <li>Laria no procesa pagos ni cobra comisiones por venta.</li>
        <li>Laria no retiene ni custodia dinero (no ofrece escrow).</li>
        <li>Laria no gestiona envíos ni entregas.</li>
        <li>Laria no garantiza la autenticidad, el estado ni el funcionamiento de los productos.</li>
        <li>Laria no garantiza que una transacción se concrete ni resuelve disputas entre las partes.</li>
      </ul>
    </Notice>
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
