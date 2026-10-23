// Effortless Laria, inventory batch, big-10: the counter's pure parts (matching a code, the cart, the offline queue),
// unit-tested in tests/ux-inventory.test.cjs. components/inventory/counter.tsx holds the screen.

export type CounterItem = {
  id: string;
  merchant_sku: string;
  external_reference: string | null;
  product_name: string;
  variant_label: string | null;
  quantity_available: number;
  unit_price_pen: number | null;
  version: number;
  listing_title: string | null;
};

export type CartLine = { item: CounterItem; quantity: number };

export type QueuedSale = {
  key: string;
  channel: string;
  lines: { item_id: string; merchant_sku: string; quantity: number }[];
  created_at: string;
  // Set when the server refused the sale (not a connection problem): it stays until the owner removes it.
  error?: string;
};

function fold(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Scanners send the code exactly; people type it in any case. A code is the SKU or the external reference (where
// stores keep the barcode). Exact matches first; otherwise up to `limit` SKU whose name, SKU or code contains every
// word typed.
export function matchCode(items: CounterItem[], code: string, limit = 6): { exact: CounterItem | null; options: CounterItem[] } {
  const typed = code.trim();
  if (!typed) return { exact: null, options: [] };
  const upper = typed.toUpperCase();
  const exact = items.filter((item) => item.merchant_sku.toUpperCase() === upper || (item.external_reference ?? "").trim().toUpperCase() === upper);
  if (exact.length === 1) return { exact: exact[0], options: [] };
  if (exact.length > 1) return { exact: null, options: exact.slice(0, limit) };
  const words = fold(typed).split(/\s+/).filter(Boolean);
  const options = items.filter((item) => {
    const text = fold([item.merchant_sku, item.external_reference, item.product_name, item.variant_label, item.listing_title].filter(Boolean).join(" "));
    return words.every((word) => text.includes(word));
  });
  return { exact: null, options: options.slice(0, limit) };
}

// Adds one unit (or `by`), never past what is available; returns the cart and whether the limit stopped it.
export function addToCart(cart: CartLine[], item: CounterItem, by = 1): { cart: CartLine[]; limited: boolean } {
  const index = cart.findIndex((line) => line.item.id === item.id);
  const current = index >= 0 ? cart[index].quantity : 0;
  const next = Math.max(0, Math.min(current + by, item.quantity_available));
  const limited = current + by > item.quantity_available;
  if (index < 0) return { cart: next > 0 ? [...cart, { item, quantity: next }] : cart, limited };
  const updated = cart.map((line, position) => (position === index ? { ...line, quantity: next } : line)).filter((line) => line.quantity > 0);
  return { cart: updated, limited };
}

export function cartUnits(cart: CartLine[]) {
  return cart.reduce((sum, line) => sum + line.quantity, 0);
}

export function cartTotal(cart: CartLine[]) {
  return cart.every((line) => line.item.unit_price_pen !== null)
    ? cart.reduce((sum, line) => sum + line.quantity * (line.item.unit_price_pen ?? 0), 0)
    : null;
}

// The bulk operations for one sale (apply_bulk_stock_operations): one line per SKU.
export function saleOperations(sale: Pick<QueuedSale, "channel" | "lines">) {
  return sale.lines.map((line) => ({ item_id: line.item_id, type: "sale", quantity: line.quantity, channel: sale.channel, reference: "Mostrador" }));
}

// Codes that mean "keep it and retry later" versus "the server said no".
export function isConnectionFailure(code: string) {
  return code === "NETWORK" || code === "UNAVAILABLE" || code === "UNKNOWN" || code === "INVENTORY_CONCURRENT_CHANGE";
}

export const QUEUE_KEY = (storeId: string) => `laria:mostrador:cola:${storeId}`;
export const INDEX_KEY = (storeId: string) => `laria:mostrador:indice:${storeId}`;

export function readJson<T>(storage: Pick<Storage, "getItem"> | null, key: string, fallback: T): T {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(storage: Pick<Storage, "setItem"> | null, key: string, value: unknown) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked storage only loses the offline copy; the screen keeps working online.
  }
}
