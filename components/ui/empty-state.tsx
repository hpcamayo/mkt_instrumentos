import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Explains why there is nothing here and offers the next step.
export function EmptyState({
  title,
  description,
  actions,
  className,
  headingLevel = 2,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <div className={cn("flex flex-col items-start gap-2 rounded-panel border border-subtle bg-surface p-6", className)}>
      <Heading className="t-section text-ink">{title}</Heading>
      {description ? <div className="text-lead max-w-[68ch] t-body text-ink-2">{description}</div> : null}
      {actions ? <div className="mt-2 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
