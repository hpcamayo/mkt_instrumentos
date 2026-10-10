"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";

// An in-page confirmation in place of window.confirm (docs/ux-redesign/ux-6-accounts.md A3). A native modal <dialog>:
// the page behind is inert, focus starts on "Cancelar" (the safe choice), Esc and the backdrop cancel, and focus returns
// to the control that asked. useConfirm keeps the old call shape: `if (!(await confirm({...}))) return;`.

export type ConfirmOptions = {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
};

export function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: (confirmed: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={options.body ? bodyId : undefined}
      className="confirm-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose(false);
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose(false);
      }}
    >
      <div className="grid gap-4 p-5">
        <h2 id={titleId} className="t-section text-ink">{options.title}</h2>
        {options.body ? <div id={bodyId} className="t-body text-ink-2">{options.body}</div> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" className={buttonClasses({ variant: "secondary" })} onClick={() => onClose(false)}>{options.cancelLabel ?? "Cancelar"}</button>
          <button type="button" className={buttonClasses({ variant: options.tone === "danger" ? "danger" : "primary" })} onClick={() => onClose(true)}>{options.confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
}

export function useConfirm() {
  const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (value: boolean) => void; opener: Element | null } | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setPending({ options, resolve, opener: typeof document === "undefined" ? null : document.activeElement });
  }), []);

  const dialog = pending ? (
    <ConfirmDialog
      options={pending.options}
      onClose={(confirmed) => {
        pending.resolve(confirmed);
        setPending(null);
        // After the dialog has closed: while it is open the page behind is inert and cannot take focus.
        const opener = pending.opener;
        if (opener instanceof HTMLElement) requestAnimationFrame(() => opener.focus());
      }}
    />
  ) : null;

  return [confirm, dialog] as const;
}
