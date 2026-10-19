"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { undoMovements } from "@/components/inventory/stock-action-sheet";
import type { UndoAction } from "@/components/inventory/undo-notice";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Radio, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Price } from "@/components/ui/price";
import { Sheet } from "@/components/ui/sheet";
import { inventoryAction, newRequestKey, parseWholeNumber } from "@/lib/inventory-client";
import { categoryOptions } from "@/lib/listings";
import { CHANNEL_LABELS, SALE_CHANNELS, numbers } from "@/lib/store-inventory";

// Bulk bar actions (design §13.1). Every bulk change is one all-or-nothing database call with a batch key created when
// the sheet opens; each confirmation lists the SKU it affects. Effortless Laria, inventory batch: the target can be
// every SKU that matches the view (stock-14, up to 2000), so a sheet lists the SKU it knows (the page) and counts the
// rest; every result offers "Deshacer" (stock-03), and price changes are campaigns that can be reverted (stock-15).

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

// ids: every SKU the action applies to; items: the ones on screen, for the lists.
export type BulkTarget = { ids: string[]; items: BulkItem[] };

type SheetProps = { target: BulkTarget; onClose: () => void; onDone: (message: string, undo?: UndoAction) => void };

const LIST_LIMIT = 50;

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

function SkuList({ items, total, render }: { items: BulkItem[]; total?: number; render?: (item: BulkItem) => ReactNode }) {
  const shown = items.slice(0, LIST_LIMIT);
  const more = (total ?? items.length) - shown.length;
  return (
    <div className="grid gap-2">
      {shown.length ? (
        <ul className="divide-y divide-subtle rounded-control border border-subtle">
          {shown.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2 t-ui">
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{item.merchant_sku}</span>
                <span className="block truncate t-meta">{item.product_name}</span>
              </span>
              {render ? <span className="shrink-0 text-right">{render(item)}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {more > 0 ? <p className="t-meta">{shown.length ? "Y" : "Se aplica a"} {numbers.format(more)} SKU más de esta vista.</p> : null}
    </div>
  );
}

function countLabel(count: number) {
  return `${numbers.format(count)} SKU`;
}

// An undo is one more database call with its own idempotency key, created once with the result it undoes.
function keyedUndo(done: string, body: Record<string, unknown>, key = newRequestKey("deshacer")): UndoAction {
  return { done, run: () => inventoryAction({ ...body, key }) };
}

function undoBatch(batchKey: string, done: string): UndoAction {
  return keyedUndo(done, { action: "undo_batch", batch_key: batchKey });
}

// ------------------------------------------------------------------ price (stock-15)

type CampaignPreview = { rule: string; items: { id: string; merchant_sku: string; product_name: string; before: number | null; after: number | null; problem: string | null }[] };

const PROBLEMS: Record<string, string> = {
  missing_price: "Sin precio: asígnale uno antes de un ajuste relativo.",
  below_minimum: "El precio quedaría en cero o menos.",
  too_high: "El precio quedaría fuera de rango.",
};

export function revertCampaign(campaignId: string, done = "Volvieron los precios anteriores."): UndoAction {
  return { done, run: () => inventoryAction({ action: "campaign_revert", campaign_id: campaignId }) };
}

export function BulkPriceSheet({ target, onClose, onDone }: SheetProps) {
  const router = useRouter();
  const [batchKey] = useState(() => newRequestKey("precio"));
  const [mode, setMode] = useState<"set" | "add" | "percent">("percent");
  const [value, setValue] = useState("");
  const [rounding, setRounding] = useState(false);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const formId = "precio-masivo";
  const problems = preview?.items.filter((line) => line.problem) ?? [];

  function readValue() {
    const parsed = parseWholeNumber(value, { allowNegative: mode !== "set" });
    if (parsed === null || parsed === 0 || (mode === "set" && parsed < 1)) return null;
    return parsed;
  }

  function reset() {
    setPreview(null);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amount = readValue();
    if (amount === null) {
      setError(mode === "set" ? "Ingresa un precio en soles enteros, mayor que cero." : mode === "add" ? "Ingresa soles enteros distintos de cero; usa un signo menos para bajar." : "Ingresa un porcentaje entero entre −90 y 500, distinto de cero; por ejemplo −15.");
      return;
    }
    setError("");
    setBusy(true);
    const roundingValue = rounding ? "nine" : "none";
    if (!preview) {
      const result = await inventoryAction<CampaignPreview>({ action: "campaign_preview", item_ids: target.ids, mode, value: amount, rounding: roundingValue });
      setBusy(false);
      if (!result.ok) return setError(result.message);
      setPreview(result.data);
      return;
    }
    const result = await inventoryAction<{ campaign_id: string; name: string }>({
      action: "campaign_apply", key: batchKey, item_ids: target.ids, mode, value: amount, rounding: roundingValue, name: name.trim() || null,
    });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    onDone(`“${result.data.name}”: precio actualizado en ${countLabel(target.ids.length)}. Puedes volver a los precios anteriores desde Precios.`,
      revertCampaign(result.data.campaign_id));
    router.refresh();
  }

  const byId = new Map(target.items.map((item) => [item.id, item]));
  const previewItems: BulkItem[] = preview
    ? [...preview.items].sort((a, b) => Number(Boolean(b.problem)) - Number(Boolean(a.problem))).map((line) => byId.get(line.id) ?? {
      id: line.id, merchant_sku: line.merchant_sku, product_name: line.product_name, quantity_available: 0, quantity_on_hand: 0,
      unit_price_pen: line.before, low_stock_threshold: null, version: 0, listing_status: null,
    })
    : [];

  return (
    <BulkSheet title="Cambiar precios" formId={formId} busy={busy} submitLabel={preview ? `Aplicar a ${countLabel(target.ids.length)}` : "Revisar cambios"} onClose={onClose} disabled={problems.length > 0}>
      <form id={formId} className="grid gap-4 pt-4" onSubmit={submit} noValidate>
        <fieldset className="grid gap-0.5" disabled={Boolean(preview)}>
          <legend className="t-ui font-semibold text-ink">Cambio</legend>
          <Radio name="mode" value="percent" label="Subir o bajar un porcentaje" checked={mode === "percent"} onChange={() => { setMode("percent"); reset(); }} />
          <Radio name="mode" value="add" label="Sumar o restar soles" checked={mode === "add"} onChange={() => { setMode("add"); reset(); }} />
          <Radio name="mode" value="set" label="Precio fijo para todos" checked={mode === "set"} onChange={() => { setMode("set"); reset(); }} />
        </fieldset>
        <Field id={`${formId}-valor`} label={mode === "set" ? "Nuevo precio (S/)" : mode === "add" ? "Soles a sumar (negativo para restar)" : "Porcentaje (negativo para bajar)"} error={error}>
          <Input value={value} onChange={(event) => { setValue(event.target.value); reset(); }} inputMode="numeric" autoComplete="off" readOnly={Boolean(preview)} placeholder={mode === "percent" ? "−15" : undefined} />
        </Field>
        <Checkbox label="Redondear a precios terminados en 9 (S/ 269, S/ 1 499)" checked={rounding} disabled={Boolean(preview)} onChange={(event) => { setRounding(event.target.checked); reset(); }} />
        <Field id={`${formId}-nombre`} label="Nombre del cambio" optional hint="Para reconocerlo en Precios, por ejemplo “Cyber guitarras”.">
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="off" />
        </Field>
        {preview ? (
          <>
            <Notice tone={problems.length ? "danger" : "info"} role={problems.length ? "alert" : "note"}>
              {problems.length
                ? `${numbers.format(problems.length)} SKU no se pueden cambiar así. Quítalos de la selección o cambia el ajuste; el cambio se aplica a todos o a ninguno.`
                : `${preview.rule} Después podrás volver a los precios anteriores en un toque.`}
            </Notice>
            <SkuList
              items={previewItems}
              render={(item) => {
                const line = preview.items.find((entry) => entry.id === item.id);
                if (!line) return null;
                if (line.problem) return <span className="t-meta font-semibold text-danger">{PROBLEMS[line.problem] ?? "Revisa este SKU."}</span>;
                return <span className="t-ui"><Price value={line.before} size="inline" /> → <Price value={line.after} size="inline" /></span>;
              }}
            />
            <button type="button" className="link justify-self-start font-semibold" onClick={reset}>Cambiar el ajuste</button>
          </>
        ) : (
          <SkuList items={target.items} total={target.ids.length} render={(item) => <Price value={item.unit_price_pen} size="inline" />} />
        )}
      </form>
    </BulkSheet>
  );
}

// ------------------------------------------------------------------ low-stock threshold

export function BulkThresholdSheet({ target, onClose, onDone }: SheetProps) {
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
    const result = await inventoryAction({ action: "threshold_bulk", key: batchKey, item_ids: target.ids, threshold });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    onDone(threshold === null ? `Aviso de stock bajo quitado en ${countLabel(target.ids.length)}.` : `Umbral de stock bajo actualizado en ${countLabel(target.ids.length)}.`,
      undoBatch(batchKey, "Volvieron los avisos de stock bajo anteriores."));
    router.refresh();
  }

  return (
    <BulkSheet title="Umbral de stock bajo" formId={formId} busy={busy} submitLabel={`Aplicar a ${countLabel(target.ids.length)}`} onClose={onClose}>
      <form id={formId} className="grid gap-4 pt-4" onSubmit={submit} noValidate>
        <Field id={`${formId}-valor`} label="Avisar con stock bajo desde" hint="Un SKU se marca con Stock bajo cuando su stock disponible llega a este número. Vacío quita el aviso." error={error}>
          <Input name="threshold" inputMode="numeric" pattern="[0-9]*" autoComplete="off" />
        </Field>
        <SkuList items={target.items} total={target.ids.length} render={(item) => <span className="t-meta">Actual: {item.low_stock_threshold === null ? "sin aviso" : numbers.format(item.low_stock_threshold)}</span>} />
      </form>
    </BulkSheet>
  );
}

// ------------------------------------------------------------------ category (stock-20)

type BulkActionResult = { batch_key: string; changed: { id: string }[]; skipped: { id: string; merchant_sku: string; reason: string }[] };

export function BulkCategorySheet({ target, onClose, onDone }: SheetProps) {
  const router = useRouter();
  const [batchKey] = useState(() => newRequestKey("categoria"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const formId = "categoria-masiva";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const category = String(new FormData(event.currentTarget).get("category") ?? "");
    setBusy(true);
    const result = await inventoryAction<BulkActionResult>({ action: "bulk_action", bulk: "category", value: category || null, key: batchKey, item_ids: target.ids });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    const skipped = result.data.skipped.length;
    onDone(`Categoría actualizada en ${countLabel(result.data.changed.length)}.${skipped ? ` ${numbers.format(skipped)} SKU archivados no cambiaron.` : ""}`,
      result.data.changed.length ? undoBatch(batchKey, "Volvieron las categorías anteriores.") : undefined);
    router.refresh();
  }

  return (
    <BulkSheet title="Cambiar categoría" formId={formId} busy={busy} submitLabel={`Aplicar a ${countLabel(target.ids.length)}`} onClose={onClose}>
      <form id={formId} className="grid gap-4 pt-4" onSubmit={submit} noValidate>
        <Field id={`${formId}-valor`} label="Categoría del SKU" hint="Ordena tu inventario. Una publicación vinculada conserva su propia categoría." error={error}>
          <Select name="category" defaultValue="">
            <option value="">Sin categoría</option>
            {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </Field>
        <SkuList items={target.items} total={target.ids.length} />
      </form>
    </BulkSheet>
  );
}

// ------------------------------------------------------------------ archive, reactivate, publish again (stock-14)

const LIFECYCLE = {
  archive: {
    title: "Archivar SKU",
    submit: "Archivar",
    body: "Los SKU archivados salen de la lista y del Mostrador; su historial se conserva y puedes reactivarlos cuando quieras. Un SKU con una publicación publicada o en revisión no se archiva.",
    done: (count: number) => `${countLabel(count)} archivados.`,
    undone: "Los SKU volvieron a estar activos.",
  },
  unarchive: {
    title: "Reactivar SKU",
    submit: "Reactivar",
    body: "Los SKU vuelven a la lista de inventario con el stock que tenían.",
    done: (count: number) => `${countLabel(count)} reactivados.`,
    undone: "Los SKU volvieron a archivarse.",
  },
  restore: {
    title: "Volver a publicar",
    submit: "Volver a publicar",
    body: "Las publicaciones que tu tienda ocultó vuelven a verse en el marketplace. Las que ocultó Administración o que ya no cumplen los requisitos siguen ocultas.",
    done: (count: number) => `${numbers.format(count)} publicaciones visibles de nuevo.`,
    undone: "Las publicaciones volvieron a ocultarse.",
  },
} as const;

const SKIP_REASONS: Record<string, string> = {
  listing_public: "tienen una publicación publicada o en revisión",
  not_linked: "no tienen publicación",
  not_hidden_by_store: "no tienen una publicación oculta por tu tienda",
  requirements: "tienen una publicación que ya no cumple los requisitos",
  archived: "están archivados",
};

function skippedSummary(skipped: BulkActionResult["skipped"]) {
  const groups = new Map<string, number>();
  for (const entry of skipped) groups.set(entry.reason, (groups.get(entry.reason) ?? 0) + 1);
  return [...groups].map(([reason, count]) => `${numbers.format(count)} ${SKIP_REASONS[reason] ?? "no aplican"}`).join("; ");
}

export function BulkLifecycleSheet({ target, action, onClose, onDone }: SheetProps & { action: keyof typeof LIFECYCLE }) {
  const router = useRouter();
  const copy = LIFECYCLE[action];
  const [batchKey] = useState(() => newRequestKey(action));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const formId = `ciclo-${action}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await inventoryAction<BulkActionResult>({ action: "bulk_action", bulk: action, key: batchKey, item_ids: target.ids });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    const changed = result.data.changed.map((entry) => entry.id);
    const skipped = result.data.skipped.length ? ` No cambiaron ${skippedSummary(result.data.skipped)}.` : "";
    let undo: UndoAction | undefined;
    if (changed.length && action === "restore") {
      undo = keyedUndo(copy.undone, { action: "hide_bulk", item_ids: changed });
    } else if (changed.length) {
      undo = undoBatch(batchKey, copy.undone);
    }
    onDone(`${copy.done(changed.length)}${skipped}`, undo);
    router.refresh();
  }

  return (
    <BulkSheet title={copy.title} formId={formId} busy={busy} submitLabel={`${copy.submit} ${countLabel(target.ids.length)}`} onClose={onClose}>
      <form id={formId} className="grid gap-4 pt-4" onSubmit={submit} noValidate>
        <p className="t-body text-ink-2">{copy.body}</p>
        <SkuList items={target.items} total={target.ids.length} />
        {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
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

// Per-SKU quantities, so only the SKU on screen (a whole view is too many to type).
export function BulkStockSheet({ target, onClose, onDone }: SheetProps) {
  const router = useRouter();
  const items = target.items;
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
    const result = await inventoryAction<{ movements: { id: string; on_hand_delta: number }[] }>({ action: "bulk_stock", key: batchKey, operations });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    const undoable = result.data.movements.filter((movement) => movement.on_hand_delta !== 0).map((movement) => movement.id);
    onDone(`Stock actualizado en ${countLabel(operations.length)}.`, undoable.length ? undoMovements(undoable, "Movimientos deshechos.") : undefined);
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

export function BulkHideSheet({ target, onClose, onDone }: SheetProps) {
  const router = useRouter();
  const [batchKey] = useState(() => newRequestKey("ocultar"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const formId = "ocultar-masivo";
  const whole = target.ids.length > target.items.length;
  const hideable = target.items.filter((item) => item.listing_status === "approved");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await inventoryAction<HideResult>({ action: "hide_bulk", key: batchKey, item_ids: target.ids });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    const hidden = result.data.hidden.map((entry) => entry.id);
    const skipped = result.data.skipped.length;
    onDone(`${numbers.format(hidden.length)} publicaciones ocultas.${skipped ? ` ${numbers.format(skipped)} SKU no tenían una publicación publicada y no cambiaron.` : ""}`,
      hidden.length ? keyedUndo("Las publicaciones volvieron a verse.", { action: "bulk_action", bulk: "restore", item_ids: hidden }) : undefined);
    router.refresh();
  }

  return (
    <BulkSheet title="Ocultar publicaciones" formId={formId} busy={busy} submitLabel={whole ? `Ocultar las de ${countLabel(target.ids.length)}` : `Ocultar ${numbers.format(hideable.length)}`} onClose={onClose} disabled={!whole && !hideable.length}>
      <form id={formId} className="grid gap-4 pt-4" onSubmit={submit} noValidate>
        <p className="t-body text-ink-2">Las publicaciones dejan de verse en el marketplace. El stock no cambia y puedes volver a publicarlas cuando quieras.</p>
        {whole ? (
          <SkuList items={hideable} total={target.ids.length} />
        ) : hideable.length ? <SkuList items={hideable} /> : null}
        {!whole && hideable.length < target.items.length ? (
          <Notice tone="info" role="note">{numbers.format(target.items.length - hideable.length)} SKU no tienen una publicación publicada y no cambiarán.</Notice>
        ) : null}
        {whole ? <Notice tone="info" role="note">Solo cambian los SKU con una publicación publicada; los demás se omiten.</Notice> : null}
        {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      </form>
    </BulkSheet>
  );
}
