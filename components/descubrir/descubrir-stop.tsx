"use client";

import { CheckCircle2, Loader2, PauseCircle, SearchX, WifiOff } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";

type Action = { label: string; href?: string; onClick?: () => void };

// A screen without a listing: the stop after today's listings, the pause every 48, the end, an empty feed, and the
// screen that waits for the next listings (or offers to try again). White text on the frame; one primary action.
export function DescubrirStop({
  headingId,
  current,
  tone,
  title,
  body,
  note,
  primary,
  secondary,
}: {
  headingId: string;
  current: boolean;
  tone: "done" | "pause" | "empty" | "loading" | "error";
  title: string;
  body?: string;
  note?: ReactNode;
  primary?: Action;
  secondary?: Action;
}) {
  const icon = {
    done: <CheckCircle2 className="h-10 w-10 text-accent" aria-hidden="true" />,
    pause: <PauseCircle className="h-10 w-10 text-accent" aria-hidden="true" />,
    empty: <SearchX className="h-10 w-10 text-accent" aria-hidden="true" />,
    loading: <Loader2 className="h-10 w-10 animate-spin text-accent" aria-hidden="true" />,
    error: <WifiOff className="h-10 w-10 text-accent" aria-hidden="true" />,
  }[tone];
  return (
    <section aria-labelledby={headingId} inert={!current} className="surface-frame flex h-full flex-col items-center justify-center gap-3 px-6 pb-8 pt-14 text-center">
      {icon}
      <h2 id={headingId} tabIndex={-1} className="t-page text-surface">{title}</h2>
      {body ? <p className="max-w-[34ch] t-body text-muted-dark">{body}</p> : null}
      {note}
      {primary || secondary ? (
        <div className="mt-3 flex w-full max-w-xs flex-col gap-3">
          {primary ? <ActionButton action={primary} variant="primary" /> : null}
          {secondary ? <ActionButton action={secondary} variant="onDark" /> : null}
        </div>
      ) : null}
    </section>
  );
}

function ActionButton({ action, variant }: { action: Action; variant: "primary" | "onDark" }) {
  const className = buttonClasses({ variant, block: true });
  return action.href ? (
    <Link href={action.href} className={className}>{action.label}</Link>
  ) : (
    <button type="button" className={className} onClick={action.onClick}>{action.label}</button>
  );
}
