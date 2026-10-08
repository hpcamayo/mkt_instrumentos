"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { IconButton } from "@/components/ui/button";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A bottom sheet (docs/ux-redesign/ux-3-discovery.md § Filters): a modal dialog from the bottom of the screen, white,
// up to 88% of the viewport, over a frame-black backdrop at 55% (`.sheet` in app/globals.css). It slides up in 200 ms,
// in place under reduced motion. Render it only while open: it opens as a native modal <dialog>, which makes the page
// behind inert; Tab stays inside, the page does not scroll, and Esc, the close button or a press on the backdrop call
// onDismiss. The caller closes it and returns focus to the button that opened it.
export function Sheet({
  title,
  closeLabel,
  onDismiss,
  footer,
  children,
}: {
  title: string;
  closeLabel: string;
  onDismiss: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = overflow;
      if (dialog.open) dialog.close();
    };
  }, []);

  // Tab wraps inside the sheet, also where the browser would move focus to its own interface.
  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const items = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((item) => item.getClientRects().length > 0);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-modal="true"
      className="sheet"
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onDismiss();
      }}
      onKeyDown={onKeyDown}
    >
      <div className="sheet-body">
        <div className="flex items-center justify-between gap-3 border-b border-line-deco py-1.5 pl-4 pr-2">
          <h2 id={titleId} className="t-section text-ink">
            {title}
          </h2>
          <IconButton label={closeLabel} icon={<X aria-hidden />} variant="quiet" onClick={onDismiss} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
        {footer ? <div className="border-t border-line-deco px-4 py-3">{footer}</div> : null}
      </div>
    </dialog>
  );
}
