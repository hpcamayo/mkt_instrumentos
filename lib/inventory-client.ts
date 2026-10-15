// Browser side of the inventory actions (app/api/store/inventory/route.ts).

export type InventoryActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; detail: Record<string, unknown> | null };

// A fresh idempotency key. Screens create one when a sheet opens, so a double tap or a retry of the same request is
// applied once (design §13.3).
export function newRequestKey(prefix: string) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

// Posts one action. A lock conflict (INVENTORY_CONCURRENT_CHANGE) is retried once with the same body, so the same
// idempotency key: the database applies it at most once either way.
export async function inventoryAction<T = unknown>(body: Record<string, unknown>): Promise<InventoryActionResult<T>> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch("/api/store/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, code: "NETWORK", message: "No hubo conexión. Revisa tu internet e intenta de nuevo; el cambio no se aplicará dos veces.", detail: null };
    }
    const result = await response.json().catch(() => null);
    if (response.ok && result?.ok) return { ok: true, data: result.data as T };
    const code = typeof result?.code === "string" ? result.code : "UNKNOWN";
    if (code === "INVENTORY_CONCURRENT_CHANGE" && attempt === 0) continue;
    return {
      ok: false,
      code,
      message: typeof result?.message === "string" ? result.message : "No se pudo guardar el cambio. Intenta de nuevo.",
      detail: result?.detail && typeof result.detail === "object" ? result.detail : null,
    };
  }
  return { ok: false, code: "UNKNOWN", message: "No se pudo guardar el cambio. Intenta de nuevo.", detail: null };
}

// Whole numbers typed by the merchant; anything else is null so the form can say what is wrong.
export function parseWholeNumber(value: FormDataEntryValue | string | null, { allowNegative = false } = {}) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, "") : "";
  if (!(allowNegative ? /^-?\d{1,7}$/ : /^\d{1,7}$/).test(text)) return null;
  return Number(text);
}
