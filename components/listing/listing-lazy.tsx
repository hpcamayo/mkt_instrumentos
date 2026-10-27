"use client";

import { useId } from "react";
import { afterPage } from "@/components/after-page";
import { Button, buttonClasses } from "@/components/ui/button";

// Parts of the listing page whose code loads after the page instead of with it (launch audit A29: phones arriving from
// WhatsApp and Google downloaded all of it first). Each one either waits for a press or never had server content. If
// one's code fails to download, only that part says so, with "Reintentar"; the listing and its contact button stay.

// The photo lightbox loads on the first photo opened, here and on the store page. `preloadLightbox` starts that
// download when a pointer or the focus reaches a photo, so it is usually there by the click.
export const Lightbox = afterPage(() => import("@/components/listing/lightbox").then((module) => module.Lightbox), {
  loading: () => null,
  failed: (retry, { start, onClose }) => <LightboxFailed retry={retry} close={() => onClose(start)} />,
});

// A preload that fails is tried again when the lightbox opens.
export function preloadLightbox() {
  import("@/components/listing/lightbox").catch(() => {});
}

export function LightboxFailed({ retry, close }: { retry: () => void; close: () => void }) {
  return (
    <div role="alert" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md flex-wrap items-center gap-3 rounded-panel border border-subtle bg-surface p-4">
      <p className="t-ui text-ink">No pudimos abrir la foto.</p>
      <Button variant="secondary" size="sm" onClick={retry}>Reintentar</Button>
      <Button variant="quiet" size="sm" onClick={close}>Cerrar</Button>
    </div>
  );
}

// "Preguntas" reads its questions in the browser once the account check settles, so the server only ever sent its
// heading and "Cargando preguntas…". That stays the server's markup (the same as the section's own first render, checked
// in tests/ux-listing-questions.test.cjs), and the section's code loads after the page.
export function QuestionsLoading() {
  const headingId = useId();
  return (
    <section id="preguntas" aria-labelledby={headingId} className="scroll-mt-4">
      <h2 id={headingId} className="t-section text-ink">Preguntas</h2>
      <p role="status" className="mt-3 t-meta">Cargando preguntas…</p>
    </section>
  );
}

// The same as the section's own note when its questions don't load.
export function QuestionsFailed({ retry }: { retry: () => void }) {
  const headingId = useId();
  return (
    <section id="preguntas" aria-labelledby={headingId} className="scroll-mt-4">
      <h2 id={headingId} className="t-section text-ink">Preguntas</h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p role="alert" className="t-ui text-ink-2">No pudimos cargar las preguntas.</p>
        <button type="button" onClick={retry} className={buttonClasses({ variant: "quiet" })}>Reintentar</button>
      </div>
    </section>
  );
}

export const ListingQuestions = afterPage(
  () => import("@/components/listing/listing-questions").then((module) => module.ListingQuestions),
  { loading: () => <QuestionsLoading />, failed: (retry) => <QuestionsFailed retry={retry} /> },
);
