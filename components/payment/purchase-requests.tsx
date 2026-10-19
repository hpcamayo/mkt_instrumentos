"use client";

import { Copy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { undoMovements } from "@/components/inventory/stock-action-sheet";
import { UndoNotice, type InventoryNotice } from "@/components/inventory/undo-notice";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Price } from "@/components/ui/price";
import { Sheet } from "@/components/ui/sheet";
import { inventoryAction, newRequestKey, parseWholeNumber } from "@/lib/inventory-client";
import type { ReadyReply } from "@/lib/payment-methods";
import { formatDateTime, numbers } from "@/lib/store-inventory";

// Effortless Laria, inventory batch, stock-04 and stock-05: the store's purchase requests and its ready-made replies.
// A request is a "Solicitar compra" WhatsApp contact; Laria never sees the chat. The store marks what happened, and
// "Vendido" records the sale in Inventario (channel WhatsApp / Laria) in the same step.

export type PurchaseRequestRow = {
  id: string;
  created_at: string;
  signed_in: boolean;
  buyer_name: string | null;
  listing_id: string;
  listing_title: string;
  listing_slug: string;
  listing_price_pen: number | null;
  item: { id: string; merchant_sku: string; quantity_available: number; version: number; inventory_status: string } | null;
  status: "waiting" | "answered" | "sold" | "not_sold";
  quantity: number | null;
  marked_at: string | null;
};

const STATUS_LABELS: Record<PurchaseRequestRow["status"], string> = {
  waiting: "Por atender",
  answered: "Atendida",
  sold: "Vendida",
  not_sold: "No se vendió",
};

