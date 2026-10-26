// listing-details: a listing's extra fields beyond the core ones, sent with the sell and edit forms as one object
// keyed by the batch that owns them ("sale_terms" here; warranty, made to order or part payment in other batches).
// The database has the matching writer registry (laria_private.listing_detail_writers, 20261202120100): each key
// there has a check here, run by the routes before anything is saved. A key without a check is refused.
//
// Adding a field: one entry below (its check returns the value to store or a message), one writer in the database,
// and the input component placed in the sell and edit forms with a one-line import (docs/database.md).
import { cleanSaleTerms, saleTermsPayload } from "@/lib/sale-terms";

export type DetailContext = { isStore: boolean };
// A failure may name the input it is about (its id is `${idPrefix}-${key}-${field}` in the forms).
export type DetailCheck = (value: unknown, context: DetailContext) => { ok: true; value: unknown } | { ok: false; message: string; field?: string };

// BEGIN listing detail checks (additive: one entry per key)
const detailChecks: Record<string, DetailCheck> = {
  sale_terms: (value) => {
    const result = cleanSaleTerms(value);
    return result.ok ? { ok: true, value: saleTermsPayload(result.value) } : { ok: false, message: result.message, field: result.field };
  },
};
// END listing detail checks

export type ListingDetails = Record<string, unknown>;

// The details as the database writers receive them, or the first problem. Absent or null means none.
export type DetailsCheckResult = { ok: true; details: ListingDetails } | { ok: false; message: string; key?: string; field?: string };

export function checkListingDetails(input: unknown, context: DetailContext): DetailsCheckResult {
  if (input === undefined || input === null) return { ok: true, details: {} };
  if (typeof input !== "object" || Array.isArray(input)) return { ok: false, message: "Revisa los detalles de la publicación." };
  const details: ListingDetails = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const check = Object.hasOwn(detailChecks, key) ? detailChecks[key] : undefined;
    if (!check) return { ok: false, message: "Revisa los detalles de la publicación." };
    if (value === undefined) continue;
    const result = check(value, context);
    if (!result.ok) return { ok: false, message: result.message, key, field: result.field };
    details[key] = result.value;
  }
  return { ok: true, details };
}

// The id of a detail's input in a form, so an error summary link lands on it.
export function detailFieldId(idPrefix: string, key: string, field?: string) {
  return field ? `${idPrefix}-${key}-${field}` : `${idPrefix}-${key}`;
}
