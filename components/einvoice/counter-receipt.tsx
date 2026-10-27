"use client";

import { ExternalLink, FileText, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Radio, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Tag } from "@/components/ui/tag";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { receiptAction } from "@/lib/einvoice/client";
import {
  BOLETA_ID_THRESHOLD_CENTS, DOC_TYPE_LABELS, KIND_LABELS, canRetry, receiptCode, receiptStatus, receiptWhatsAppHref,
  type CustomerDocType, type ReceiptKind, type ReceiptRecord, type ReceiptRequest,
} from "@/lib/einvoice/nubefact";
import type { CartLine } from "@/lib/inventory-counter";

// run-03 at Mostrador: choose "Boleta" or "Factura", add the customer, and "Registrar venta" also issues the
// comprobante through the store's own Nubefact account. Nothing is chosen for the owner: "Sin comprobante" is where it
// starts. Prices are the SKU's, and can be changed to what was actually charged.

export type ReceiptDraft = {
  kind: ReceiptKind | "none";
  docType: CustomerDocType;
  docNumber: string;
  name: string;
  address: string;
  email: string;
  // Price charged per SKU id, in soles as typed ("349.90"); empty means the SKU's price.
  prices: Record<string, string>;
};

export const EMPTY_RECEIPT: ReceiptDraft = { kind: "none", docType: "none", docNumber: "", name: "", address: "", email: "", prices: {} };

function cents(typed: string): number | null {
  const text = typed.trim().replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}

export function lineCents(line: CartLine, draft: ReceiptDraft) {
  const typed = draft.prices[line.item.id];
  if (typed !== undefined && typed.trim() !== "") return cents(typed);
  return line.item.unit_price_pen === null ? null : line.item.unit_price_pen * 100;
}

export function receiptRequest(draft: ReceiptDraft, cart: CartLine[]): ReceiptRequest | null {
  if (draft.kind === "none") return null;
  return {
    kind: draft.kind,
    customer: {
      doc_type: draft.kind === "factura" ? "ruc" : draft.docType,
      doc_number: draft.docNumber.trim() || undefined,
      name: draft.name.trim() || undefined,
      address: draft.address.trim() || undefined,
      email: draft.email.trim() || undefined,
    },
    lines: cart.map((line) => ({ item_id: line.item.id, unit_price_cents: lineCents(line, draft) })),
  };
}

export function receiptTotal(draft: ReceiptDraft, cart: CartLine[]) {
  const values = cart.map((line) => lineCents(line, draft));
  return values.every((value) => value !== null) ? cart.reduce((sum, line, index) => sum + (values[index] ?? 0) * line.quantity, 0) : null;
}

