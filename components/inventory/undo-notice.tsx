"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PageNotice } from "@/components/page-notice";
import type { InventoryActionResult } from "@/lib/inventory-client";

// Effortless Laria, inventory batch, stock-03: the result of a stock or bulk change with "Deshacer" for ten seconds.
// The countdown pauses while the pointer or focus is on the notice, so nobody has to race it, and the same undo stays
// available afterwards where it belongs (the SKU's history, Precios), as the server accepts it for 15 minutes.

export type UndoAction = {
  // Runs the undo; resolves to the inventory action result.
  run: () => Promise<InventoryActionResult>;
  // What the notice says once undone.
  done: string;
};

export type InventoryNotice = { kind: "success" | "error"; message: string; undo?: UndoAction };

export const UNDO_SECONDS = 10;

export function UndoNotice({ notice, onChange }: { notice: InventoryNotice; onChange: (next: InventoryNotice) => void }) {
  const router = useRouter();
  const [left, setLeft] = useState(UNDO_SECONDS);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const undo = notice.undo;
  const latest = useRef(notice);
  latest.current = notice;

  useEffect(() => setLeft(UNDO_SECONDS), [notice]);

  useEffect(() => {
    if (!undo || paused || busy) return;
    if (left <= 0) {
      onChange({ kind: latest.current.kind, message: latest.current.message });
      return;
    }
    const timer = setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [undo, paused, busy, left, onChange]);

  async function runUndo() {
    if (!undo) return;
    setBusy(true);
    const result = await undo.run();
    setBusy(false);
    onChange(result.ok ? { kind: "success", message: undo.done } : { kind: "error", message: result.message });
    if (result.ok) router.refresh();
  }

  return (
    <div
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <PageNotice kind={notice.kind} message={notice.message}>
        {undo ? (
          <p className="mt-1">
            <button type="button" className="link font-semibold" disabled={busy} onClick={runUndo}>
              {busy ? "Deshaciendo…" : "Deshacer"}
            </button>
            <span className="t-meta" aria-hidden> · {paused ? "en pausa" : `${left} s`}</span>
          </p>
        ) : null}
      </PageNotice>
    </div>
  );
}
