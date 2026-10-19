"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { undoMovements } from "@/components/inventory/stock-action-sheet";
import { UndoNotice, type InventoryNotice } from "@/components/inventory/undo-notice";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Field, FileInput } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { inventoryAction, newRequestKey } from "@/lib/inventory-client";
import type { ReorderProblem } from "@/lib/inventory-reorder";
import { numbers, type ReorderRow } from "@/lib/store-inventory";

// Effortless Laria, inventory batch, stock-07: upload the filled reorder file, check what it adds, then add every line
// as one all-or-nothing "Reposición" batch (apply_bulk_stock_operations) that can be undone for 10 seconds.

type PreviewLine = { row: number; sku: string; quantity: number; item_id: string; product_name: string; quantity_available: number };
type Preview = { lines: PreviewLine[]; problems: ReorderProblem[]; warnings: string[] };

const SHOWN = 50;

export function ReorderUpload() {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => newRequestKey("reposicion"));
  const [notice, setNotice] = useState<InventoryNotice | null>(null);

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get("file");
    if (!(file instanceof File) || !file.size) return setError("Elige el archivo de reposición que llenaste.");
    setError("");
    setNotice(null);
    setBusy(true);
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/store/inventory/reorder", { method: "POST", body }).catch(() => null);
    const data = response ? await response.json().catch(() => null) : null;
    setBusy(false);
    if (!response || !response.ok || !data?.ok) return setError(data?.message ?? "No pudimos revisar el archivo. Revisa tu conexión e intenta de nuevo.");
    setPreview({ lines: data.lines, problems: data.problems, warnings: data.warnings ?? [] });
    setKey(newRequestKey("reposicion"));
  }

  async function apply() {
    if (!preview?.lines.length) return;
    setBusy(true);
    const operations = preview.lines.map((line) => ({ item_id: line.item_id, type: "restock", quantity: line.quantity, reference: "Reposición" }));
    const result = await inventoryAction<{ movements: { id: string }[] }>({ action: "bulk_stock", key, operations });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    const units = preview.lines.reduce((sum, line) => sum + line.quantity, 0);
    setNotice({
      kind: "success",
      message: `Reposición registrada: ${numbers.format(units)} ${units === 1 ? "unidad" : "unidades"} en ${numbers.format(preview.lines.length)} SKU.`,
      undo: undoMovements(result.data.movements.map((movement) => movement.id), "Reposición deshecha."),
    });
    setPreview(null);
    router.refresh();
  }

  const units = preview?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0;

  return (
    <div className="grid gap-4">
      {notice ? <UndoNotice notice={notice} onChange={setNotice} /> : null}
      <form className="flex flex-wrap items-end gap-3" onSubmit={check} noValidate>
        <Field id="reposicion-archivo" label="Archivo de reposición lleno" hint="El mismo Excel o CSV que descargaste, con la columna “Cantidad recibida”." error={error} className="min-w-0 flex-1 basis-72">
          <FileInput name="file" accept=".xlsx,.csv" onChange={() => { setPreview(null); setError(""); }} />
        </Field>
        <Button type="submit" variant="secondary" loading={busy && !preview} loadingLabel="Revisando…">Revisar archivo</Button>
      </form>

      {preview ? (
        <div className="grid gap-3" aria-live="polite">
          {preview.warnings.map((warning) => <Notice key={warning} tone="warning" role="note">{warning}</Notice>)}
          {preview.problems.length ? (
            <Notice tone="warning" role="note" title={`${numbers.format(preview.problems.length)} ${preview.problems.length === 1 ? "fila no se sumará" : "filas no se sumarán"}`}>
              <ul className="mt-1 grid gap-1">
                {preview.problems.slice(0, SHOWN).map((problem) => <li key={`${problem.row}-${problem.sku}`}>Fila {problem.row}{problem.sku ? ` (${problem.sku})` : ""}: {problem.message}</li>)}
              </ul>
            </Notice>
          ) : null}
          {preview.lines.length ? (
            <>
              <ul className="divide-y divide-subtle rounded-panel border border-subtle bg-white">
                {preview.lines.slice(0, SHOWN).map((line) => (
                  <li key={line.item_id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <span className="min-w-0"><span className="font-semibold text-ink">{line.sku}</span> <span className="t-meta">{line.product_name}</span></span>
                    <span className="t-ui tabular-nums text-ink">+{numbers.format(line.quantity)} <span className="t-meta">(queda en {numbers.format(line.quantity_available + line.quantity)})</span></span>
                  </li>
                ))}
              </ul>
              {preview.lines.length > SHOWN ? <p className="t-meta">Y {numbers.format(preview.lines.length - SHOWN)} SKU más.</p> : null}
              <div className="flex flex-wrap gap-3">
                <Button onClick={apply} loading={busy} loadingLabel="Guardando…">Sumar {numbers.format(units)} {units === 1 ? "unidad" : "unidades"} a {numbers.format(preview.lines.length)} SKU</Button>
                <Button variant="secondary" onClick={() => setPreview(null)}>Cancelar</Button>
              </div>
            </>
          ) : (
            <p className="t-body text-ink-2">El archivo no tiene cantidades recibidas para sumar. Escribe cuántas unidades llegaron en “Cantidad recibida”.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

// The suggestions on screen; the downloaded file has the same columns plus "Cantidad recibida".
export function ReorderTable({ rows }: { rows: ReorderRow[] }) {
  const columns: DataTableColumn<ReorderRow>[] = [
    {
      key: "sku",
      header: "SKU",
      primary: true,
      cell: (row) => (
        <Link href={`/mi-cuenta/tienda/inventario/${row.id}`} className="link font-semibold">
          {row.merchant_sku}
          <span className="block t-meta font-normal">{row.product_name}{row.variant_label ? ` · ${row.variant_label}` : ""}</span>
        </Link>
      ),
    },
    { key: "available", header: "Disponible", label: "Disponible", cell: (row) => numbers.format(row.quantity_available), className: "tabular-nums" },
    { key: "threshold", header: "Aviso de stock bajo", label: "Aviso", cell: (row) => (row.low_stock_threshold === null ? "Sin aviso" : numbers.format(row.low_stock_threshold)), className: "tabular-nums" },
    { key: "sales", header: "Ventas 30 días", label: "Ventas 30 días", cell: (row) => numbers.format(row.sales_30d), className: "tabular-nums" },
    { key: "suggested", header: "Cantidad sugerida", label: "Sugerida", cell: (row) => <span className="font-semibold text-ink">{numbers.format(row.suggested)}</span>, className: "tabular-nums" },
  ];
  return <DataTable caption="SKU por reponer" columns={columns} rows={rows} rowKey={(row) => row.id} />;
}
