import type { PolicyThresholds } from "@/lib/catalog-intelligence/config";
import type { JevAnswers, ProviderOutcome } from "@/lib/catalog-intelligence/decision-provider";
import type { EvidencePacket, ListingOperation, SellerKind } from "@/lib/catalog-intelligence/listing-evidence";

// approval-policy: Laria's deterministic rules. Jev's answers are inputs; this function alone names the outcome,
// and it lists every gate with its result so an Admin can see why a listing did or did not qualify.
// The outcomes are policy results, not listing statuses (spec §12): nothing here touches listings.status.

export const POLICY_VERSION = "approval-policy-2026-10-10.1";

export type PolicyOutcome = "AUTO_APPROVE" | "REVIEW" | "INSUFFICIENT" | "CONFLICTING" | "SYSTEM_FAILURE";

export type GateId =
  | "submission_valid"
  | "seller_in_scope"
  | "new_listing"
  | "catalog_identity"
  | "catalog_detailed"
  | "identity_not_edited"
  | "text_signals_clean"
  | "provider_valid"
  | "thresholds_present"
  | "jev_choice"
  | "jev_sufficient"
  | "jev_no_conflict"
  | "jev_detail"
  | "jev_text_clean";

export type Gate = { id: GateId; passed: boolean; detail: string };

export type PolicyInput = {
  packet: EvidencePacket;
  provider: ProviderOutcome | null; // null: Jev was not called (mode off)
  sellerKind: SellerKind;
  operation: ListingOperation;
  autoApproveFor: readonly ("particular" | "store")[];
  thresholds: PolicyThresholds | null;
};

export type PolicyResult = {
  outcome: PolicyOutcome;
  gates: Gate[];
  // The candidate Jev picked, resolved to a real catalog id (null when it picked an explicit outcome).
  selected: { option: string; product_id: string | null; probability: number | null } | null;
  policy_version: string;
};

const IDENTITY_FIELDS = ["brand", "model", "category", "instrument_type"];

export function evaluatePolicy(input: PolicyInput): PolicyResult {
  const { packet, provider, thresholds } = input;
  const answers: JevAnswers | null = provider?.ok ? provider.answers : null;
  const choice = answers?.product_choice.type === "choice" ? answers.product_choice : null;
  const selectedCandidate = choice ? packet.catalog.candidates.find((item) => item.option === choice.choice) ?? null : null;
  const selected = choice
    ? { option: choice.choice, product_id: selectedCandidate?.product_id ?? null, probability: choice.probabilities?.[choice.choice] ?? null }
    : null;

  const boolP = (answer: JevAnswers[keyof JevAnswers] | undefined) => (answer?.type === "boolean" ? answer.probability : null);
  const sufficient = boolP(answers?.evidence_sufficient);
  const conflict = boolP(answers?.material_conflict);
  const suspicious = boolP(answers?.suspicious_text);
  const detail = answers?.detail_quality.type === "score" ? answers.detail_quality.score : null;
  const catalog = packet.catalog;
  const topCandidate = catalog.candidates.find((item) => item.option === catalog.top_option) ?? null;
  const editedIdentity = packet.listing.autofill.modified_fields.filter((field) => IDENTITY_FIELDS.includes(field));

  const gates: Gate[] = [
    gate("submission_valid", packet.checks.validation_passed, packet.checks.problems.join(", ") || "ok"),
    gate(
      "seller_in_scope",
      (input.autoApproveFor as readonly string[]).includes(input.sellerKind),
      input.sellerKind === "verified_store" || input.sellerKind === "admin" ? "existing direct publishing is kept" : input.sellerKind,
    ),
    gate("new_listing", input.operation === "new", input.operation),
    gate(
      "catalog_identity",
      catalog.decision === "MATCH" && catalog.tier === "AUTO" && topCandidate?.entity_level === "model",
      `${catalog.decision}/${catalog.tier}${catalog.reasons.length ? ` (${catalog.reasons.join(", ")})` : ""}`,
    ),
    gate(
      "catalog_detailed",
      catalog.detail.detailed === true,
      `${catalog.detail.detail_status ?? "none"}${catalog.detail.untrusted_attributes.length ? `; untrusted: ${catalog.detail.untrusted_attributes.join(", ")}` : ""}`,
    ),
    gate("identity_not_edited", editedIdentity.length === 0, editedIdentity.join(", ") || "ok"),
    gate("text_signals_clean", packet.checks.text_signals.length === 0, packet.checks.text_signals.join(", ") || "ok"),
    gate("provider_valid", Boolean(provider?.ok), provider ? (provider.ok ? `${provider.provider}${provider.mock ? " (mock)" : ""}` : provider.failure) : "not called"),
    gate("thresholds_present", thresholds !== null, thresholds ? `${thresholds.source}: ${thresholds.label}` : "uncalibrated"),
    gate(
      "jev_choice",
      Boolean(thresholds && selected?.product_id && selected.product_id === topCandidate?.product_id && (selected.probability ?? 0) >= thresholds.choiceMin),
      selected ? `${selected.option}${selected.probability !== null ? ` p=${selected.probability.toFixed(2)}` : ""}` : "none",
    ),
    gate("jev_sufficient", Boolean(thresholds && sufficient !== null && sufficient >= thresholds.sufficientMin), fmt(sufficient)),
    gate("jev_no_conflict", Boolean(thresholds && conflict !== null && conflict <= thresholds.conflictMax), fmt(conflict)),
    gate("jev_detail", Boolean(thresholds && detail !== null && detail >= thresholds.detailMin), fmt(detail)),
    gate("jev_text_clean", Boolean(thresholds && suspicious !== null && suspicious <= thresholds.suspiciousMax), fmt(suspicious)),
  ];

  return { outcome: outcomeFor(input, gates, { selected, conflict, sufficient }), gates, selected, policy_version: POLICY_VERSION };
}

function outcomeFor(
  input: PolicyInput,
  gates: Gate[],
  jev: { selected: PolicyResult["selected"]; conflict: number | null; sufficient: number | null },
): PolicyOutcome {
  const { packet, provider, thresholds } = input;
  const catalog = packet.catalog;
  // 1. Existing deterministic rules first: an invalid submission is missing evidence, whatever Jev says.
  if (!packet.checks.validation_passed) return "INSUFFICIENT";
  // 2. Material contradiction, from the catalog itself or from Jev.
  const conflictLimit = thresholds?.conflictMax ?? 0.5;
  if (
    catalog.reasons.includes("brand_contradicted") ||
    jev.selected?.option === "CONFLICTING_INFORMATION" ||
    (jev.conflict !== null && jev.conflict > Math.max(conflictLimit, 0.5))
  ) {
    return "CONFLICTING";
  }
  // 3. Jev was needed and did not answer validly.
  if (!provider || !provider.ok) return "SYSTEM_FAILURE";
  // 4. Not enough evidence to identify the instrument.
  if (
    catalog.candidates.length === 0 ||
    (catalog.tier === "INSUFFICIENT" && catalog.decision === "INSUFFICIENT") ||
    jev.selected?.option === "INSUFFICIENT_INFORMATION" ||
    jev.selected?.option === "NONE_OF_THE_ABOVE"
  ) {
    return "INSUFFICIENT";
  }
  // 5. Every gate, or human moderation.
  return gates.every((item) => item.passed) ? "AUTO_APPROVE" : "REVIEW";
}

function gate(id: GateId, passed: boolean, detail: string): Gate {
  return { id, passed, detail };
}

function fmt(value: number | null) {
  return value === null ? "none" : value.toFixed(2);
}
