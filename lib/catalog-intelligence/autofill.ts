import { getInstrumentFilterGroup, type InstrumentFilterConfig } from "@/lib/instrument-filters";
import { isInstrumentTypeValid, type ListingAttributeValue } from "@/lib/listing-submission";
import type {
  CatalogLookupRow,
  CatalogMatchRow,
  CatalogProductDetail,
  CatalogVariantRow,
} from "@/lib/catalog-intelligence/types";

// autofill-service: turns catalog records into editable, source-backed suggestions for the publication form.
// It never decides for the seller: every suggestion waits for a selection and stays editable, and unit-specific
// fields (condition, price, photos, description, location, accessories, repairs) are never suggested.

export const STRONG_MATCH_TYPES = ["exact_alias", "exact_alias_with_brand", "alias_tokens", "model_code", "sku"] as const;
const MAX_CANDIDATES = 5;

export type LookupKind =
  | "exact" // one model, catalog tier AUTO (identity only: never a listing approval)
  | "family" // a product line; model, variant and options still open
  | "ambiguous" // two or more models tie
  | "conflicting" // the brand the seller wrote contradicts the catalog evidence
  | "approximate" // plausible but weak (fuzzy, low score, bundle main item)
  | "unknown"; // nothing usable: the form continues exactly as today

export type CandidateView = {
  productId: string;
  manufacturer: string;
  model: string;
  categoryLabel: string | null;
  entityLevel: "model" | "family";
  strength: "model" | "approximate" | "family";
  score: number;
};

export type LookupResult = {
  kind: LookupKind;
  candidates: CandidateView[];
  // Product the catalog's own decision points at (null for unknown). Shown first; never applied without a click.
  topProductId: string | null;
  // For "conflicting": the brand the catalog associates with the matched model.
  conflict: { catalogManufacturer: string; catalogModel: string } | null;
  match: Pick<CatalogMatchRow, "decision" | "tier" | "reasons" | "score" | "match_type" | "warning">;
};

export function classifyLookup(match: CatalogMatchRow, rows: CatalogLookupRow[]): LookupResult {
  const usable = rows.filter((row) => row.quality_status !== "quarantined" && !["REJECTED", "CONFLICTING"].includes(row.verification_status));
  const top = usable[0];
  const matchSummary = {
    decision: match.decision,
    tier: match.tier,
    reasons: match.reasons,
    score: match.score,
    match_type: match.match_type,
    warning: match.warning,
  };
  const base = { candidates: [] as CandidateView[], topProductId: null, conflict: null, match: matchSummary };

  if (!top || match.reasons.includes("no_candidate") || !match.product_id) return { ...base, kind: "unknown" };
  // A hard catalog warning (unknown brand, a copy, the second item of a bundle) or a blocked product: no suggestion.
  const hardWarning = /^(unknown_brand|copy_word|bundle_part):/.test(match.warning ?? "");
  const blocked = match.reasons.includes("quarantined") || match.reasons.includes("rejected");

  if (match.reasons.includes("brand_contradicted")) {
    return {
      ...base,
      kind: "conflicting",
      candidates: views(usable.filter((row) => row.product_id === match.product_id)),
      topProductId: match.product_id,
      conflict: { catalogManufacturer: match.manufacturer ?? "", catalogModel: match.model ?? "" },
    };
  }
  if (hardWarning || blocked) return { ...base, kind: "unknown" };

  if (match.decision === "CONFLICTING") {
    const floor = (match.score ?? top.score) - 0.3;
    return {
      ...base,
      kind: "ambiguous",
      candidates: views(usable.filter((row) => row.score >= floor)),
      topProductId: null, // a tie: no candidate is shown as the catalog's pick
    };
  }
  if (match.decision === "FAMILY") {
    return { ...base, kind: "family", candidates: views(usable), topProductId: match.product_id };
  }
  if (match.decision === "MATCH" && match.tier === "AUTO") {
    return { ...base, kind: "exact", candidates: views(usable), topProductId: match.product_id };
  }
  return { ...base, kind: "approximate", candidates: views(usable), topProductId: match.product_id };
}

function views(rows: CatalogLookupRow[]): CandidateView[] {
  return rows.slice(0, MAX_CANDIDATES).map((row) => ({
    productId: row.product_id,
    manufacturer: row.manufacturer,
    model: row.model,
    categoryLabel: row.category_label_es,
    entityLevel: row.entity_level,
    strength:
      row.entity_level === "family"
        ? "family"
        : (STRONG_MATCH_TYPES as readonly string[]).includes(row.match_type) && !row.warning
          ? "model"
          : "approximate",
    score: row.score,
  }));
}

// ------------------------------------------------------------------------------------------------ field suggestions

export type FieldKey = "brand" | "model" | "category" | "instrument_type" | `attribute:${string}`;

