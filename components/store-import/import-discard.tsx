"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

// stock-22: "Descartar y empezar otra" right on the unfinished-import notice, so a stale import never blocks a new one.
export function ImportDiscardButton({ sessionId, fileName }: { sessionId: string; fileName: string }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function discard() {
    const ok = await confirm({
      title: "¿Descartar esta importación?",
      body: `No se aplicará ningún cambio pendiente de ${fileName}. Lo que ya se aplicó al inventario se queda.`,
      confirmLabel: "Descartar",
      cancelLabel: "Volver",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/store/imports/${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setError("No pudimos descartarla. Inténtalo otra vez.");
      return;
    }
    router.refresh();
  }

  return (
    <>
      {confirmDialog}
      <Button size="sm" variant="quiet" loading={busy} loadingLabel="Descartando…" onClick={() => void discard()}>Descartar y empezar otra</Button>
      {error ? <span role="alert" className="t-ui text-danger">{error}</span> : null}
    </>
  );
}
