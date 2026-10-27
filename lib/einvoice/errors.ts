// Feature ideas, store-locations batch, run-03: the database's receipt and connection errors ("CODE: mensaje") as the
// screens show them. Inventory codes (the store checks shared with Inventario) pass through too.
const KNOWN = /^((RECEIPT|EINVOICE|INVENTORY|STORE|IDEMPOTENCY)_[A-Z_]+): ([\s\S]+)$/;

export function receiptError(raw: string | null | undefined): { code: string; message: string } {
  const match = raw ? KNOWN.exec(raw.trim()) : null;
  if (match) return { code: match[1], message: match[3] };
  return { code: "UNKNOWN", message: "No se pudo completar. Intenta de nuevo." };
}
