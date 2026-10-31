"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Notice } from "@/components/ui/notice";

// safe-02 (accounts batch): closing one's own report. Either way Laria stops comparing it.
export function ReportStatusActions({ id, code }: { id: string; code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  async function close(status: "recovered" | "withdrawn") {
    const recovered = status === "recovered";
    if (!(await confirm({
      title: recovered ? `¿Recuperaste el equipo del reporte ${code}?` : `¿Retirar el reporte ${code}?`,
      body: "Dejaremos de compararlo con las publicaciones.",
      confirmLabel: recovered ? "Sí, lo recuperé" : "Retirar reporte",
      tone: "primary",
    }))) return;
    setBusy(status);
    setError(null);
    const response = await fetch("/api/stolen-gear/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { message?: string } | null;
    setBusy(null);
    if (!response?.ok) return setError(result?.message ?? "No pudimos actualizar el reporte. Vuelve a intentarlo.");
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => void close("recovered")} loading={busy === "recovered"} loadingLabel="Guardando…" disabled={busy !== null}>Lo recuperé</Button>
        <Button type="button" variant="quiet" onClick={() => void close("withdrawn")} disabled={busy !== null}>Retirar reporte</Button>
      </div>
      {error ? <Notice tone="danger"><p>{error}</p></Notice> : null}
      {confirmDialog}
    </div>
  );
}
