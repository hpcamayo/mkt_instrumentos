"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Radio, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Price } from "@/components/ui/price";
import { Sheet } from "@/components/ui/sheet";
import { inventoryAction, newRequestKey, parseWholeNumber } from "@/lib/inventory-client";
import { CHANNEL_LABELS, SALE_CHANNELS, numbers } from "@/lib/store-inventory";

// Bulk bar actions (design §13.1). Every bulk change is one all-or-nothing database call with a batch key created when
// the sheet opens; each confirmation lists the SKU it affects.

export type BulkItem = {
  id: string;
  merchant_sku: string;
  product_name: string;
  quantity_available: number;
  quantity_on_hand: number;
  unit_price_pen: number | null;
  low_stock_threshold: number | null;
  version: number;
  listing_status: string | null;
};

type SheetProps = { items: BulkItem[]; onClose: () => void; onDone: (message: string) => void };

function BulkSheet({ title, formId, busy, submitLabel, onClose, children, disabled = false }: { title: string; formId: string; busy: boolean; submitLabel: string; onClose: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <Sheet
      title={title}
      closeLabel="Cerrar sin guardar"
      onDismiss={onClose}
      layout="responsive"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form={formId} loading={busy} loadingLabel="Guardando…" disabled={disabled}>{submitLabel}</Button>
        </div>
      }
    >
      {children}
    </Sheet>
  );
}

