"use client";

import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Price } from "@/components/ui/price";
import { Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { receiptAction } from "@/lib/einvoice/client";
import { DOC_TYPE_LABELS, KIND_LABELS, canRetry, receiptCode, receiptStatus, type ReceiptRecord } from "@/lib/einvoice/nubefact";

// run-03 Comprobantes: what the store issued from Mostrador, with "Reintentar" for ones that did not reach Nubefact
// and "Anular" (comunicación de baja) for accepted ones up to 7 days old.

const dateFormat = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

function VoidSheet({ receipt, onClose, onDone }: { receipt: ReceiptRecord; onClose: () => void; onDone: (message: string) => void }) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    const result = await receiptAction<{ receipt: ReceiptRecord; message: string | null }>({ action: "void", receipt_id: receipt.id, reason });
    setBusy(false);
    if (!result.ok) setError(result.message);
    else if (result.data.message) setError(result.data.message);
    else onDone(`Pedimos a Nubefact anular ${receiptCode(receipt)}.`);
  }
  return (
    <Sheet title={`Anular ${receiptCode(receipt)}`} closeLabel="Cerrar" layout="responsive" onDismiss={onClose}
      footer={<div className="flex flex-wrap gap-2"><Button variant="danger" loading={busy} loadingLabel="Anulando…" onClick={submit} disabled={reason.trim().length < 3}>Anular comprobante</Button><Button variant="secondary" onClick={onClose}>Cancelar</Button></div>}>
      <div className="grid gap-4">
        {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
        <p className="t-body text-ink">La anulación se comunica a SUNAT por Nubefact. No cambia el stock: si el cliente devolvió el producto, registra la devolución en Inventario.</p>
        <Field id={`${id}-motivo`} label="Motivo" hint="Por ejemplo: error en el precio, venta devuelta.">
          <Input value={reason} maxLength={100} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}

export function ReceiptsList({ receipts, today }: { receipts: ReceiptRecord[]; today: string }) {
  const router = useRouter();
  const [voiding, setVoiding] = useState<ReceiptRecord | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const daysOld = (date: string) => Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);

  async function retry(receipt: ReceiptRecord) {
    setBusy(receipt.id);
    const result = await receiptAction<{ receipt: ReceiptRecord }>({ action: "retry", receipt_id: receipt.id });
    setBusy(null);
    if (!result.ok) setFeedback({ kind: "error", message: result.message });
    else {
      const sent = result.data.receipt;
      setFeedback(sent.status === "accepted" ? { kind: "success", message: `${receiptCode(sent)} se emitió.` } : { kind: "error", message: sent.error_message ?? "Aún no se pudo enviar." });
      router.refresh();
    }
  }

  if (!receipts.length) return <p className="t-body text-ink-2">Aún no emites comprobantes. En el Mostrador, elige “Boleta” o “Factura” antes de registrar la venta.</p>;

  return (
    <div className="grid gap-3">
      {feedback ? <Notice tone={feedback.kind === "success" ? "success" : "danger"} role={feedback.kind === "success" ? "status" : "alert"}>{feedback.message}</Notice> : null}
      <ul className="divide-y divide-subtle rounded-panel border border-subtle bg-white" aria-label="Comprobantes">
        {receipts.map((receipt) => {
          const status = receiptStatus(receipt);
          const link = receipt.pdf_url ?? receipt.provider_link;
          return (
            <li key={receipt.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-start">
              <div className="grid min-w-0 gap-1">
                <p className="flex flex-wrap items-center gap-2 t-ui font-semibold text-ink">
                  {KIND_LABELS[receipt.kind]} {receiptCode(receipt)} <Tag tone={status.tone}>{status.label}</Tag>
                </p>
                <p className="t-meta">
                  {dateFormat.format(new Date(receipt.issue_date))} · {receipt.customer_name ?? "Clientes varios"}
                  {receipt.customer_doc_number ? ` · ${DOC_TYPE_LABELS[receipt.customer_doc_type]} ${receipt.customer_doc_number}` : ""}
                  {" · "}{receipt.lines.map((line) => `${line.sku} × ${line.quantity}`).join(", ")}
                </p>
                {receipt.status === "error" && receipt.error_message ? <p className="t-meta text-danger">{receipt.error_message}</p> : null}
                {receipt.sunat_description && receipt.status !== "error" ? <p className="t-meta">SUNAT: {receipt.sunat_description}</p> : null}
              </div>
              <div className="grid justify-items-start gap-2 sm:justify-items-end">
                <Price value={receipt.total_cents / 100} size="inline" />
                <div className="flex flex-wrap gap-2">
                  {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 t-ui font-semibold">PDF <ExternalLink aria-hidden className="h-4 w-4" /></a> : null}
                  {canRetry(receipt) ? <Button size="sm" variant="secondary" loading={busy === receipt.id} loadingLabel="Enviando…" onClick={() => retry(receipt)}>Reintentar</Button> : null}
                  {receipt.status === "accepted" && daysOld(receipt.issue_date) <= 7 ? <Button size="sm" variant="quiet" onClick={() => setVoiding(receipt)}>Anular</Button> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {voiding ? <VoidSheet receipt={voiding} onClose={() => setVoiding(null)} onDone={(message) => { setVoiding(null); setFeedback({ kind: "success", message }); router.refresh(); }} /> : null}
    </div>
  );
}