export type FieldSuggestion = {
  field: FieldKey;
  value: ListingAttributeValue;
  // Spanish display text from the catalog (value_es) when there is one.
  display: string;
  source: "product" | "variant" | "category";
};

export type OmittedReason =
  | "untrusted" // trusted = false, or listed in untrusted_attributes
  | "conflict" // strong sources disagree
  | "variant_dependent" // differs between variants and no variant was chosen
  | "family_level" // a family match fills no attribute until the seller picks a model
  | "not_in_form" // the form has no such field, or the catalog value is not one of its options
  | "category_mismatch"; // the catalog type does not belong to the catalog category in Laria's taxonomy

export type AutofillSuggestion = {
  productId: string;
  variantId: string | null;
  entityLevel: "model" | "family";
  suggestions: FieldSuggestion[];
  omitted: { key: string; reason: OmittedReason }[];
  // Variant details that have no form field (colour, finish): shown, never filled.
  variantInfo: { label: string; value: string }[];
  // Models of a family the seller can pick to get a fuller autofill.
  familyModels: { id: string; model: string }[];
  // Filled only when the catalog marks the product unfit for autofill (quarantined, rejected).
  blockedReason: string | null;
};

export function buildAutofillSuggestion(detail: CatalogProductDetail, variantId: string | null = null): AutofillSuggestion {
  const result: AutofillSuggestion = {
    productId: detail.id,
    variantId: null,
    entityLevel: detail.entity_level,
    suggestions: [],
    omitted: [],
    variantInfo: [],
    familyModels: detail.family_models,
    blockedReason: null,
  };
  if (detail.quality_status === "quarantined" || ["REJECTED", "CONFLICTING"].includes(detail.verification_status)) {
    result.blockedReason = detail.quality_status === "quarantined" ? "quarantined" : detail.verification_status.toLowerCase();
    return result;
  }

  result.suggestions.push(
    { field: "brand", value: detail.manufacturer, display: detail.manufacturer, source: "product" },
    { field: "model", value: detail.model, display: detail.model, source: "product" },
  );

  // Category and type come from the catalog's own mapping onto listings.category / listings.instrument_type.
  const deepestCategory = [...detail.category_path].reverse().find((node) => node.laria_category);
  const deepestType = [...detail.category_path].reverse().find((node) => node.laria_instrument_type);
  const category = deepestCategory?.laria_category ?? null;
  let instrumentType = deepestType?.laria_instrument_type ?? null;
  if (category && instrumentType && !isInstrumentTypeValid(category, instrumentType)) {
    result.omitted.push({ key: "instrument_type", reason: "category_mismatch" });
    instrumentType = null;
  }
  if (category) {
    result.suggestions.push({ field: "category", value: category, display: deepestCategory?.label_es ?? category, source: "category" });
  }
  if (instrumentType) {
    result.suggestions.push({ field: "instrument_type", value: instrumentType, display: deepestType?.label_es ?? instrumentType, source: "category" });
  }

  if (detail.entity_level === "family") {
    for (const row of detail.attributes) result.omitted.push({ key: row.attribute_key, reason: "family_level" });
    return result;
  }

  const filters = new Map<string, InstrumentFilterConfig>(
    (instrumentType ? getInstrumentFilterGroup(instrumentType)?.filters ?? [] : []).map((filter) => [filter.key, filter]),
  );
  const untrusted = new Set(detail.untrusted_attributes);
  const variantDependent = new Set(detail.variant_attributes);

  for (const row of detail.attributes) {
    const key = row.attribute_key;
    if (!row.trusted || untrusted.has(key)) {
      result.omitted.push({ key, reason: "untrusted" });
      continue;
    }
    if (row.conflict_values.length > 0) {
      result.omitted.push({ key, reason: "conflict" });
      continue;
    }
    // variant_attributes are not stored at product level; this guards a stale row all the same
    if (variantDependent.has(key)) {
      result.omitted.push({ key, reason: "variant_dependent" });
      continue;
    }
    const filter = filters.get(key);
    const value = filter ? toFormValue(filter, row.value) : null;
    if (!filter || value === null) {
      result.omitted.push({ key, reason: "not_in_form" });
      continue;
    }
    result.suggestions.push({ field: `attribute:${key}`, value, display: row.value_es ?? row.value, source: "product" });
  }

  const variant = variantId ? detail.variants.find((item) => item.id === variantId) ?? null : null;
  for (const key of variantDependent) {
    const filter = filters.get(key);
    const value = variant && filter ? variantValue(filter, variant) : null;
    if (value === null) {
      result.omitted.push({ key, reason: variant ? "not_in_form" : "variant_dependent" });
      continue;
    }
    result.suggestions.push({ field: `attribute:${key}`, value: value.value, display: value.display, source: "variant" });
  }
  if (variant) {
    result.variantId = variant.id;
    for (const [label, value] of [["Color", variant.color], ["Acabado", variant.finish], ["Tamaño", variant.size]] as const) {
      if (value) result.variantInfo.push({ label, value });
    }
  }
  return result;
}

