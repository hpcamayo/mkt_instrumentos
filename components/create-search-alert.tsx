"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BellPlus } from "lucide-react";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { PageNotice } from "@/components/page-notice";
import { useDisclosure } from "@/components/use-disclosure";
import { alertPromptDismissed, dismissAlertPrompt, recordSearch, savePendingIntent, takePendingIntent } from "@/lib/device-saves";
import { searchAlertPath, searchAlertSummary, type SearchAlertFilters, type SearchAlertFrequency } from "@/lib/search-alerts";
import { BarHeight } from "@/components/ui/bar-height";
import { Button, buttonClasses } from "@/components/ui/button";
import { Radio } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const TRIGGER = {
  // The title row on desktop.
  button: buttonClasses({ variant: "secondary", size: "sm" }),
  // The applied-chips row on phones: a chip-styled button.
  chip: "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-control border border-line-strong bg-surface px-3 text-[14px] font-semibold leading-5 text-ink transition-colors duration-120 hover:bg-canvas [&_svg]:h-4 [&_svg]:w-4",
  // The end-of-results tile and the no-results state.
  inline: buttonClasses({ variant: "secondary" }),
};

const CREATED = "Alerta creada. Te avisaremos por correo solo sobre publicaciones nuevas que coincidan.";

async function createAlert(filters: SearchAlertFilters, frequency: SearchAlertFrequency) {
  try {
    const response = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", filters, frequency }),
    });
    const result = await response.json().catch(() => ({}));
    return response.ok ? { ok: true as const, message: CREATED } : { ok: false as const, message: String(result.message ?? "No pudimos crear la alerta. Intenta nuevamente.") };
  } catch {
    return { ok: false as const, message: "No pudimos crear la alerta. Intenta nuevamente." };
  }
}

// One instance per page owns the page-level work (resuming after sign-in, the repeat-search prompt), because the
// catalog renders the entry up to four times.
let owner: string | null = null;

