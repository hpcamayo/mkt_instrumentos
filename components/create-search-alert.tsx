"use client";

import Link from "next/link";
import { useState } from "react";
import { BellPlus } from "lucide-react";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { PageNotice } from "@/components/page-notice";
import { useDisclosure } from "@/components/use-disclosure";
import { ONE_VALUE_PER_FILTER, searchAlertPath, searchAlertSummary, type SearchAlertFilters, type SearchAlertFrequency } from "@/lib/search-alerts";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const TRIGGER = {
  // The title row on desktop.
  button: buttonClasses({ variant: "secondary", size: "sm" }),
  // The applied-chips row on phones: a chip-styled button.
  chip: "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-control border border-line-strong bg-surface px-3 text-[14px] font-semibold leading-5 text-ink transition-colors duration-120 hover:bg-canvas [&_svg]:h-4 [&_svg]:w-4",
  // The end-of-results tile and the no-results state.
  inline: buttonClasses({ variant: "secondary" }),
};

// The alert entry (UX-3 Q11 A): a "Crear alerta" button in the title row, a chip on phones, the end-of-results tile
// and the no-results state, offered only when a filter or a category narrows the search. It opens a small panel with
// what the alert saves and its frequency (the choice cannot be changed later). Signed out it leads to sign-in and back
// (ALERT-001/002). A search with several values in one filter (F11) cannot be saved: `filters` is null and the entry
// shows the line asking for one value per filter instead.
export function CreateSearchAlert({
  filters,
  variant,
  align = "left",
}: {
  filters: SearchAlertFilters | null;
  variant: "button" | "chip" | "inline";
  align?: "left" | "right";
}) {
  const { authenticated, ready } = useMarketplaceAccount();
  const disclosure = useDisclosure(`alerta-${variant}`);
  const [frequency, setFrequency] = useState<SearchAlertFrequency>("immediate");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  if (!filters) return <p className="t-meta">{ONE_VALUE_PER_FILTER}</p>;

  const searchPath = searchAlertPath(filters);
  const icon = <BellPlus aria-hidden />;
  if (ready && !authenticated) {
    return (
      <Link href={`/login?next=${encodeURIComponent(searchPath)}`} className={TRIGGER[variant]}>
        {icon}
        Crear alerta
      </Link>
    );
  }

  async function createAlert() {
    if (busy || !filters) return;
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
        message: response.ok ? "Alerta creada. Te avisaremos por correo solo sobre publicaciones nuevas que coincidan." : result.message,
      });
    } catch {
      setNotice({ kind: "error", message: "No pudimos crear la alerta. Intenta nuevamente." });
    } finally {
      setBusy(false);
    }
  }

  const panelId = `alerta-${variant}-panel`;
  return (
    <div className="relative">
      <button ref={disclosure.buttonRef} type="button" aria-expanded={disclosure.open} aria-controls={panelId} onClick={disclosure.toggle} className={TRIGGER[variant]}>
        {icon}
        Crear alerta
      </button>
      {disclosure.open ? (
        <div
          ref={disclosure.panelRef}
          id={panelId}
          className={cn(
            "surface-light menu-fade absolute top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-panel border border-line-deco bg-surface p-4 text-left shadow-level-1",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {notice?.kind === "success" ? (
            <PageNotice kind="success" message={notice.message}>
              <Link href="/mi-cuenta/alertas" className="mt-2 inline-flex">
                Administrar mis alertas
              </Link>
            </PageNotice>
          ) : (
            <>
              <p className="t-ui font-semibold text-ink">Crear alerta para esta búsqueda</p>
              <p className="mt-1 t-meta">{searchAlertSummary(filters)}. Solo recibirás publicaciones que se vuelvan públicas después de crearla.</p>
              {!ready ? (
                <p className="mt-3 t-ui font-semibold text-ink-2">Comprobando tu cuenta…</p>
              ) : (
                <div className="mt-3 flex flex-col gap-3">
                  <Field id={`alerta-${variant}-frecuencia`} label="Frecuencia">
                    <Select value={frequency} onChange={(event) => setFrequency(event.target.value as SearchAlertFrequency)}>
                      <option value="immediate">Inmediata</option>
                      <option value="daily">Resumen diario</option>
                    </Select>
                  </Field>
                  {notice ? <PageNotice kind="error" message={notice.message} /> : null}
                  <Button onClick={() => void createAlert()} loading={busy} loadingLabel="Creando…">
                    Crear alerta
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
