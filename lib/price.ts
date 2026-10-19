export const MAX_PRICE_PEN = 2_147_483_647;

export function parseWholeSolPrice(value: unknown) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 && value <= MAX_PRICE_PEN
      ? value
      : null;
  }
  if (typeof value !== "string") return null;
  const normalized = stripPriceFormatting(value);
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

// PriceInput shows "1,250" with an "S/" in front (auth-03). Whole soles only: the comma groups thousands, so
// "S/ 1,250" and "1250" both read as 1250, while a decimal point or a misplaced comma stays invalid.
export function stripPriceFormatting(value: string) {
  const text = value.trim().replace(/^S\/\s*/i, "");
  return /^\d{1,3}(,\d{3})+$/.test(text) ? text.replace(/,/g, "") : text;
}

export function formatPriceDigits(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 10);
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
