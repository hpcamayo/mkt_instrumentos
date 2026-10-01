import Link from "next/link";
import { Suspense } from "react";
import { GlobalSearch } from "@/components/global-search";
import { PageContainer } from "@/components/page-container";

// The 404 and 500 body (docs/ux-redesign/ux-2-shell.md): a centred 560 px column with the title, one line, the
// search field and two links. No illustration.
export function ErrorPage({ title, message, searchId }: { title: string; message: string; searchId: string }) {
  return (
    <PageContainer as="section" className="py-12 md:py-20">
      <div className="mx-auto max-w-[560px] text-center">
        <h1 className="t-page text-ink">{title}</h1>
        <p className="text-lead mt-3 t-body text-ink-2">{message}</p>
        <Suspense fallback={<div className="mt-6 h-11" />}>
          <GlobalSearch id={searchId} className="mt-6 text-left" />
        </Suspense>
        <p className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 t-ui">
          <Link href="/" className="link inline-flex min-h-11 items-center font-semibold">Ir al inicio</Link>
          <span aria-hidden="true" className="text-ink-3">·</span>
          <Link href="/listados" className="link inline-flex min-h-11 items-center font-semibold">Ver instrumentos</Link>
        </p>
      </div>
    </PageContainer>
  );
}