// A catalog value as the form stores it, or null when it is not one of the field's options.
export function toFormValue(filter: InstrumentFilterConfig, raw: string): ListingAttributeValue | null {
  const allowed = (value: string) => Boolean(filter.options?.some((option) => option.value === value));
  if (filter.type === "multiselect") {
    let values: unknown;
    try {
      values = raw.trim().startsWith("[") ? JSON.parse(raw) : [raw];
    } catch {
      return null;
    }
    if (!Array.isArray(values) || values.length === 0) return null;
    const strings = values.map(String);
    return strings.every(allowed) ? strings : null;
  }
  if (filter.type === "number") {
    const number = Number(raw);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }
  const value = filter.type === "boolean" ? ({ true: "yes", false: "no" } as Record<string, string>)[raw] ?? raw : raw;
  return allowed(value) ? value : null;
}

// Only handedness has a variant column the form can use today (configuration); colour and finish are shown as info.
function variantValue(filter: InstrumentFilterConfig, variant: CatalogVariantRow) {
  if (filter.key !== "handedness" || !variant.configuration) return null;
  const configuration = variant.configuration.toLowerCase();
  const value = /left|zurd/.test(configuration) ? "left_handed" : /right|diestr/.test(configuration) ? "right_handed" : null;
  const option = value ? filter.options?.find((item) => item.value === value) : undefined;
  return option ? { value: option.value, display: option.label } : null;
}

// ------------------------------------------------------------------------------------------------ provenance

export type SellerMatchAction = "none" | "accepted" | "rejected";

// What the publication keeps about autofill (spec §3 step 4): the seller's original identity claims, the product
// they confirmed (if any), what the catalog suggested, which suggestions survived and which the seller changed.
export type AutofillProvenance = {
  raw_claims: { brand: string; model: string };
  catalog_product_id: string | null;
  catalog_variant_id: string | null;
  lookup: { kind: LookupKind; decision: string; tier: string; reasons: string[]; score: number | null; match_type: string | null } | null;
  seller_action: SellerMatchAction;
  // The product the seller turned down, when they rejected a proposal.
  rejected_product_id: string | null;
  suggested: Partial<Record<FieldKey, ListingAttributeValue>>;
  accepted: FieldKey[];
  modified: FieldKey[];
  // When the seller accepted or rejected the proposal (null while they have not chosen).
  resolved_at: string | null;
};

export function buildProvenance(input: {
  rawClaims: { brand: string; model: string };
  lookup: LookupResult | null;
  action: SellerMatchAction;
  suggestion: AutofillSuggestion | null;
  rejectedProductId?: string | null;
  finalValues: Partial<Record<FieldKey, ListingAttributeValue | undefined>>;
  resolvedAt?: Date | null;
}): AutofillProvenance {
  const applied = input.action === "accepted" && input.suggestion ? input.suggestion : null;
  const suggested: AutofillProvenance["suggested"] = {};
  const accepted: FieldKey[] = [];
  const modified: FieldKey[] = [];
  for (const item of applied?.suggestions ?? []) {
    suggested[item.field] = item.value;
    if (sameValue(item.value, input.finalValues[item.field])) accepted.push(item.field);
    else modified.push(item.field);
  }
  return {
    raw_claims: { brand: input.rawClaims.brand, model: input.rawClaims.model },
    catalog_product_id: applied?.productId ?? null,
    catalog_variant_id: applied?.variantId ?? null,
    lookup: input.lookup
      ? {
          kind: input.lookup.kind,
          decision: input.lookup.match.decision,
          tier: input.lookup.match.tier,
          reasons: input.lookup.match.reasons,
          score: input.lookup.match.score,
          match_type: input.lookup.match.match_type,
        }
      : null,
    seller_action: input.action,
    rejected_product_id: input.action === "rejected" ? input.rejectedProductId ?? null : null,
    suggested,
    accepted,
    modified,
    resolved_at: input.action === "none" ? null : (input.resolvedAt ?? new Date()).toISOString(),
  };
}

export function sameValue(a: ListingAttributeValue | undefined, b: ListingAttributeValue | undefined) {
  if (Array.isArray(a) || Array.isArray(b)) {
    const left = (Array.isArray(a) ? a : a === undefined ? [] : [a]).map(String).sort();
    const right = (Array.isArray(b) ? b : b === undefined ? [] : [b]).map(String).sort();
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return a !== undefined && b !== undefined && String(a) === String(b);
}

// ------------------------------------------------------------------------------------------------ stale responses

// Only the newest lookup may write to the form: a slower, older response is dropped when it lands.
export function createLatestRequestGuard() {
  let latest = 0;
  return {
    next() {
      latest += 1;
      return latest;
    },
    isLatest(token: number) {
      return token === latest;
    },
  };
}
