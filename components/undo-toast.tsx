"use client";

import { X } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { BarHeight } from "@/components/ui/bar-height";
import { buttonClasses, IconButton } from "@/components/ui/button";

export type UndoToastMessage = {
  // Changes on every new notice, so the 10 s restart for each one.
  id: number;
  message: string;
  // The inverse of what just happened; without it the notice only reports.
  onUndo?: () => void;
};

export const UNDO_TOAST_MS = 10_000;

// mine-13: the result of a reversible action (hide, restore, a new price) with "Deshacer" instead of a confirmation
// beforehand. A polite status region that is always in the page, so the message is announced; it never takes focus.
// After 10 s the notice goes away and nothing else happens (the timer only closes it); it waits while the pointer or the
// focus is on it, and Esc or "Cerrar aviso" close it at once.
export function UndoToast({ toast, busy = false, onDismiss }: { toast: UndoToastMessage | null; busy?: boolean; onDismiss: () => void }) {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!toast || held || busy) return;
    const timer = window.setTimeout(onDismiss, UNDO_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast, held, busy, onDismiss]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") onDismiss();
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex justify-center md:inset-x-auto md:bottom-6 md:right-6"
    >
      {toast ? (
        <div
          data-bottom-bar
          className="surface-frame pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-panel bg-frame py-2 pl-4 pr-2 text-surface shadow-level-2"
          onMouseEnter={() => setHeld(true)}
          onMouseLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false);
          }}
          onKeyDown={onKeyDown}
        >
          <BarHeight variable="--bottom-bar-height" />
          <p className="min-w-0 flex-1 t-ui">{toast.message}</p>
          {toast.onUndo ? (
            <button type="button" disabled={busy} onClick={toast.onUndo} className={buttonClasses({ variant: "onDark", size: "sm" })}>
              {busy ? "Deshaciendo…" : "Deshacer"}
            </button>
          ) : null}
          <IconButton variant="onDark" size="sm" label="Cerrar aviso" icon={<X />} onClick={onDismiss} />
        </div>
      ) : null}
    </div>
  );
}
