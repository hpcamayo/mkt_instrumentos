import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { GlobalSearch } from "@/components/global-search";
import { NotFoundExtras, NotFoundHeading } from "@/components/not-found-extras";
import { PageContainer } from "@/components/page-container";

export const NOT_FOUND_COPY = {
  title: "No encontramos esta página",
  message: "Puede que la dirección esté mal o que la publicación ya no esté disponible.",
};
export const SERVER_ERROR_COPY = {
  title: "Algo salió mal",
  message: "Vuelve a intentarlo en unos minutos.",
};

// The 404 and 500 body (docs/ux-redesign/ux-2-shell.md): a centred 560 px column with the title, one line, the
// search field and two links. No illustration. `action` is the page's own button (the 500's "Reintentar").
// Effortless Laria (find batch): the not-found page says when a listing's address is one that is no longer available,
// shows live listings of its type (FIND 16) and the recently viewed (FIND 11), from components/not-found-extras.tsx.
export function ErrorPage({ title, message, searchId, action }: { title: string; message: string; searchId: string; action?: ReactNode }) {
  const notFound = title === NOT_FOUND_COPY.title;
  return (
    <PageContainer as="section" className="py-12 md:py-20">
      <div className="mx-auto max-w-[560px] text-center">
        {notFound ? (
          <Suspense fallback={<><h1 className="t-page text-ink">{title}</h1><p className="text-lead mt-3 t-body text-ink-2">{message}</p></>}>
            <NotFoundHeading title={title} message={message} />
          </Suspense>
        ) : (
          <>
            <h1 className="t-page text-ink">{title}</h1>
            <p className="text-lead mt-3 t-body text-ink-2">{message}</p>
          </>
        )}
        {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
        <Suspense fallback={<div className="mt-6 h-11" />}>
          <GlobalSearch id={searchId} className="mt-6 text-left" />
        </Suspense>
        <p className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 t-ui">
          <Link href="/" className="link inline-flex min-h-11 items-center font-semibold">Ir al inicio</Link>
          <span aria-hidden="true" className="text-ink-3">·</span>
          <Link href="/listados" className="link inline-flex min-h-11 items-center font-semibold">Ver instrumentos</Link>
        </p>
      </div>
      {notFound ? (
        <div className="mx-auto max-w-page">
          <Suspense fallback={null}>
            <NotFoundExtras />
          </Suspense>
        </div>
      ) : null}
    </PageContainer>
  );
}
