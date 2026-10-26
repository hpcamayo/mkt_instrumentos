// listing-details: a listing's extra fields beyond the core ones, sent with the sell and edit forms as one object
// keyed by the batch that owns them ("sale_terms" here; warranty, made to order or part payment in other batches).
// The database has the matching writer registry (laria_private.listing_detail_writers, 20261202120100): each key
// there has a check here, run by the routes before anything is saved. A key without a check is refused.
//
// Adding a field: one entry below (its check returns the value to store or a message), one writer in the database,
// and the input component placed in the sell and edit forms with a one-line import (docs/database.md).
import { cleanSaleTerms, saleTermsPayload } from "@/lib/sale-terms";

export type DetailContext = { isStore: boolean };
export type DetailCheck = (value: unknown, context: DetailContext) => { ok: true; value: unknown } | { ok: false; message: string };

// BEGIN listing detail checks (additive: one entry per key)
const detailChecks: Record<string, DetailCheck> = {
  sale_terms: (value) => {
    const result = cleanSaleTerms(value);
    return result.ok ? { ok: true, value: saleTermsPayload(result.value) } : { ok: false, message: result.message };
  },
  // Feature ideas, selling-tools batch (run-04): true, false or null (follow the store's default). Stores only.
  part_payment: (value, { isStore }) => {
    if (value !== null && typeof value !== "boolean") return { ok: false, message: "Elige si aceptas equipos como parte de pago." };
    if (value === true && !isStore) return { ok: false, message: "Parte de pago es para publicaciones de tiendas." };
    return { ok: true, value };
  },
};
// END listing detail checks

export type ListingDetails = Record<string, unknown>;

// The details as the database writers receive them, or the first problem. Absent or null means none.
export function checkListingDetails(input: unknown, context: DetailContext): { ok: true; details: ListingDetails } | { ok: false; message: string } {
  if (input === undefined || input === null) return { ok: true, details: {} };
  if (typeof input !== "object" || Array.isArray(input)) return { ok: false, message: "Revisa los detalles de la publicación." };
  const details: ListingDetails = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const check = Object.hasOwn(detailChecks, key) ? detailChecks[key] : undefined;
    if (!check) return { ok: false, message: "Revisa los detalles de la publicación." };
    if (value === undefined) continue;
    const result = check(value, context);
    if (!result.ok) return result;
    details[key] = result.value;
  }
  return { ok: true, details };
}
