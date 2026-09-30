"use client";

import Link from "next/link";
import { useState } from "react";
import { BellPlus } from "lucide-react";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { PageNotice } from "@/components/page-notice";
import { searchAlertPath, searchAlertSummary, type SearchAlertFilters, type SearchAlertFrequency } from "@/lib/search-alerts";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";

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
    <section className="rounded-panel border border-subtle bg-white p-4 sm:p-5" aria-labelledby="create-search-alert-title">
      {notice ? <PageNotice kind={notice.kind} message={notice.message}>
        {notice.kind === "success" ? <Link href="/mi-cuenta/alertas" className="link mt-3 inline-flex font-semibold">Administrar mis alertas</Link> : null}
      </PageNotice> : null}
      <div className={notice ? "mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between" : "flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"}>
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-ink"><BellPlus className="h-5 w-5" aria-hidden="true" /><h2 id="create-search-alert-title" className="t-section">Crear alerta para esta búsqueda</h2></div>
          <p className="mt-2 t-ui text-ink-2">{searchAlertSummary(filters)}. Solo recibirás coincidencias que se vuelvan públicas después de activar la alerta.</p>
        </div>
        {!ready ? <span className="t-ui font-semibold text-ink-2">Comprobando tu cuenta…</span> : !authenticated ? (
          <Link href={loginHref} className={buttonClasses({ variant: "secondary", className: "shrink-0" })}>Ingresar para crear alerta</Link>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field id="alerta-frecuencia" label="Frecuencia">
              <Select value={frequency} onChange={(event) => setFrequency(event.target.value as SearchAlertFrequency)}>
                <option value="immediate">Inmediata</option>
                <option value="daily">Resumen diario</option>
              </Select>
            </Field>
            <Button onClick={() => void createAlert()} loading={busy} loadingLabel="Creando…">Crear alerta</Button>
          </div>
        )}
      </div>
    </section>
  );
}
