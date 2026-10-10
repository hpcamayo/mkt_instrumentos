"use client";

import { useEffect, useRef } from "react";
import { NoticeIcon, noticeBodyClassName, noticeClassName } from "@/components/ui/notice";

export type ErrorSummaryItem = { id: string; message: string };

// The errors of a form that failed its own checks, listed in field order. It takes focus each time a submit fails
// (the `attempt` counter changes) so screen-reader and keyboard users hear it; each link moves focus to its field.
export function ErrorSummary({ title, errors, attempt }: { title: string; errors: ErrorSummaryItem[]; attempt: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.focus({ preventScroll: true });
    ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [attempt]);

  if (!errors.length) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert" aria-labelledby="resumen-errores" className={noticeClassName("danger")}>
      <NoticeIcon tone="danger" />
      <div className={noticeBodyClassName}>
        <h2 id="resumen-errores" className="font-semibold">{title}</h2>
        <ul className="mt-2 grid gap-1.5">
          {errors.map((error) => (
            <li key={`${error.id}-${error.message}`}>
              <a
                href={`#${error.id}`}
                onClick={(event) => {
                  const field = document.getElementById(error.id);
                  if (!field) return;
                  event.preventDefault();
                  field.focus({ preventScroll: true });
                  field.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                {error.message}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
