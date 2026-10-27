"use client";

import dynamic from "next/dynamic";
import { useId } from "react";

// Parts of the listing page whose code loads after the page instead of with it (launch audit A29: phones arriving from
// WhatsApp and Google downloaded all of it first). Each one either waits for a press or never had server content.

// The photo lightbox loads on the first photo opened, here and on the store page. `preloadLightbox` starts that
// download when a pointer or the focus reaches a photo, so it is usually there by the click.
export const Lightbox = dynamic(() => import("@/components/listing/lightbox").then((module) => module.Lightbox), { ssr: false });

export function preloadLightbox() {
  void import("@/components/listing/lightbox");
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

export const ListingQuestions = dynamic(
  () => import("@/components/listing/listing-questions").then((module) => module.ListingQuestions),
  { ssr: false, loading: () => <QuestionsLoading /> },
);
