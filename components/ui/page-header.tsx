import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Page title (the page's only h1), an optional one-line summary and the page's actions.
export function PageHeader({
  title,
  meta,
  eyebrow,
  actions,
  className,
  titleId,
}: {
  title: ReactNode;
  meta?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleId?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow ? <p className="t-micro text-ink-2">{eyebrow}</p> : null}
        <h1 id={titleId} className="t-page text-ink">
          {title}
        </h1>
        {meta ? <div className="text-lead t-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