export function PurchaseRequestList({ requests, canWrite }: { requests: PurchaseRequestRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [notice, setNotice] = useState<InventoryNotice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selling, setSelling] = useState<PurchaseRequestRow | null>(null);

  async function mark(request: PurchaseRequestRow, status: "answered" | "not_sold" | null) {
    setBusy(request.id);
    setNotice(null);
    const result = await inventoryAction({ action: "request_mark", event_id: request.id, status });
    setBusy(null);
    if (!result.ok) return setNotice({ kind: "error", message: result.message });
    const previous = request.status === "waiting" ? null : (request.status as "answered" | "not_sold");
    setNotice({
      kind: "success",
      message: status === null ? "La solicitud volvió a Por atender." : `Marcada como ${STATUS_LABELS[status].toLowerCase()}.`,
      undo: { done: "Cambio deshecho.", run: () => inventoryAction({ action: "request_mark", event_id: request.id, status: previous }) },
    });
    router.refresh();
  }

  if (!requests.length) {
    return <p className="t-body text-ink-2">No hay solicitudes aquí. Cuando un comprador toque «Solicitar compra» en una de tus publicaciones, la verás en esta lista.</p>;
  }

  return (
    <div className="grid gap-3">
      {notice ? <UndoNotice notice={notice} onChange={setNotice} /> : null}
      <ul className="divide-y divide-subtle rounded-panel border border-subtle bg-white">
        {requests.map((request) => (
          <li key={request.id} className="grid gap-2 p-4 md:grid-cols-[1fr_auto] md:items-start md:gap-x-6">
            <div className="min-w-0">
              <p className="t-meta">{formatDateTime(request.created_at)} · <span className="font-semibold text-ink">{STATUS_LABELS[request.status]}</span>{request.status === "sold" && request.quantity ? ` (${numbers.format(request.quantity)} ${request.quantity === 1 ? "unidad" : "unidades"})` : ""}</p>
              <Link href={`/instrumentos/${request.listing_slug}`} className="link mt-1 block font-semibold">{request.listing_title}</Link>
              <p className="t-meta">
                {request.item ? `SKU ${request.item.merchant_sku} · Disponible ${numbers.format(request.item.quantity_available)}` : "Sin SKU en Inventario"}
                {request.listing_price_pen !== null ? <> · <Price value={request.listing_price_pen} size="inline" /></> : null}
              </p>
              <p className="t-meta">{request.signed_in ? `${request.buyer_name ?? "Comprador"} · con cuenta en Laria` : "Visitante sin cuenta"}</p>
            </div>
            {canWrite ? (
              <div className="flex flex-wrap gap-x-4 gap-y-2 md:justify-end">
                {request.status !== "sold" && request.item && request.item.inventory_status === "active" && request.item.quantity_available > 0 ? (
                  <Button size="sm" variant="secondary" aria-haspopup="dialog" onClick={() => setSelling(request)}>Vendido</Button>
                ) : null}
                {request.status === "waiting" ? (
                  <>
                    <button type="button" className="link font-semibold" disabled={busy === request.id} onClick={() => mark(request, "answered")}>Atendida</button>
                    <button type="button" className="link font-semibold" disabled={busy === request.id} onClick={() => mark(request, "not_sold")}>No se vendió</button>
                  </>
                ) : request.status !== "sold" ? (
                  <button type="button" className="link font-semibold" disabled={busy === request.id} onClick={() => mark(request, null)}>Volver a Por atender</button>
                ) : request.item ? (
                  <Link href={`/mi-cuenta/tienda/inventario/${request.item.id}`} className="link font-semibold">Ver en Inventario</Link>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {selling ? <SaleSheet request={selling} onClose={() => setSelling(null)} onDone={(next) => { setSelling(null); setNotice(next); router.refresh(); }} /> : null}
    </div>
  );
}

// Undoes the sale and puts the request back to "Por atender".
function undoSale(eventId: string, movementId: string) {
  const movement = undoMovements([movementId], "Venta deshecha. La solicitud volvió a Por atender.");
  return {
    done: movement.done,
    run: async () => {
      const result = await movement.run();
      return result.ok ? inventoryAction({ action: "request_mark", event_id: eventId, status: null }) : result;
    },
  };
}

function SaleSheet({ request, onClose, onDone }: { request: PurchaseRequestRow; onClose: () => void; onDone: (notice: InventoryNotice) => void }) {
  const [key] = useState(() => newRequestKey("solicitud"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const item = request.item!;
  const formId = `venta-${request.id}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = parseWholeNumber(new FormData(event.currentTarget).get("quantity"));
    if (quantity === null || quantity < 1) return setError("Ingresa una cantidad entera mayor que cero.");
    if (quantity > item.quantity_available) return setError(`Solo hay ${numbers.format(item.quantity_available)} disponibles. Si el stock real es distinto, registra un conteo en Inventario.`);
    setBusy(true);
    const result = await inventoryAction<{ movement_id: string; replayed: boolean }>({ action: "request_sale", event_id: request.id, quantity, key });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    onDone({
      kind: "success",
      message: `Venta registrada en ${item.merchant_sku}: ${numbers.format(quantity)} ${quantity === 1 ? "unidad" : "unidades"} por WhatsApp / Laria.`,
      undo: result.data.movement_id ? undoSale(request.id, result.data.movement_id) : undefined,
    });
  }

  return (
    <Sheet
      title="Registrar la venta"
      closeLabel="Cerrar sin guardar"
      onDismiss={onClose}
      layout="responsive"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form={formId} loading={busy} loadingLabel="Guardando…">Registrar venta</Button>
        </div>
      }
    >
      <form id={formId} className="grid gap-4 pt-4" onSubmit={submit} noValidate>
        <p className="t-body text-ink-2"><strong className="text-ink">{request.listing_title}</strong> · SKU {item.merchant_sku} · Disponible {numbers.format(item.quantity_available)}</p>
        <Field id={`${formId}-cantidad`} label="Unidades vendidas" error={error}>
          <Input name="quantity" defaultValue="1" inputMode="numeric" pattern="[0-9]*" autoComplete="off" />
        </Field>
        <Notice tone="info" role="note">Es una anotación de tu tienda: descuenta stock y marca la solicitud como vendida. Laria no cobra ni guarda montos.</Notice>
      </form>
    </Sheet>
  );
}

// stock-05: one copy button per reply. The suggested shortcut is what to type in WhatsApp Business > Respuestas rápidas.
export function ReadyReplies({ replies }: { replies: ReadyReply[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(reply: ReadyReply) {
    try {
      await navigator.clipboard.writeText(reply.text);
      setCopied(reply.shortcut);
    } catch {
      setCopied(null);
    }
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {replies.map((reply) => (
        <li key={reply.shortcut} className="grid gap-2 rounded-panel border border-subtle bg-white p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="t-ui font-semibold text-ink">{reply.title}</p>
            <span className="t-meta">Atajo sugerido: <span className="font-semibold text-ink">{reply.shortcut}</span></span>
          </div>
          <p className="whitespace-pre-line t-body text-ink">{reply.text}</p>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="secondary" icon={<Copy aria-hidden />} onClick={() => copy(reply)}>Copiar</Button>
            <span className="t-meta" role="status">{copied === reply.shortcut ? "Copiada" : ""}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

// The pickup hours the replies mention (store_inventory_preferences.pickup_hours).
export function PickupHoursForm({ hours }: { hours: string | null }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("hours") ?? "").trim();
    setBusy(true);
    setSaved(false);
    const result = await inventoryAction({ action: "preferences", fields: { pickup_hours: value || null } });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setError("");
    setSaved(true);
    router.refresh();
  }
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={submit} noValidate>
      <Field id="horario-recojo" label="Horario de recojo" optional hint="Aparece en las respuestas. Ej.: Lun a sáb, 10 a. m. a 7 p. m." error={error} className="min-w-0 flex-1 basis-64">
        <Input name="hours" defaultValue={hours ?? ""} maxLength={120} autoComplete="off" />
      </Field>
      <Button type="submit" variant="secondary" loading={busy} loadingLabel="Guardando…">Guardar horario</Button>
      <span className="t-meta" role="status">{saved ? "Horario guardado." : ""}</span>
    </form>
  );
}