export function ReceiptFields({ draft, onChange, cart }: { draft: ReceiptDraft; onChange: (next: ReceiptDraft) => void; cart: CartLine[] }) {
  const id = useId();
  const set = (patch: Partial<ReceiptDraft>) => onChange({ ...draft, ...patch });
  const total = receiptTotal(draft, cart);
  const needsId = draft.kind === "boleta" && total !== null && total >= BOLETA_ID_THRESHOLD_CENTS;
  return (
    <fieldset className="grid min-w-0 gap-3 rounded-control border border-subtle p-3">
      <legend className="px-1 t-ui font-semibold text-ink">Comprobante</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Radio name={`${id}-tipo`} checked={draft.kind === "none"} onChange={() => set({ kind: "none" })} label="Sin comprobante" />
        <Radio name={`${id}-tipo`} checked={draft.kind === "boleta"} onChange={() => set({ kind: "boleta" })} label="Boleta" />
        <Radio name={`${id}-tipo`} checked={draft.kind === "factura"} onChange={() => set({ kind: "factura", docType: "ruc" })} label="Factura" />
      </div>
      {draft.kind === "none" ? null : (
        <>
          {draft.kind === "boleta" ? (
            <Field id={`${id}-doc-tipo`} label="Documento del cliente" hint={needsId ? "Desde S/ 700 la boleta lleva el documento y el nombre del cliente." : "Opcional en boletas de menos de S/ 700."}>
              <Select value={draft.docType} onChange={(event) => set({ docType: event.target.value as CustomerDocType })}>
                {(["none", "dni", "ce", "pasaporte", "ruc"] as CustomerDocType[]).map((type) => <option key={type} value={type}>{DOC_TYPE_LABELS[type]}</option>)}
              </Select>
            </Field>
          ) : null}
          {draft.kind === "factura" || draft.docType !== "none" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id={`${id}-doc`} label={draft.kind === "factura" ? "RUC" : DOC_TYPE_LABELS[draft.docType]}>
                <Input value={draft.docNumber} inputMode={draft.docType === "dni" || draft.kind === "factura" || draft.docType === "ruc" ? "numeric" : "text"} maxLength={15} autoComplete="off" onChange={(event) => set({ docNumber: event.target.value })} />
              </Field>
              <Field id={`${id}-nombre`} label={draft.kind === "factura" ? "Razón social" : "Nombre"}>
                <Input value={draft.name} maxLength={100} autoComplete="off" onChange={(event) => set({ name: event.target.value })} />
              </Field>
            </div>
          ) : null}
          {draft.kind === "factura" ? (
            <Field id={`${id}-direccion`} label="Dirección fiscal" optional>
              <Input value={draft.address} maxLength={200} autoComplete="off" onChange={(event) => set({ address: event.target.value })} />
            </Field>
          ) : null}
          <Field id={`${id}-correo`} label="Correo del cliente" optional hint="Nubefact le envía el PDF si tu cuenta lo tiene activado.">
            <Input type="email" value={draft.email} maxLength={120} autoComplete="off" onChange={(event) => set({ email: event.target.value })} />
          </Field>
          {cart.length ? (
            <details>
              <summary className="link w-fit cursor-pointer t-meta font-semibold">Cambiar el precio cobrado</summary>
              <ul className="mt-2 grid gap-2">
                {cart.map((line) => (
                  <li key={line.item.id}>
                    <Field id={`${id}-precio-${line.item.id}`} label={`${line.item.merchant_sku} · precio por unidad (S/, con IGV)`}>
                      <Input
                        inputMode="decimal"
                        value={draft.prices[line.item.id] ?? (line.item.unit_price_pen === null ? "" : String(line.item.unit_price_pen))}
                        onChange={(event) => set({ prices: { ...draft.prices, [line.item.id]: event.target.value } })}
                      />
                    </Field>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </fieldset>
  );
}

// What happened to the comprobante of the sale just recorded, with the PDF, a WhatsApp copy and "Reintentar".
export function ReceiptOutcome({ receipt, storeName, onChange }: { receipt: ReceiptRecord; storeName: string; onChange: (next: ReceiptRecord) => void }) {
  const id = useId();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const status = receiptStatus(receipt);
  const whatsapp = phone ? receiptWhatsAppHref(phone, receipt, storeName) : null;
  const link = receipt.pdf_url ?? receipt.provider_link;

  async function retry() {
    setBusy(true);
    setError("");
    const result = await receiptAction<{ receipt: ReceiptRecord }>({ action: "retry", receipt_id: receipt.id });
    setBusy(false);
    if (!result.ok) setError(result.message);
    else onChange(result.data.receipt);
  }

  return (
    <div className="grid gap-3 rounded-control border border-subtle p-3" role="status">
      <p className="flex flex-wrap items-center gap-2 t-ui font-semibold text-ink">
        <FileText aria-hidden className="h-4 w-4" />
        {KIND_LABELS[receipt.kind]} {receiptCode(receipt)}
        <Tag tone={status.tone}>{status.label}</Tag>
      </p>
      {receipt.status === "error" && receipt.error_message ? <p className="t-ui text-danger">{receipt.error_message}</p> : null}
      {error ? <p className="t-ui text-danger">{error}</p> : null}
      {canRetry(receipt) ? (
        <Button variant="secondary" size="sm" icon={<RotateCcw aria-hidden />} loading={busy} loadingLabel="Enviando…" onClick={retry} className="w-fit">Reintentar envío</Button>
      ) : null}
      {link ? (
        <>
          <a href={link} target="_blank" rel="noopener noreferrer" className="link inline-flex w-fit items-center gap-1 t-ui font-semibold">
            Ver PDF <ExternalLink aria-hidden className="h-4 w-4" />
          </a>
          <div className="flex flex-wrap items-end gap-2">
            <Field id={`${id}-celular`} label="Enviar por WhatsApp al celular" optional className="min-w-0 flex-1">
              <Input type="tel" inputMode="tel" value={phone} placeholder="987 654 321" onChange={(event) => setPhone(event.target.value)} />
            </Field>
            {whatsapp ? (
              <Button href={whatsapp} variant="secondary" icon={<WhatsAppGlyph />} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</Button>
            ) : (
              <Button variant="secondary" icon={<WhatsAppGlyph />} disabled>Abrir WhatsApp</Button>
            )}
          </div>
        </>
      ) : null}
      <p className="t-meta">Lo emite tu tienda con su cuenta de Nubefact. <Link href="/mi-cuenta/tienda/comprobantes" className="link font-semibold">Ver comprobantes</Link></p>
    </div>
  );
}
