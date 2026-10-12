import { createHash } from "node:crypto";
import type { AutofillProvenance } from "@/lib/catalog-intelligence/autofill";
import { identitySignals, type IdentityCheck } from "@/lib/catalog-intelligence/identity-signals";
import type { CatalogJevInputsRow, CatalogLookupRow, CatalogProductDetail } from "@/lib/catalog-intelligence/types";
import {
  MAX_LISTING_PHOTOS,
  MIN_LISTING_PHOTOS,
  isInstrumentTypeValid,
  sanitizeListingAttributes,
  type ListingSubmissionAttributes,
} from "@/lib/listing-submission";
import { categoryOptions, conditionOptions } from "@/lib/listings";

// listing-evidence: the bounded, structured state Jev evaluates. Built server-side from the saved listing version,
// with a whitelist of fields: no seller e-mail, phone/WhatsApp, full name, account or credential ever goes in.

export type SellerKind = "particular" | "store" | "verified_store" | "admin";
export type ListingOperation = "new" | "revision";

// The exact saved version Jev evaluates (spec §15). PII columns of the listing row are deliberately absent.
export type ListingSnapshot = {
  listing_id: string;
  version: number;
  status: string;
  seller_kind: SellerKind;
  operation: ListingOperation;
  title: string;
  brand: string;
  model: string;
  category: string;
  instrument_type: string;
  description: string;
  attributes: ListingSubmissionAttributes;
  condition: string;
  price_pen: number | null;
  photo_count: number;
  city: string;
  region: string;
  // Optional identifiers the seller typed (SKU, serial format is NOT asked for).
  identifiers?: string[];
  autofill: AutofillProvenance | null;
};

// ------------------------------------------------------------------------------------- deterministic checks

export type ListingValidation = { ok: boolean; problems: string[] };

// The existing publication rules (app/api/submissions/route.ts), re-checked on the saved version. They decide
// nothing new: a listing that fails them never reaches Jev in production, and here it can only lead to INSUFFICIENT.
export function validateListingSnapshot(listing: ListingSnapshot): ListingValidation {
  const problems: string[] = [];
  for (const field of ["title", "brand", "model", "city", "region"] as const) {
    if (!listing[field]?.trim()) problems.push(`missing_${field}`);
  }
  if (!categoryOptions.some((option) => option.value === listing.category)) problems.push("invalid_category");
  else if (!isInstrumentTypeValid(listing.category, listing.instrument_type)) problems.push("invalid_instrument_type");
  if (!conditionOptions.some((value) => value === listing.condition)) problems.push("invalid_condition");
  if (listing.price_pen === null || !Number.isInteger(listing.price_pen) || listing.price_pen <= 0) problems.push("invalid_price");
  if (listing.description.trim().length < 40) problems.push("short_description");
  if (listing.photo_count < MIN_LISTING_PHOTOS || listing.photo_count > MAX_LISTING_PHOTOS) problems.push("photo_count");
  if (listing.instrument_type && sanitizeListingAttributes(listing.instrument_type, listing.attributes) === null) {
    problems.push("invalid_attributes");
  }
  return { ok: problems.length === 0, problems };
}

// Narrow, text-only signals. They are evidence, not verdicts: any of them only keeps a listing out of automation.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(\+?\b51[\s.-]?)?\b9\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b|(\(01\)\s?|\b01[\s.-])\d{3}[\s.-]?\d{4}\b/g;
const LINK = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const INSTRUCTION_LIKE =
  /ignor(a|e|en)\s+(las\s+|todas\s+las\s+|all\s+|previous\s+|the\s+)?(instrucciones|instructions|reglas|rules)|apru[eé]ba(la|me|r)?\s+(esta|mi|este)\s+(publicaci[oó]n|aviso)|approve\s+this\s+listing|system\s+prompt|jev\s*[:,]/i;

export type TextSignal = "contact_details" | "external_link" | "instruction_like";

export function textSignals(listing: Pick<ListingSnapshot, "title" | "description">): TextSignal[] {
  const text = `${listing.title}\n${listing.description}`;
  const signals: TextSignal[] = [];
  if (new RegExp(EMAIL.source).test(text) || new RegExp(PHONE.source).test(text)) signals.push("contact_details");
  if (new RegExp(LINK.source, "i").test(text)) signals.push("external_link");
  if (INSTRUCTION_LIKE.test(text)) signals.push("instruction_like");
  return signals;
}

// E-mail addresses and Peruvian phone numbers never leave Laria, even when a seller typed them in the description.
export function redactContactDetails(text: string) {
  return text.replace(EMAIL, "[contacto]").replace(PHONE, "[contacto]");
}

// Immutable fingerprint of what was evaluated. A stale result (hash or version changed) can never approve content.
export function listingInputHash(listing: ListingSnapshot) {
  const material = {
    listing_id: listing.listing_id,
    version: listing.version,
    title: listing.title,
    brand: listing.brand,
    model: listing.model,
    category: listing.category,
    instrument_type: listing.instrument_type,
    description: listing.description,
    attributes: sortKeys(listing.attributes),
    condition: listing.condition,
    price_pen: listing.price_pen,
    photo_count: listing.photo_count,
    identifiers: listing.identifiers ?? [],
    autofill: listing.autofill
      ? { product: listing.autofill.catalog_product_id, accepted: listing.autofill.accepted, modified: listing.autofill.modified }
      : null,
  };
  return createHash("sha256").update(JSON.stringify(material)).digest("hex");
}