function SkuList({ items, render }: { items: BulkItem[]; render?: (item: BulkItem) => ReactNode }) {
  return (
    <ul className="divide-y divide-subtle rounded-control border border-subtle">
      {items.map((item) => (
        <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2 t-ui">
          <span className="min-w-0">
            <span className="block font-semibold text-ink">{item.merchant_sku}</span>
            <span className="block truncate t-meta">{item.product_name}</span>
          </span>
          {render ? <span className="shrink-0 text-right">{render(item)}</span> : null}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ price

type PricePreview = { rule: string; items: { id: string; merchant_sku: string; product_name: string; before: number | null; after: number | null; problem: string | null }[] };

const PROBLEMS: Record<string, string> = {
  missing_price: "Sin precio: asígnale uno antes de un ajuste relativo.",
  below_minimum: "El precio quedaría en cero o menos.",
  too_high: "El precio quedaría fuera de rango.",
};

export function BulkPriceSheet({ items, onClose, onDone }: SheetProps) {
  const router = useRouter();
  const [batchKey] = useState(() => newRequestKey("precio"));
  const [mode, setMode] = useState<"set" | "add" | "percent">("set");
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState<PricePreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const formId = "precio-masivo";
  const hasProblems = preview?.items.some((line) => line.problem) ?? false;

  function readValue() {
    const parsed = parseWholeNumber(value, { allowNegative: mode !== "set" });
    if (parsed === null || parsed === 0 || (mode === "set" && parsed < 1)) return null;
    return parsed;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amount = readValue();
    if (amount === null) {
      setError(mode === "set" ? "Ingresa un precio en soles enteros, mayor que cero." : mode === "add" ? "Ingresa soles enteros distintos de cero; usa un signo menos para bajar." : "Ingresa un porcentaje entero entre −90 y 500, distinto de cero.");
      return;
    }
    setError("");
    setBusy(true);
    const ids = items.map((item) => item.id);
    if (!preview) {
      const result = await inventoryAction<PricePreview>({ action: "price_preview", item_ids: ids, mode, value: amount });
      setBusy(false);
      if (!result.ok) return setError(result.message);
      setPreview(result.data);
      return;
    }
    const result = await inventoryAction({ action: "price_bulk", key: batchKey, item_ids: ids, mode, value: amount });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    onDone(`Precio actualizado en ${numbers.format(items.length)} SKU.`);
    router.refresh();
  }

  return (
    <BulkSheet title="Ajustar precio" formId={formId} busy={busy} submitLabel={preview ? `Aplicar a ${numbers.format(items.length)} SKU` : "Revisar cambios"} onClose={onClose}>
      <form id={formId} className="grid gap-4 pt-4" onSubmit={submit} noValidate>
        <fieldset className="grid gap-0.5" disabled={Boolean(preview)}>
          <legend className="t-ui font-semibold text-ink">Cambio</legend>
          <Radio name="mode" value="set" label="Precio fijo para todos" checked={mode === "set"} onChange={() => setMode("set")} />
          <Radio name="mode" value="add" label="Sumar o restar soles" checked={mode === "add"} onChange={() => setMode("add")} />
          <Radio name="mode" value="percent" label="Subir o bajar un porcentaje" checked={mode === "percent"} onChange={() => setMode("percent")} />
        </fieldset>
        <Field id={`${formId}-valor`} label={mode === "set" ? "Nuevo precio (S/)" : mode === "add" ? "Soles a sumar (negativo para restar)" : "Porcentaje (negativo para bajar)"} error={error}>
          <Input value={value} onChange={(event) => { setValue(event.target.value); setPreview(null); }} inputMode="numeric" autoComplete="off" readOnly={Boolean(preview)} />
        </Field>
        {preview ? (
          <>
            <Notice tone={hasProblems ? "danger" : "info"} role={hasProblems ? "alert" : "note"}>
              {hasProblems ? "Corrige los SKU marcados o quítalos de la selección; el cambio se aplica a todos o a ninguno." : preview.rule}
            </Notice>
            <SkuList
              items={items}
              render={(item) => {
                const line = preview.items.find((entry) => entry.id === item.id);
                if (!line) return null;
                if (line.problem) return <span className="t-meta font-semibold text-danger">{PROBLEMS[line.problem] ?? "Revisa este SKU."}</span>;
                return <span className="t-ui"><Price value={line.before} size="inline" /> → <Price value={line.after} size="inline" /></span>;
              }}
            />
            <button type="button" className="link justify-self-start font-semibold" onClick={() => setPreview(null)}>Cambiar el ajuste</button>
          </>
        ) : (
          <SkuList items={items} render={(item) => <Price value={item.unit_price_pen} size="inline" />} />
        )}
      </form>
    </BulkSheet>
  );
}

// ------------------------------------------------------------------ low-stock threshold

export function BulkThresholdSheet({ items, onClose, onDone }: SheetProps) {
  const router = useRouter();
  const [batchKey] = useState(() => newRequestKey("umbral"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const formId = "umbral-masivo";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = String(new FormData(event.currentTarget).get("threshold") ?? "").trim();
    const threshold = raw === "" ? null : parseWholeNumber(raw);
    if (raw !== "" && (threshold === null || threshold > 100000)) return setError("Ingresa un número entero de 0 a 100000, o déjalo vacío para quitar el aviso.");
    setError("");
    setBusy(true);
    const result = await inventoryAction({ action: "threshold_bulk", key: batchKey, item_ids: items.map((item) => item.id), threshold });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    onDone(threshold === null ? `Aviso de stock bajo quitado en ${numbers.format(items.length)} SKU.` : `Umbral de stock bajo actualizado en ${numbers.format(items.length)} SKU.`);
    router.refresh();
  }

  return (
    <BulkSheet title="Umbral de stock bajo" formId={formId} busy={busy} submitLabel={`Aplicar a ${numbers.format(items.length)} SKU`} onClose={onClose}>
      <form id={formId} className="grid gap-4 pt-4" onSubmit={submit} noValidate>
        <Field id={`${formId}-valor`} label="Avisar con stock bajo desde" hint="Un SKU se marca con Stock bajo cuando su stock disponible llega a este número. Vacío quita el aviso." error={error}>
          <Input name="threshold" inputMode="numeric" pattern="[0-9]*" autoComplete="off" />
        </Field>
        <SkuList items={items} render={(item) => <span className="t-meta">Actual: {item.low_stock_threshold === null ? "sin aviso" : numbers.format(item.low_stock_threshold)}</span>} />
      </form>
    </BulkSheet>
  );
}

// ------------------------------------------------------------------ stock

const BULK_TYPES = [
  { value: "restock", label: "Reponer stock", hint: "Unidades que ingresan por SKU" },
  { value: "sale", label: "Registrar venta", hint: "Unidades vendidas por SKU" },
  { value: "damage_or_loss", label: "Daño o pérdida", hint: "Unidades afectadas por SKU" },
  { value: "stock_count", label: "Conteo", hint: "Unidades contadas por SKU" },
] as const;

type BulkType = (typeof BULK_TYPES)[number]["value"];

export function BulkStockSheet({ items, onClose, onDone }: SheetProps) {
  const router = useRouter();
  const [batchKey] = useState(() => newRequestKey("stock"));
  const [type, setType] = useState<BulkType>("restock");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const formId = "stock-masivo";
  const current = BULK_TYPES.find((entry) => entry.value === type)!;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const operations: Record<string, unknown>[] = [];
    const wrong: string[] = [];
    for (const item of items) {
      const raw = String(form.get(`q-${item.id}`) ?? "").trim();
      if (raw === "") continue;
      const quantity = parseWholeNumber(raw);
      if (quantity === null || (type !== "stock_count" && quantity < 1) || ((type === "sale" || type === "damage_or_loss") && quantity > item.quantity_available)) {
        wrong.push(item.merchant_sku);
        continue;
      }
      operations.push({
        item_id: item.id,
        type,
        quantity,
        channel: type === "sale" ? String(form.get("channel") ?? "tienda_fisica") : undefined,
        reason: String(form.get("reason") ?? "").trim() || undefined,
        expected_version: type === "stock_count" ? item.version : undefined,
      });
    }
    if (wrong.length) return setError(`Revisa la cantidad de: ${wrong.join(", ")}.`);
    if (!operations.length) return setError("Ingresa la cantidad de al menos un SKU. Los SKU sin cantidad no cambian.");
    setError("");
    setBusy(true);
    const result = await inventoryAction({ action: "bulk_stock", key: batchKey, operations });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    onDone(`Stock actualizado en ${numbers.format(operations.length)} SKU.`);
    router.refresh();
  }

  return (
    <BulkSheet title="Ajustar stock" formId={formId} busy={busy} submitLabel="Guardar movimientos" onClose={onClose}>
      <form id={formId} className="grid gap-4 pt-4" onSubmit={submit} noValidate>
        <fieldset className="grid gap-0.5">
          <legend className="t-ui font-semibold text-ink">Movimiento</legend>
          {BULK_TYPES.map((entry) => <Radio key={entry.value} name="type" value={entry.value} label={entry.label} checked={type === entry.value} onChange={() => setType(entry.value)} />)}
        </fieldset>
        {type === "sale" ? (
          <>
            <Notice tone="info" role="note">Es una anotación de tu tienda: descuenta stock, pero no crea ventas verificadas en Laria.</Notice>
            <Field id={`${formId}-canal`} label="¿Dónde se vendió?">
              <Select name="channel" defaultValue="tienda_fisica">{SALE_CHANNELS.map((channel) => <option key={channel} value={channel}>{CHANNEL_LABELS[channel]}</option>)}</Select>
            </Field>
          </>
        ) : null}
        {type === "stock_count" ? <Notice tone="info" role="note">Registra el total contado de cada SKU. Si alguno cambió desde que cargaste la página, no se guarda ninguno y te pediremos volver a cargar.</Notice> : null}
        <Field id={`${formId}-motivo`} label="Motivo" optional hint="Se guarda en el historial de cada SKU.">
          <Input name="reason" maxLength={280} autoComplete="off" />
        </Field>
        <fieldset className="grid gap-2">
          <legend className="t-ui font-semibold text-ink">{current.hint}</legend>
          <ul className="divide-y divide-subtle rounded-control border border-subtle">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <label htmlFor={`${formId}-${item.id}`} className="min-w-0 t-ui">
                  <span className="block font-semibold text-ink">{item.merchant_sku}</span>
                  <span className="block t-meta">Disponible {numbers.format(item.quantity_available)} · En tienda {numbers.format(item.quantity_on_hand)}</span>
                </label>
                <Input id={`${formId}-${item.id}`} name={`q-${item.id}`} inputMode="numeric" pattern="[0-9]*" autoComplete="off" className="w-24 shrink-0" />
              </li>
            ))}
          </ul>
        </fieldset>
        {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      </form>
    </BulkSheet>
  );
}

// ------------------------------------------------------------------ hide

type HideResult = { hidden: { id: string }[]; skipped: { id: string; merchant_sku: string; reason: string }[] };

export function BulkHideSheet({ items, onClose, onDone }: SheetProps) {
  const router = useRouter();
  const [batchKey] = useState(() => newRequestKey("ocultar"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const formId = "ocultar-masivo";
  const hideable = items.filter((item) => item.listing_status === "approved");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await inventoryAction<HideResult>({ action: "hide_bulk", key: batchKey, item_ids: items.map((item) => item.id) });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    const skipped = result.data.skipped.length;
    onDone(`${numbers.format(result.data.hidden.length)} publicaciones ocultas.${skipped ? ` ${numbers.format(skipped)} SKU no tenían una publicación publicada y no cambiaron.` : ""}`);
    router.refresh();
  }

  return (
    <BulkSheet title="Ocultar publicaciones" formId={formId} busy={busy} submitLabel={`Ocultar ${numbers.format(hideable.length)}`} onClose={onClose} disabled={!hideable.length}>
      <form id={formId} className="grid gap-4 pt-4" onSubmit={submit} noValidate>
        <p className="t-body text-ink-2">Las publicaciones dejan de verse en el marketplace. El stock no cambia y puedes restaurarlas desde Publicaciones.</p>
        {hideable.length ? <SkuList items={hideable} /> : null}
        {hideable.length < items.length ? (
          <Notice tone="info" role="note">{numbers.format(items.length - hideable.length)} SKU no tienen una publicación publicada y no cambiarán.</Notice>
        ) : null}
        {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      </form>
    </BulkSheet>
  );
}
