export const MAX_PRICE_PEN = 2_147_483_647;

export function parseWholeSolPrice(value: unknown) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 && value <= MAX_PRICE_PEN
      ? value
      : null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^[0-9]+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= MAX_PRICE_PEN
    ? parsed
    : null;
}

export function formatPrice(price: number | null) {
  if (price === null) {
    return "Precio a consultar";
  }

  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 0,
  }).format(price);
}