function sortKeys(value: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]));
}

// ------------------------------------------------------------------------------------- the evidence packet

export type CandidateOption = {
  option: string; // "candidate_1" … : the only product answers Jev may give
  product_id: string;
  manufacturer: string;
  model: string;
  entity_level: "model" | "family";
  category: string | null;
  match_type: string;
  score: number;
  warning: string | null;
  verification_status: string;
  quality_status: string;
  publish_ready: boolean;
  // The product's catalog category on Laria's taxonomy (null when unknown or unmapped).
  laria_category: string | null;
  laria_instrument_type: string | null;
  // Trusted, conflict-free model attributes (Spanish display values). Untrusted ones are not shown to Jev.
  trusted_attributes: Record<string, string>;
  detail_status: string | null;
};

export type EvidencePacket = {
  listing: {
    title: string;
    brand: string;
    model: string;
    category: string;
    instrument_type: string;
    description: string;
    attributes: ListingSubmissionAttributes;
    identifiers: string[];
    autofill: {
      used: boolean;
      seller_action: string;
      accepted_fields: string[];
      modified_fields: string[];
    };
  };
  catalog: {
    decision: string;
    tier: string;
    reasons: string[];
    score: number | null;
    runner_up_score: number | null;
    brand_mentioned: boolean;
    top_option: string | null;
    detail: { detail_status: string | null; detailed: boolean | null; missing_attributes: string[]; untrusted_attributes: string[] };
    candidates: CandidateOption[];
  };
  checks: {
    validation_passed: boolean;
    problems: string[];
    text_signals: TextSignal[];
    // Deterministic identity findings (copy wording, category, second product, generation, size). Jev sees them too.
    identity_signals: IdentityCheck[];
  };
};

const MAX_DESCRIPTION = 2000;

export function buildEvidencePacket(input: {
  listing: ListingSnapshot;
  validation: ListingValidation;
  signals: TextSignal[];
  jevInputs: CatalogJevInputsRow;
  candidates: CatalogLookupRow[];
  // Candidates for the listing title, when it says more than brand and model (a second product, a copy word).
  titleCandidates?: CatalogLookupRow[];
  details: Map<string, CatalogProductDetail>;
  maxCandidates: number;
}): EvidencePacket {
  const { listing, jevInputs } = input;
  const options: CandidateOption[] = input.candidates.slice(0, input.maxCandidates).map((row, index) => {
    const detail = input.details.get(row.product_id);
    const untrusted = new Set(detail?.untrusted_attributes ?? []);
    const trusted = Object.fromEntries(
      (detail?.attributes ?? [])
        .filter((item) => item.trusted && !untrusted.has(item.attribute_key) && item.conflict_values.length === 0)
        .map((item) => [item.attribute_key, item.value_es ?? item.value]),
    );
    const deepestCategory = [...(detail?.category_path ?? [])].reverse().find((node) => node.laria_category);
    const deepestType = [...(detail?.category_path ?? [])].reverse().find((node) => node.laria_instrument_type);
    return {
      option: `candidate_${index + 1}`,
      product_id: row.product_id,
      manufacturer: row.manufacturer,
      model: row.model,
      entity_level: row.entity_level,
      category: row.category_label_es,
      match_type: row.match_type,
      score: row.score,
      warning: row.warning,
      verification_status: row.verification_status,
      quality_status: row.quality_status,
      publish_ready: row.publish_ready,
      laria_category: deepestCategory?.laria_category ?? null,
      laria_instrument_type: deepestType?.laria_instrument_type ?? null,
      trusted_attributes: trusted,
      detail_status: detail?.detail_status ?? null,
    };
  });
  const autofill = listing.autofill;
  const topIndex = options.findIndex((item) => item.product_id === jevInputs.product_id);
  const identity = identitySignals({
    listing,
    top: topIndex >= 0 ? { ...input.candidates[topIndex], ...options[topIndex] } : null,
    candidates: [...input.candidates, ...(input.titleCandidates ?? [])],
  });
  return {
    listing: {
      title: redactContactDetails(listing.title).slice(0, 300),
      brand: listing.brand.slice(0, 80),
      model: listing.model.slice(0, 120),
      category: listing.category,
      instrument_type: listing.instrument_type,
      description: redactContactDetails(listing.description).slice(0, MAX_DESCRIPTION),
      attributes: listing.attributes,
      identifiers: (listing.identifiers ?? []).map((item) => item.slice(0, 60)).slice(0, 5),
      autofill: {
        used: Boolean(autofill?.catalog_product_id),
        seller_action: autofill?.seller_action ?? "none",
        accepted_fields: autofill?.accepted ?? [],
        modified_fields: autofill?.modified ?? [],
      },
    },
    catalog: {
      decision: jevInputs.decision,
      tier: jevInputs.tier,
      reasons: jevInputs.reasons,
      score: jevInputs.score,
      runner_up_score: jevInputs.runner_up_score,
      brand_mentioned: jevInputs.brand_mentioned,
      top_option: options.find((item) => item.product_id === jevInputs.product_id)?.option ?? null,
      detail: {
        detail_status: jevInputs.detail_status,
        detailed: jevInputs.detailed,
        missing_attributes: jevInputs.missing_attributes ?? [],
        untrusted_attributes: jevInputs.untrusted_attributes ?? [],
      },
      candidates: options,
    },
    checks: {
      validation_passed: input.validation.ok,
      problems: input.validation.problems,
      text_signals: input.signals,
      identity_signals: identity,
    },
  };
}
