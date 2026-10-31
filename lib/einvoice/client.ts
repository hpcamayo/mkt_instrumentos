// Browser side of app/api/store/receipts (run-03).
import type { ReceiptRecord, ReceiptRequest } from "@/lib/einvoice/nubefact";

export type ReceiptActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export async function receiptAction<T>(body: Record<string, unknown>): Promise<ReceiptActionResult<T>> {
  let response: Response;
  try {
    response = await fetch("/api/store/receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, code: "NETWORK", message: "No hubo conexión. El comprobante queda por enviar; reinténtalo desde Comprobantes." };
  }
  const result = await response.json().catch(() => null);
  if (response.ok && result?.ok) return { ok: true, data: result.data as T };
  return { ok: false, code: typeof result?.code === "string" ? result.code : "UNKNOWN", message: typeof result?.message === "string" ? result.message : "No se pudo completar. Intenta de nuevo." };
}

export function issueReceipt(saleKey: string, request: ReceiptRequest) {
  return receiptAction<{ receipt: ReceiptRecord }>({
    action: "issue",
    fields: {
      sale_key: saleKey,
      kind: request.kind,
      customer: request.customer,
      lines: (request.lines ?? []).filter((line) => line.unit_price_cents !== null),
    },
  });
}
