"use client";

import Link from "next/link";
import { useState } from "react";
import { BellPlus } from "lucide-react";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { PageNotice } from "@/components/page-notice";
import { searchAlertPath, searchAlertSummary, type SearchAlertFilters, type SearchAlertFrequency } from "@/lib/search-alerts";

export function CreateSearchAlert({ filters }: { filters: SearchAlertFilters }) {
  const { authenticated, ready } = useMarketplaceAccount();
  const [frequency, setFrequency] = useState<SearchAlertFrequency>("immediate");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const searchPath = searchAlertPath(filters);
  const loginHref = `/login?next=${encodeURIComponent(searchPath)}`;

  async function createAlert() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", filters, frequency }),
      });
      const result = await response.json();
      setNotice({
        kind: response.ok ? "success" : "error",
        message: response.ok ? "Alerta creada. Te avisaremos solo sobre publicaciones nuevas que coincidan." : result.message,
      });
    } catch {
      setNotice({ kind: "error", message: "No pudimos crear la alerta. Intenta nuevamente." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-laria-blue/25 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="create-search-alert-title">
      {notice ? <PageNotice kind={notice.kind} message={notice.message}>
        {notice.kind === "success" ? <Link href="/mi-cuenta/alertas" className="mt-3 inline-flex font-black text-laria-blue underline">Administrar mis alertas</Link> : null}
      </PageNotice> : null}
      <div className={notice ? "mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between" : "flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"}>
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-laria-blue"><BellPlus className="h-5 w-5" aria-hidden="true" /><h2 id="create-search-alert-title" className="font-black">Crear alerta para esta búsqueda</h2></div>
          <p className="mt-2 text-sm leading-6 text-laria-text-soft">{searchAlertSummary(filters)}. Solo recibirás coincidencias que se vuelvan públicas después de activar la alerta.</p>
        </div>
        {!ready ? <span className="text-sm font-bold text-laria-muted">Comprobando tu cuenta…</span> : !authenticated ? (
          <Link href={loginHref} className="laria-button-secondary min-h-11 shrink-0 px-4 py-3 text-sm">Ingresar para crear alerta</Link>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="grid gap-1.5 text-sm font-bold text-laria-text-soft">Frecuencia
              <select value={frequency} onChange={(event) => setFrequency(event.target.value as SearchAlertFrequency)} className="min-h-11 rounded-md border border-laria-steel bg-white px-3 text-laria-ink">
                <option value="immediate">Inmediata</option>
                <option value="daily">Resumen diario</option>
              </select>
            </label>
            <button type="button" disabled={busy} onClick={() => void createAlert()} className="laria-button-primary min-h-11 px-5 py-3 text-sm disabled:opacity-50">{busy ? "Creando…" : "Crear alerta"}</button>
          </div>
        )}
      </div>
    </section>
  );
}
