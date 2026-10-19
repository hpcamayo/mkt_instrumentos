"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageNotice } from "@/components/page-notice";
import {
  searchAlertActivity,
  searchAlertFrequencyLabel,
  searchAlertPath,
  searchAlertSummary,
  searchAlertTitle,
  type SavedSearchAlert,
  type SearchAlertFrequency,
} from "@/lib/search-alerts";
import { Button, buttonClasses } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Radio } from "@/components/ui/field";
import { StatusTag, Tag } from "@/components/ui/tag";

type Notice = { kind: "success" | "error"; message: string };

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message ?? "No pudimos actualizar la alerta.");
}

export function SavedSearchAlerts({ alerts }: { alerts: SavedSearchAlert[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  async function mutate(alert: SavedSearchAlert, action: "status" | "delete") {
    if (busy) return;
    if (action === "delete" && !(await confirm({ title: "¿Eliminar esta alerta?", body: "No recibirás nuevas coincidencias.", confirmLabel: "Eliminar alerta", tone: "danger" }))) return;
    setBusy(alert.id);
    setNotice(null);
    try {
      await post(action === "delete" ? { action, id: alert.id } : { action, id: alert.id, active: alert.status !== "active" });
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
      {confirmDialog}
      {!alerts.length ? (
        <EmptyState
          title="Todavía no tienes alertas"
          description="Aplica filtros en el catálogo y guarda esa búsqueda para recibir publicaciones nuevas."
          actions={<Link href="/listados" className={buttonClasses()}>Explorar catálogo</Link>}
        />
      ) : (
        <ol className="grid gap-3">
          {alerts.map((alert) => (
            <li key={alert.id} className="rounded-panel border border-subtle bg-white p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusTag domain="alert" status={alert.status} />
                    <span className="t-meta">{searchAlertFrequencyLabel(alert.frequency)}</span>
                    {alert.new_count ? <Tag tone="accent">{alert.new_count === 1 ? "1 nueva" : `${alert.new_count} nuevas`} desde tu última visita</Tag> : null}
                  </div>
                  <h2 className="mt-3 t-section text-ink">{searchAlertTitle(alert)}</h2>
                  {alert.name ? <p className="mt-1 t-meta">{searchAlertSummary(alert.search_filters)}</p> : null}
                  <p className="mt-2 t-ui text-ink-2">{searchAlertActivity(alert)}</p>
                  {alert.status === "paused" ? <p className="mt-2 t-meta">Al reactivar una alerta no enviamos publicaciones aparecidas durante la pausa.</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={searchAlertPath(alert.search_filters)} className={buttonClasses({ variant: "secondary" })}>Ver resultados</Link>
                  <button type="button" aria-expanded={editing === alert.id} onClick={() => setEditing(editing === alert.id ? null : alert.id)} className={buttonClasses({ variant: "secondary" })}>Editar</button>
                  <button type="button" disabled={busy === alert.id} onClick={() => void mutate(alert, "status")} className={buttonClasses({ variant: "secondary" })}>{alert.status === "active" ? "Pausar" : "Reactivar"}</button>
                  <button type="button" disabled={busy === alert.id} onClick={() => void mutate(alert, "delete")} className={buttonClasses({ variant: "danger" })}>Eliminar</button>
                </div>
              </div>
              {editing === alert.id ? (
                <AlertEditor
                  alert={alert}
                  onCancel={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    setNotice({ kind: "success", message: "Alerta actualizada." });
                    router.refresh();
                  }}
                />
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// save-05: rename and switch frequency. Daily is offered first; instant is for the search you are really waiting on.
function AlertEditor({ alert, onCancel, onSaved }: { alert: SavedSearchAlert; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState(alert.name ?? "");
  const [frequency, setFrequency] = useState<SearchAlertFrequency>(alert.frequency);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await post({ action: "update", id: alert.id, name: name.trim() || null, frequency });
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No pudimos actualizar la alerta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="mt-4 grid gap-4 border-t border-subtle pt-4 sm:max-w-lg"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Field id={`alerta-${alert.id}-nombre`} label="Nombre" optional hint="Por ejemplo: «Strato para mi hijo». Si lo dejas vacío, usamos la búsqueda.">
        <Input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder={searchAlertSummary(alert.search_filters)} />
      </Field>
      <fieldset className="grid gap-2">
        <legend className="t-ui font-semibold text-ink">Frecuencia</legend>
        <Radio name={`alerta-${alert.id}-frecuencia`} checked={frequency === "daily"} onChange={() => setFrequency("daily")} label="Resumen diario" description="Un correo al día como máximo, solo si hay novedades." />
        <Radio name={`alerta-${alert.id}-frecuencia`} checked={frequency === "immediate"} onChange={() => setFrequency("immediate")} label="Al instante" description="Para la búsqueda que de verdad estás esperando." />
      </fieldset>
      {error ? <PageNotice kind="error" message={error} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy} loadingLabel="Guardando…">Guardar cambios</Button>
        <button type="button" onClick={onCancel} className={buttonClasses({ variant: "secondary" })}>Cancelar</button>
      </div>
    </form>
  );
}