// The alert entry (UX-3 Q11 A): a "Crear alerta" button in the title row, a chip on phones, the end-of-results tile
// and the no-results state, offered only when a filter or a category narrows the search. It opens a small panel with
// what the alert saves and its frequency (daily first, save-05). Signed out it leads to sign-in and back, and the
// alert is created on return (save-01). After the same search on a second occasion it offers itself once (save-06).
export function CreateSearchAlert({
  filters,
  variant,
  align = "left",
  label = "Crear alerta",
  trackSearch = true,
}: {
  filters: SearchAlertFilters | null;
  variant: "button" | "chip" | "inline";
  align?: "left" | "right";
  label?: string;
  trackSearch?: boolean;
}) {
  const { authenticated, ready, flash } = useMarketplaceAccount();
  const instance = useId();
  const disclosure = useDisclosure(`alerta-${variant}${instance}`);
  const [frequency, setFrequency] = useState<SearchAlertFrequency>("daily");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [prompt, setPrompt] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const resumed = useRef(false);
  const searchPath = filters ? searchAlertPath(filters) : null;

  useEffect(() => {
    if (!trackSearch || owner) return;
    owner = instance;
    setIsOwner(true);
    return () => {
      if (owner === instance) owner = null;
    };
  }, [instance, trackSearch]);

  // save-06: count this search once per page view, and offer the alert from the second occasion on.
  useEffect(() => {
    if (!isOwner || !searchPath || !ready) return;
    const count = recordSearch(searchPath);
    setPrompt(count >= 2 && !alertPromptDismissed(searchPath));
  }, [isOwner, searchPath, ready]);

  // save-01: back from sign-in, finish what the person started.
  useEffect(() => {
    if (!isOwner || !filters || !searchPath || !ready || !authenticated || resumed.current) return;
    const intent = takePendingIntent("alert", searchPath);
    if (!intent) return;
    resumed.current = true;
    void createAlert(filters, intent.frequency).then((result) => {
      dismissAlertPrompt(searchPath);
      setPrompt(false);
      flash(result.ok ? { message: "Alerta creada para esta búsqueda.", href: "/mi-cuenta/alertas", linkLabel: "Ver alertas" } : { message: result.message });
    });
  }, [isOwner, filters, searchPath, ready, authenticated, flash]);

  if (!filters || !searchPath) return null;

  const icon = <BellPlus aria-hidden />;
  const loginHref = `/login?next=${encodeURIComponent(searchPath)}&motivo=alerta`;
  const rememberIntent = (chosen: SearchAlertFrequency) => savePendingIntent({ kind: "alert", path: searchPath, filters, frequency: chosen });

  async function submit(chosen: SearchAlertFrequency) {
    if (busy || !filters) return;
    setBusy(true);
    setNotice(null);
    const result = await createAlert(filters, chosen);
    setNotice({ kind: result.ok ? "success" : "error", message: result.message });
    setBusy(false);
    return result.ok;
  }

  // The owner instance may sit in a container hidden at this width, so the prompt is rendered on the page body.
  const repeatPrompt = prompt && typeof document !== "undefined" ? createPortal(
    <div role="region" aria-label="Sugerencia de alerta" data-bottom-bar className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md rounded-panel border border-line-deco bg-surface p-4 shadow-level-1">
      <BarHeight variable="--bottom-bar-height" />
      <p className="t-ui font-semibold text-ink">¿Te avisamos cuando aparezca otro?</p>
      <p className="mt-1 t-meta">Ya buscaste {searchAlertSummary(filters)} antes. Te enviamos un resumen diario solo si hay publicaciones nuevas.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ready && !authenticated ? (
          <Link href={loginHref} onClick={() => rememberIntent("daily")} className={buttonClasses({ size: "sm" })}>Sí, avísame</Link>
        ) : (
          <Button
            size="sm"
            loading={busy}
            loadingLabel="Creando…"
            onClick={() => void submit("daily").then((ok) => {
              dismissAlertPrompt(searchPath);
              setPrompt(false);
              flash(ok ? { message: "Alerta creada para esta búsqueda.", href: "/mi-cuenta/alertas", linkLabel: "Ver alertas" } : { message: "No pudimos crear la alerta. Ya podrías tenerla en Alertas.", href: "/mi-cuenta/alertas", linkLabel: "Ver alertas" });
            })}
          >
            Sí, avísame
          </Button>
        )}
        <button
          type="button"
          onClick={() => {
            dismissAlertPrompt(searchPath);
            setPrompt(false);
          }}
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          No, gracias
        </button>
      </div>
    </div>,
    document.body,
  ) : null;

  if (ready && !authenticated) {
    return (
      <>
        <Link href={loginHref} onClick={() => rememberIntent("daily")} className={TRIGGER[variant]}>
          {icon}
          {label}
        </Link>
        {repeatPrompt}
      </>
    );
  }

  const panelId = `alerta-${variant}${instance.replace(/:/g, "")}-panel`;
  return (
    <div className="relative">
      <button ref={disclosure.buttonRef} type="button" aria-expanded={disclosure.open} aria-controls={panelId} onClick={disclosure.toggle} className={TRIGGER[variant]}>
        {icon}
        {label}
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
                  <fieldset className="grid gap-2">
                    <legend className="t-ui font-semibold text-ink">Frecuencia</legend>
                    <Radio name={`${panelId}-frecuencia`} checked={frequency === "daily"} onChange={() => setFrequency("daily")} label="Resumen diario" description="Un correo al día como máximo." />
                    <Radio name={`${panelId}-frecuencia`} checked={frequency === "immediate"} onChange={() => setFrequency("immediate")} label="Al instante" description="Para lo que de verdad estás esperando." />
                  </fieldset>
                  <p className="t-meta">Puedes cambiarla después en Alertas.</p>
                  {notice ? <PageNotice kind="error" message={notice.message} /> : null}
                  <Button onClick={() => void submit(frequency)} loading={busy} loadingLabel="Creando…">
                    Crear alerta
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
      {repeatPrompt}
    </div>
  );
}
