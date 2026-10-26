// reach-09 "Garantía y cambios" (supabase/migrations/20261206120000_feat_store_terms.sql). A store states its warranty
// and returns once per condition group; every store listing carries the line, unless the store gave that listing its
// own terms. The promise is the store's, and the copy always says so.

export type ConditionGroup = "new" | "open_box" | "used";
export type WarrantyProvider = "store" | "brand";

export type StoreTerms = {
  warranty_months: number | null;
  warranty_provider: WarrantyProvider | null;
  returns_days: number | null;
  returns_note: string | null;
};

// The listing columns (listings.store_terms_source says whether they come from the policy or the listing itself).
export type ListingStoreTerms = Partial<StoreTerms> & { store_terms_source?: "store_policy" | "listing" | null };

export const CONDITION_GROUPS: { value: ConditionGroup; label: string; hint: string }[] = [
  { value: "new", label: "Nuevos", hint: "Publicaciones en condición Nuevo." },
  { value: "open_box", label: "Exhibición o caja abierta", hint: "Equipos nuevos que se usaron en tienda o se abrieron." },
  { value: "used", label: "Usados", hint: "Todas las condiciones de usado." },
];

// As laria_private.listing_condition_group: "Nuevo", the stores-only open-box condition, and everything else is used.
export function conditionGroup(condition: string | null | undefined): ConditionGroup | null {
  if (!condition || !condition.trim()) return null;
  if (condition === "Nuevo") return "new";
  const lower = condition.toLowerCase();
  if (lower.startsWith("exhibici") || lower.includes("caja abierta")) return "open_box";
  return "used";
}

// The choices in the policy form. null = the store says nothing; 0 = the store says there is none.
export const WARRANTY_MONTH_CHOICES = [1, 2, 3, 6, 12, 18, 24, 36, 48, 60];
export const RETURNS_DAY_CHOICES = [3, 7, 10, 15, 30];
export const RETURNS_NOTE_MAX = 100;

function months(count: number) {
  return count === 1 ? "1 mes" : `${count} meses`;
}

function days(count: number) {
  return count === 1 ? "1 día" : `${count} días`;
}

// "Garantía de 12 meses de la marca", "Sin garantía adicional de la tienda", or null when the store says nothing.
export function warrantyLine(terms: Partial<StoreTerms>) {
  const value = terms.warranty_months;
  if (value === null || value === undefined) return null;
  if (value === 0) return "Sin garantía adicional de la tienda";
  return `Garantía de ${months(value)} ${terms.warranty_provider === "brand" ? "de la marca" : "de la tienda"}`;
}

// "Cambios hasta 7 días después de la compra: con boleta y empaque original", "No acepta cambios", or null.
export function returnsLine(terms: Partial<StoreTerms>) {
  const value = terms.returns_days;
  if (value === null || value === undefined) return null;
  if (value === 0) return "No acepta cambios ni devoluciones";
  const note = terms.returns_note?.trim();
  return `Cambios hasta ${days(value)} después de la compra${note ? `: ${note}` : ""}`;
}

export function hasWarranty(terms: Partial<StoreTerms>) {
  return typeof terms.warranty_months === "number" && terms.warranty_months > 0;
}

export function hasTerms(terms: Partial<StoreTerms>) {
  return warrantyLine(terms) !== null || returnsLine(terms) !== null;
}

// The short summary on the owner's screens: "12 meses (marca) · cambios 7 días".
export function termsSummary(terms: Partial<StoreTerms> | null | undefined) {
  if (!terms || !hasTerms(terms)) return "Sin indicar";
  const parts: string[] = [];
  if (typeof terms.warranty_months === "number") {
    parts.push(terms.warranty_months === 0 ? "sin garantía adicional" : `garantía ${months(terms.warranty_months)}${terms.warranty_provider === "brand" ? " (marca)" : ""}`);
  }
  if (typeof terms.returns_days === "number") parts.push(terms.returns_days === 0 ? "sin cambios" : `cambios ${days(terms.returns_days)}`);
  const text = parts.join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// What set_store_warranty_policy and set_listing_store_terms take: only the keys the store filled in.
export function termsPayload(form: { warranty: string; provider: string; returns: string; note: string }) {
  const payload: Record<string, unknown> = {};
  if (form.warranty !== "") {
    const value = Number(form.warranty);
    payload.warranty_months = value;
    if (value > 0) payload.warranty_provider = form.provider === "brand" ? "brand" : "store";
  }
  if (form.returns !== "") {
    const value = Number(form.returns);
    payload.returns_days = value;
    if (value > 0 && form.note.trim()) payload.returns_note = form.note.trim().replace(/\s+/g, " ").slice(0, RETURNS_NOTE_MAX);
  }
  return payload;
}

export function termsForm(terms: Partial<StoreTerms> | null | undefined) {
  return {
    warranty: typeof terms?.warranty_months === "number" ? String(terms.warranty_months) : "",
    provider: terms?.warranty_provider === "brand" ? "brand" : "store",
    returns: typeof terms?.returns_days === "number" ? String(terms.returns_days) : "",
    note: terms?.returns_note ?? "",
  };
}

// The database explains each refusal in Spanish ("STORE_TERMS_X: message"); show that message.
export function termsErrorMessage(raw: string | null | undefined) {
  const match = raw?.match(/^STORE_TERMS_[A-Z_]+: ([\s\S]+)$/);
  return match ? match[1] : "No pudimos guardar. Intenta nuevamente.";
}
