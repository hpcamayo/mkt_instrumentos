"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageNotice } from "@/components/page-notice";
import { searchAlertFrequencyLabel, searchAlertPath, searchAlertSummary, type SavedSearchAlert } from "@/lib/search-alerts";

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
        <section className="rounded-lg border border-laria-fog bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-black text-laria-ink">Todavía no tienes alertas</h2>
          <p className="mt-2 text-sm leading-6 text-laria-text-soft">Aplica filtros en el catálogo y guarda esa búsqueda para recibir publicaciones nuevas.</p>
          <Link href="/listados" className="laria-button-primary mt-5 min-h-11 px-5 py-3 text-sm">Explorar catálogo</Link>
        </section>
      ) : (
        <ol className="grid gap-3">
          {alerts.map((alert) => (
            <li key={alert.id} className="rounded-lg border border-laria-fog bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={alert.status === "active" ? "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800" : "rounded-full bg-laria-cloud px-2.5 py-1 text-xs font-black text-laria-text-soft"}>{alert.status === "active" ? "Activa" : "Pausada"}</span>
                    <span className="text-xs font-bold text-laria-text-soft">{searchAlertFrequencyLabel(alert.frequency)}</span>
                  </div>
                  <h2 className="mt-3 text-lg font-black text-laria-ink">{searchAlertSummary(alert.search_filters)}</h2>
                  <p className="mt-2 text-xs leading-5 text-laria-muted">Al reactivar una alerta no enviamos publicaciones aparecidas durante la pausa.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={searchAlertPath(alert.search_filters)} className="laria-button-secondary min-h-11 px-4 py-3 text-sm">Abrir búsqueda</Link>
                  <button type="button" disabled={busy === alert.id} onClick={() => void mutate(alert, "status")} className="laria-button-secondary min-h-11 px-4 py-3 text-sm disabled:opacity-50">{alert.status === "active" ? "Pausar" : "Reactivar"}</button>
                  <button type="button" disabled={busy === alert.id} onClick={() => void mutate(alert, "delete")} className="min-h-11 rounded-md border border-red-200 px-4 py-3 text-sm font-black text-red-700 disabled:opacity-50">Eliminar</button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
