"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import { inventoryAction } from "@/lib/inventory-client";
import { arrivalBounds, arrivalPresets, validArrivalDate } from "@/lib/store-floor/arrivals";
import { limaToday, longDate } from "@/lib/store-floor/dates";

// reach-08 "Por llegar": the owner's date for SKUs without units, on the SKU page and as a bulk action in Inventario.
// set_inventory_arrival skips SKUs that have units, so a mixed selection still works; the date clears itself when
// units arrive, and the daily job clears dates that passed.

type ArrivalResult = { updated: number; skipped: number; expected_arrival_on: string | null };

function DateFields({ value, onChange, error, id }: { value: string; onChange: (value: string) => void; error?: string; id: string }) {
  const today = limaToday();
  const { min, max } = arrivalBounds(today);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Fechas rápidas">
        {arrivalPresets(today).map((preset) => (
          <Chip key={preset.value} selected={value === preset.value} onClick={() => onChange(preset.value)}>{preset.label}</Chip>
        ))}
      </div>
      <Field id={id} label="Fecha estimada de llegada" hint="La ven quienes miran la publicación. Es una estimación: si cambia, actualízala." error={error}>
        <Input type="date" min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} className="max-w-48" />
      </Field>
    </div>
  );
}

// On the SKU page: only while the SKU has no units available.
export function ArrivalForm({ itemId, current }: { itemId: string; current: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [saved, setSaved] = useState("");

  async function save(next: string | null) {
    if (next !== null && !validArrivalDate(next)) return setError("Elige una fecha desde hoy y hasta dentro de un año.");
    setError("");
    setSaved("");
    setBusy(next === null ? "remove" : "save");
    const result = await inventoryAction<ArrivalResult>({ action: "arrival", item_ids: [itemId], expected_on: next });
    setBusy(null);
    if (!result.ok) return setError(result.message);
    if (next && result.data.skipped) return setError("Este SKU ya tiene unidades disponibles: no necesita fecha de llegada.");
    if (next === null) setValue("");
    setSaved(next ? `Guardado: la publicación muestra “Por llegar” con fecha estimada ${longDate(next)}.` : "Fecha quitada.");
    router.refresh();
  }

  return (
    <form
      className="grid gap-3 rounded-panel border border-subtle p-4"
      onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void save(value || null); }}
      noValidate
    >
      <div className="grid gap-1">
        <h3 className="t-ui font-semibold text-ink">Por llegar</h3>
        <p className="t-meta">¿Ya pediste más? Pon la fecha estimada: la publicación sigue visible con la fecha y quien quiera recibe un aviso cuando llegue.</p>
      </div>
      <DateFields id={`llegada-${itemId}`} value={value} onChange={setValue} error={error} />
      {saved ? <p role="status" className="t-meta font-semibold text-ink">{saved}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={busy === "save"} loadingLabel="Guardando…" disabled={!value || busy !== null}>Guardar fecha</Button>
        {current ? <Button type="button" size="sm" variant="secondary" loading={busy === "remove"} loadingLabel="Quitando…" disabled={busy !== null} onClick={() => void save(null)}>Quitar fecha</Button> : null}
      </div>
    </form>
  );
}

// The bulk action: up to 200 ticked SKU.
export function BulkArrivalSheet({ items, onClose, onDone }: {
  items: { id: string; merchant_sku: string; product_name: string; quantity_available: number }[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const formId = "llegada-masiva";
  const withUnits = items.filter((item) => item.quantity_available > 0).length;
  const tooMany = items.length > 200;

  async function submit(clear: boolean) {
    if (!clear && !validArrivalDate(value)) return setError("Elige una fecha desde hoy y hasta dentro de un año.");
    setError("");
    setBusy(true);
    const result = await inventoryAction<ArrivalResult>({ action: "arrival", item_ids: items.map((item) => item.id), expected_on: clear ? null : value });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    const { updated, skipped } = result.data;
    onDone(clear
      ? `Fecha de llegada quitada en ${updated === 1 ? "1 SKU" : `${updated} SKU`}.`
      : `“Por llegar” con fecha ${longDate(value)} en ${updated === 1 ? "1 SKU" : `${updated} SKU`}.${skipped ? ` ${skipped === 1 ? "1 SKU tiene" : `${skipped} SKU tienen`} unidades y no cambió.` : ""}`);
    router.refresh();
  }

  return (
    <Sheet
      title="Por llegar"
      closeLabel="Cerrar sin guardar"
      onDismiss={onClose}
      layout="responsive"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="secondary" disabled={busy || tooMany} onClick={() => void submit(true)}>Quitar fecha</Button>
          <Button type="submit" form={formId} loading={busy} loadingLabel="Guardando…" disabled={tooMany}>Guardar fecha</Button>
        </div>
      }
    >
      <form id={formId} className="grid gap-4 pt-4" onSubmit={(event) => { event.preventDefault(); void submit(false); }} noValidate>
        {tooMany ? <Notice tone="warning" role="note">Elige hasta 200 SKU para poner una fecha de llegada.</Notice> : null}
        <DateFields id={`${formId}-fecha`} value={value} onChange={setValue} error={error} />
        <p className="t-meta">
          Se aplica a {items.length === 1 ? "1 SKU" : `${items.length} SKU`} sin unidades disponibles.
          {withUnits ? ` ${withUnits === 1 ? "1 SKU seleccionado tiene" : `${withUnits} SKU seleccionados tienen`} unidades y se deja igual.` : ""}
        </p>
      </form>
    </Sheet>
  );
}
