"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageNotice } from "@/components/page-notice";
import { searchAlertFrequencyLabel, searchAlertPath, searchAlertSummary, type SavedSearchAlert } from "@/lib/search-alerts";
import { buttonClasses } from "@/components/ui/button";
import { StatusTag } from "@/components/ui/tag";

export function SavedSearchAlerts({ alerts }: { alerts: SavedSearchAlert[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  async function mutate(alert: SavedSearchAlert, action: "status" | "delete") {
    if (busy) return;
    if (action === "delete" && !window.confirm("¿Eliminar esta alerta? No recibirás nuevas coincidencias.")) return;
    setBusy(alert.id);
    setNotice(null);
    try {
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "delete"
          ? { action, id: alert.id }
          : { action, id: alert.id, active: alert.status !== "active" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setNotice({
        kind: "success",
        message: action === "delete" ? "Alerta eliminada." : alert.status === "active" ? "Alerta pausada. No guardaremos coincidencias mientras esté pausada." : "Alerta reactivada para futuras publicaciones nuevas.",
      });
      router.refresh();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "No pudimos actualizar la alerta." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      {notice ? <PageNotice kind={notice.kind} message={notice.message} /> : null}
      {!alerts.length ? (
        <section className="rounded-panel border border-subtle bg-white p-8 text-center">
          <h2 className="t-section text-ink">Todavía no tienes alertas</h2>
          <p className="mt-2 t-ui text-ink-2">Aplica filtros en el catálogo y guarda esa búsqueda para recibir publicaciones nuevas.</p>
          <Link href="/listados" className={buttonClasses({ className: "mt-5" })}>Explorar catálogo</Link>
        </section>
      ) : (
        <ol className="grid gap-3">
          {alerts.map((alert) => (
            <li key={alert.id} className="rounded-panel border border-subtle bg-white p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusTag domain="alert" status={alert.status} />
                    <span className="t-meta">{searchAlertFrequencyLabel(alert.frequency)}</span>
                  </div>
                  <h2 className="mt-3 t-section text-ink">{searchAlertSummary(alert.search_filters)}</h2>
                  <p className="mt-2 t-meta">Al reactivar una alerta no enviamos publicaciones aparecidas durante la pausa.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={searchAlertPath(alert.search_filters)} className={buttonClasses({ variant: "secondary" })}>Abrir búsqueda</Link>
                  <button type="button" disabled={busy === alert.id} onClick={() => void mutate(alert, "status")} className={buttonClasses({ variant: "secondary" })}>{alert.status === "active" ? "Pausar" : "Reactivar"}</button>
                  <button type="button" disabled={busy === alert.id} onClick={() => void mutate(alert, "delete")} className="min-h-11 rounded-control border border-danger/40 px-4 py-3 text-sm font-semibold text-danger disabled:opacity-50">Eliminar</button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
