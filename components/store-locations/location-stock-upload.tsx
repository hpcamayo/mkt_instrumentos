"use client";

import { Download, Upload } from "lucide-react";
import { useId, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FileInput } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { inventoryAction, newRequestKey } from "@/lib/inventory-client";
import type { CounterItem } from "@/lib/inventory-counter";
import { detectFormat, readSpreadsheet } from "@/lib/store-import/sheet";
import { ImportFileError } from "@/lib/store-import/types";
import { countBatches, readStockSheet, stockColumn, type SheetProblem, type StoreLocation } from "@/lib/store-locations";
import { numbers } from "@/lib/store-inventory";

// run-02 "Stock por sede": download the inventory with one "Stock <sede>" column per location, count, upload it back.
// Each filled cell is a count at that location (blank cells are left as they are); the totals follow. Applied in
// requests of up to 200 SKU, each with its own key, so a retry never counts twice.

type Plan = { counts: { location_id: string; item_id: string; quantity: number }[]; unknown: string[]; problems: SheetProblem[]; columns: string[] };

export function LocationStockUpload({ locations }: { locations: StoreLocation[] }) {
  const id = useId();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [keys, setKeys] = useState<string[]>([]);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPlan(null);
    setError("");
    setDone(null);
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sheet = readSpreadsheet(bytes, detectFormat(bytes));
      const rows = [sheet.headers, ...sheet.rows.map((row) => row.cells.map((cell) => cell.v))];
      const read = readStockSheet(rows, locations);
      const index = await inventoryAction<{ items: CounterItem[] }>({ action: "counter_index" });
      if (!index.ok) {
        setError(index.message);
        return;
      }
      const bySku = new Map(index.data.items.map((item) => [item.merchant_sku.toUpperCase(), item.id]));
      const unknown = [...new Set(read.counts.filter((count) => !bySku.has(count.sku.toUpperCase())).map((count) => count.sku))];
      const counts = read.counts.flatMap((count) => {
        const itemId = bySku.get(count.sku.toUpperCase());
        return itemId ? [{ location_id: count.location_id, item_id: itemId, quantity: count.quantity }] : [];
      });
      setPlan({ counts, unknown, problems: read.problems, columns: read.columns });
      setKeys(countBatches(counts).map(() => newRequestKey("conteo-sede")));
    } catch (failure) {
      setError(failure instanceof ImportFileError ? failure.userMessage : "No pudimos leer el archivo. Sube el .xlsx o .csv que descargaste.");
    }
  }

  async function apply() {
    if (!plan) return;
    setBusy(true);
    setError("");
    let changed = 0;
    const batches = countBatches(plan.counts);
    for (const [index, batch] of batches.entries()) {
      const result = await inventoryAction<{ changed: number }>({ action: "location_counts", location_id: batch.location_id, counts: batch.counts, key: keys[index] });
      if (!result.ok) {
        setBusy(false);
        setError(`${result.message}${index ? ` Se aplicaron ${index} de ${batches.length} partes; vuelve a pulsar para seguir sin repetir las anteriores.` : ""}`);
        return;
      }
      changed += result.data.changed;
    }
    setBusy(false);
    setPlan(null);
    setDone(changed
      ? `Listo: actualizamos ${numbers.format(changed)} ${changed === 1 ? "conteo" : "conteos"}. Los totales de cada SKU ya incluyen el cambio.`
      : "Todo coincidía: no hubo cambios.");
  }

  const perLocation = plan ? locations.map((location) => ({ location, count: plan.counts.filter((count) => count.location_id === location.id).length })).filter((entry) => entry.count) : [];

  return (
    <section aria-labelledby={`${id}-titulo`} className="grid gap-4 rounded-panel border border-subtle bg-white p-4 md:p-5">
      <div className="grid gap-1">
        <h2 id={`${id}-titulo`} className="t-section text-ink">Stock por sede</h2>
        <p className="t-body text-ink-2 max-w-[68ch]">
          Descarga tu inventario: trae una columna {locations.map((location) => `“${stockColumn(location.name)}”`).join(", ")}. Escribe lo que contaste en cada sede y súbelo. Las celdas vacías no cambian nada.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button href="/api/store/inventory/export?format=xlsx" prefetch={false} variant="secondary" icon={<Download aria-hidden />}>Descargar Excel</Button>
        <Button href="/api/store/inventory/export?format=csv" prefetch={false} variant="quiet" icon={<Download aria-hidden />}>Descargar CSV</Button>
      </div>
      <Field id={`${id}-archivo`} label="Sube el archivo con tus conteos" hint=".xlsx o .csv, hasta 5 MB.">
        <FileInput accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFile} />
      </Field>
      {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      {done ? <Notice tone="success" role="status">{done}</Notice> : null}
      {plan ? (
        <div className="grid gap-3">
          {plan.counts.length ? (
            <p className="t-ui text-ink">
              {perLocation.map((entry) => `${numbers.format(entry.count)} SKU en ${entry.location.name}`).join(" · ")}
            </p>
          ) : (
            <p className="t-ui text-ink">No hay conteos para aplicar en este archivo.</p>
          )}
          {plan.unknown.length ? (
            <Notice tone="warning" role="note">
              {plan.unknown.length === 1 ? "Un SKU no está en tu inventario y se omitirá" : `${numbers.format(plan.unknown.length)} SKU no están en tu inventario y se omitirán`}: {plan.unknown.slice(0, 8).join(", ")}{plan.unknown.length > 8 ? "…" : ""}
            </Notice>
          ) : null}
          {plan.problems.length ? (
            <Notice tone="warning" role="note">
              <span className="block font-semibold">Revisa estas filas (no se aplicarán):</span>
              <ul className="mt-1 list-disc pl-5">
                {plan.problems.slice(0, 10).map((problem) => <li key={`${problem.row}-${problem.message}`}>Fila {problem.row}: {problem.message}</li>)}
              </ul>
            </Notice>
          ) : null}
          {plan.counts.length ? (
            <Button icon={<Upload aria-hidden />} loading={busy} loadingLabel="Aplicando…" onClick={apply} className="w-fit">Aplicar conteos</Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
