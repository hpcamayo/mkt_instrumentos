"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Radio, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import type { UndoAction } from "@/components/inventory/undo-notice";
import { inventoryAction, newRequestKey, parseWholeNumber } from "@/lib/inventory-client";
import { CHANNEL_LABELS, SALE_CHANNELS, numbers } from "@/lib/store-inventory";

// One sheet for every stock movement a store records by hand (design §13.3). The idempotency key is created when the
// sheet opens, so a double tap or a retry after a lost response applies the movement once.

export type StockActionType = "sale" | "restock" | "return" | "damage_or_loss" | "stock_count";

export type StockActionItem = {
  id: string;
  merchant_sku: string;
  product_name: string;
  quantity_available: number;
  quantity_on_hand: number;
  version: number;
};

const TYPES: { value: StockActionType; label: string; quantityLabel: string }[] = [
  { value: "sale", label: "Registrar venta", quantityLabel: "Unidades vendidas" },
  { value: "restock", label: "Reponer stock", quantityLabel: "Unidades que ingresan" },
  { value: "return", label: "Devolución", quantityLabel: "Unidades devueltas" },
  { value: "damage_or_loss", label: "Daño o pérdida", quantityLabel: "Unidades afectadas" },
  { value: "stock_count", label: "Conteo", quantityLabel: "Unidades contadas en tienda" },
];

// stock-03: "Deshacer" for movements just recorded; one key per undo, so a double tap undoes once.
export function undoMovements(movementIds: string[], done: string): UndoAction {
  const key = newRequestKey("deshacer");
  return { done, run: () => inventoryAction({ action: "undo_movements", movement_ids: movementIds, key }) };
}

export function stockActionLabel(type: StockActionType) {
  return TYPES.find((entry) => entry.value === type)?.label ?? "Ajustar stock";
}

export function StockActionSheet({
  item,
  initialType,
  onClose,
  onDone,
}: {
  item: StockActionItem;
  initialType: StockActionType;
  onClose: () => void;
  onDone: (message: string, undo?: UndoAction) => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<StockActionType>(initialType);
  const [requestKey] = useState(() => newRequestKey("mov"));
  const [busy, setBusy] = useState(false);
  const [quantityError, setQuantityError] = useState("");
  const [failure, setFailure] = useState<{ message: string; stale: boolean } | null>(null);
  const current = TYPES.find((entry) => entry.value === type) ?? TYPES[0];
  const needsChannel = type === "sale" || type === "return";
  const formId = `movimiento-${item.id}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const quantity = parseWholeNumber(form.get("quantity"));
    setFailure(null);
    if (quantity === null || (type !== "stock_count" && quantity < 1)) {
      setQuantityError(type === "stock_count" ? "Ingresa las unidades contadas, desde 0." : "Ingresa una cantidad entera mayor que cero.");
      return;
    }
    if ((type === "sale" || type === "damage_or_loss") && quantity > item.quantity_available) {
      setQuantityError(`Solo hay ${numbers.format(item.quantity_available)} disponibles. Si el stock real es distinto, registra un conteo.`);
      return;
    }
    setQuantityError("");
    setBusy(true);
    const result = await inventoryAction<{ item: { quantity_available: number }; movement: { id: string } }>({
      action: "movement",
      key: requestKey,
      item_id: item.id,
      type,
      quantity,
      channel: needsChannel ? String(form.get("channel") ?? "") : null,
      reference: String(form.get("reference") ?? "").trim() || null,
      reason: String(form.get("reason") ?? "").trim() || null,
      // A count states an absolute quantity, so it carries the version the merchant saw; relative movements do not.
      expected_version: type === "stock_count" ? item.version : null,
    });
    setBusy(false);
    if (!result.ok) {
      setFailure({ message: result.message, stale: result.code === "INVENTORY_VERSION_CONFLICT" || result.code === "IDEMPOTENCY_KEY_REUSED" });
      return;
    }
    onDone(`Movimiento guardado. ${item.merchant_sku} tiene ahora ${numbers.format(result.data.item.quantity_available)} disponibles.`,
      undoMovements([result.data.movement.id], `Movimiento deshecho en ${item.merchant_sku}.`));
    router.refresh();
  }

  return (
    <Sheet
      title={current.label}
      closeLabel="Cerrar sin guardar"
      onDismiss={onClose}
      layout="responsive"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form={formId} loading={busy} loadingLabel="Guardando…">Guardar</Button>
        </div>
      }
    >
      <form id={formId} className="grid gap-4 pt-4" onSubmit={submit} noValidate>
        <div>
          <p className="t-ui font-semibold text-ink">{item.product_name}</p>
          <p className="t-meta">SKU {item.merchant_sku} · Disponible {numbers.format(item.quantity_available)} · En tienda {numbers.format(item.quantity_on_hand)}</p>
        </div>
        <fieldset className="grid gap-0.5">
          <legend className="t-ui font-semibold text-ink">Movimiento</legend>
          {TYPES.map((entry) => (
            <Radio key={entry.value} name="type" value={entry.value} label={entry.label} checked={type === entry.value} onChange={() => { setType(entry.value); setQuantityError(""); setFailure(null); }} />
          ))}
        </fieldset>
        {type === "sale" ? (
          <Notice tone="info" role="note">Es una anotación de tu tienda: descuenta stock, pero no crea una venta verificada en Laria ni habilita reseñas.</Notice>
        ) : null}
        {type === "stock_count" ? (
          <Notice tone="info" role="note">Registra el total que contaste. Viste {numbers.format(item.quantity_on_hand)} en tienda; si el stock cambia antes de guardar, te pediremos volver a cargarlo para no borrar una venta.</Notice>
        ) : null}
        <Field id={`${formId}-cantidad`} label={current.quantityLabel} error={quantityError}>
          <Input name="quantity" inputMode="numeric" pattern="[0-9]*" autoComplete="off" required />
        </Field>
        {needsChannel ? (
          <Field id={`${formId}-canal`} label={type === "sale" ? "¿Dónde se vendió?" : "¿Dónde se recibió la devolución?"}>
            <Select name="channel" defaultValue="tienda_fisica">
              {SALE_CHANNELS.map((channel) => <option key={channel} value={channel}>{CHANNEL_LABELS[channel]}</option>)}
            </Select>
          </Field>
        ) : null}
        {type === "sale" || type === "restock" || type === "return" ? (
          <Field id={`${formId}-referencia`} label="Referencia" optional hint="Boleta, guía o nota interna. Hasta 120 caracteres.">
            <Input name="reference" maxLength={120} autoComplete="off" />
          </Field>
        ) : (
          <Field id={`${formId}-motivo`} label="Motivo" optional hint="Hasta 280 caracteres.">
            <Input name="reason" maxLength={280} autoComplete="off" />
          </Field>
        )}
        {failure ? (
          <Notice tone="danger" role="alert">
            {failure.message}
            {failure.stale ? (
              <>
                {" "}
                <button type="button" className="link font-semibold" onClick={() => { router.refresh(); onClose(); }}>Volver a cargar el stock</button>
              </>
            ) : null}
          </Notice>
        ) : null}
      </form>
    </Sheet>
  );
}
