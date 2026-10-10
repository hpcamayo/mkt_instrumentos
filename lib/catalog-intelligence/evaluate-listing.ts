import { randomUUID } from "node:crypto";
import { evaluatePolicy, POLICY_VERSION, type Gate, type PolicyOutcome, type PolicyResult } from "@/lib/catalog-intelligence/approval-policy";
import { catalogQuery } from "@/lib/catalog-intelligence/catalog-resolver";
import type { JevConfig } from "@/lib/catalog-intelligence/config";
import { callDecisionProvider, type DecisionProvider, type JevAnswers, type ProviderOutcome } from "@/lib/catalog-intelligence/decision-provider";
import { compact } from "@/lib/catalog-intelligence/identity-signals";
import { buildJevQuestions, JEV_QUESTION_SET_VERSION } from "@/lib/catalog-intelligence/jev-questions";
import {
  buildEvidencePacket,
  listingInputHash,
  textSignals,
  validateListingSnapshot,
  type EvidencePacket,
  type ListingSnapshot,
} from "@/lib/catalog-intelligence/listing-evidence";
import type { CatalogProductDetail, CatalogSource } from "@/lib/catalog-intelligence/types";

// The evaluation pipeline for one saved listing version (spec §8, §15): validation, catalog retrieval, evidence,
// Jev, deterministic policy, auditable record. It runs after the submission is committed and never holds a
// database transaction; it writes nothing. Whether its outcome may change the listing is decided separately by
// planTransition(), which checks the version again.

// evaluation-audit: one row per evaluation, distinct from the listing's catalog association (spec §17).
export type EvaluationRecord = {
  evaluation_id: string;
  listing_id: string;
  listing_version: number;
  input_hash: string;
  catalog_version: string | null;
  mode: JevConfig["mode"];
  mode_note: string | null;
  candidates: { option: string; product_id: string; manufacturer: string; model: string; score: number; match_type: string }[];
  catalog: { decision: string; tier: string; reasons: string[]; score: number | null; product_id: string | null };
  selected: PolicyResult["selected"];
  answers: JevAnswers | null;
  outcome: PolicyOutcome;
  gates: Gate[];
  policy_version: string;
  question_set_version: string;
  threshold_source: "calibrated" | "demo" | null;
  provider: { id: string; model: string; mock: boolean; request_id: string | null } | null;
  latency_ms: number | null;
  attempts: number;
  failure: string | null;
  created_at: string;
  // Always "none" in this prototype: shadow mode records, it never publishes.
  action_taken: "none";
};

export async function evaluateListing(input: {
  listing: ListingSnapshot;
  catalog: CatalogSource;
  provider: DecisionProvider;
  config: JevConfig;
  catalogVersion?: string | null;
  now?: () => Date;
}): Promise<{ record: EvaluationRecord; packet: EvidencePacket | null } | null> {
  const { listing, config } = input;
  if (config.mode === "off") return null; // existing moderation, untouched
  const now = input.now ?? (() => new Date());
  const validation = validateListingSnapshot(listing);
  const signals = textSignals(listing);
  const { query, manufacturerHint } = catalogQuery(listing.brand, listing.model);

  const base = {
    evaluation_id: randomUUID(),
    listing_id: listing.listing_id,
    listing_version: listing.version,
    input_hash: listingInputHash(listing),
    catalog_version: input.catalogVersion ?? null,
    mode: config.mode,
    mode_note: config.modeNote,
    question_set_version: JEV_QUESTION_SET_VERSION,
    threshold_source: config.thresholds?.source ?? null,
    action_taken: "none" as const,
  };

  let packet: EvidencePacket;
  try {
    // The title is looked up too when it says more than brand and model: a second product or a copy word lives
    // there (catalog audit). Capped at 200 characters before it reaches the catalog.
    const titleQuery = listing.title.replace(/\s+/g, " ").trim().slice(0, 200);
    const lookupTitle = titleQuery !== "" && compact(titleQuery) !== compact(query);
    const [jevInputs, candidates, titleCandidates] = await Promise.all([
      input.catalog.jevInputs(query, manufacturerHint),
      input.catalog.lookup(query, manufacturerHint, config.maxCandidates),
      lookupTitle ? input.catalog.lookup(titleQuery, null, config.maxCandidates) : Promise.resolve([]),
    ]);
    const details = new Map<string, CatalogProductDetail>();
    await Promise.all(
      candidates.slice(0, config.maxCandidates).map(async (row) => {
        const detail = await input.catalog.productDetail(row.product_id);
        if (detail) details.set(row.product_id, detail);
      }),
    );
    packet = buildEvidencePacket({
      listing,
      validation,
      signals,
      jevInputs,
      candidates,
      titleCandidates,
      details,
      maxCandidates: config.maxCandidates,
    });
  } catch (error) {
    // The catalog is unreachable: the listing simply stays in normal moderation.
    const record: EvaluationRecord = {
      ...base,
      candidates: [],
      catalog: { decision: "INSUFFICIENT", tier: "INSUFFICIENT", reasons: ["catalog_error"], score: null, product_id: null },
      selected: null,
      answers: null,
      outcome: "SYSTEM_FAILURE",
      gates: [],
      policy_version: POLICY_VERSION,
      provider: null,
      latency_ms: null,
      attempts: 0,
      failure: `catalog_error: ${error instanceof Error ? error.message.slice(0, 200) : "unknown"}`,
      created_at: now().toISOString(),
    };
    return { record, packet: null };
  }

  const questions = buildJevQuestions(packet);
  const provider: ProviderOutcome = await callDecisionProvider(input.provider, packet, questions, {
    timeoutMs: config.timeoutMs,
    maxAttempts: config.maxAttempts,
  });
  const policy = evaluatePolicy({
    packet,
    provider,
    sellerKind: listing.seller_kind,
    operation: listing.operation,
    autoApproveFor: config.autoApproveFor,
    thresholds: config.thresholds,
  });

  const record: EvaluationRecord = {
    ...base,
    candidates: packet.catalog.candidates.map((item) => ({
      option: item.option,
      product_id: item.product_id,
      manufacturer: item.manufacturer,
      model: item.model,
      score: item.score,
      match_type: item.match_type,
    })),
    catalog: {
      decision: packet.catalog.decision,
      tier: packet.catalog.tier,
      reasons: packet.catalog.reasons,
      score: packet.catalog.score,
      product_id: packet.catalog.candidates.find((item) => item.option === packet.catalog.top_option)?.product_id ?? null,
    },
    selected: policy.selected,
    answers: provider.ok ? provider.answers : null,
    outcome: policy.outcome,
    gates: policy.gates,
    policy_version: policy.policy_version,
    provider: { id: provider.provider, model: provider.model, mock: provider.mock, request_id: provider.ok ? provider.requestId : null },
    latency_ms: provider.latencyMs,
    attempts: provider.attempts,
    failure: provider.ok ? null : `${provider.failure}: ${provider.detail}`,
    created_at: now().toISOString(),
  };
  return { record, packet };
}

// ------------------------------------------------------------------------------------- version-checked transition

export type CurrentListingState = {
  listing_id: string;
  version: number;
  input_hash: string;
  status: string;
  // An Admin approved, rejected or hid it after the evaluation started.
  admin_decided: boolean;
  // Another evaluation already applied an outcome to this version.
  applied_evaluation_id: string | null;
};

export type TransitionPlan =
  | { action: "publish" }
  | { action: "none"; reason: "not_auto_approve" | "shadow_mode" | "mock_provider" | "demo_thresholds" | "stale_version" | "not_pending" | "admin_decided" | "already_applied" };

// What an outcome may do to the listing, re-checked against the listing as it is now (spec §15). A stale result
// never approves newer content. In this prototype the mode is never "enforce", so the answer is always "none";
// the checks run anyway so the order of the guards can be reviewed and tested.
export function planTransition(record: EvaluationRecord, current: CurrentListingState): TransitionPlan {
  if (record.outcome !== "AUTO_APPROVE") return { action: "none", reason: "not_auto_approve" };
  if (current.version !== record.listing_version || current.input_hash !== record.input_hash) return { action: "none", reason: "stale_version" };
  if (current.status !== "pending") return { action: "none", reason: "not_pending" };
  if (current.admin_decided) return { action: "none", reason: "admin_decided" };
  if (current.applied_evaluation_id !== null) return { action: "none", reason: "already_applied" };
  if (record.provider?.mock) return { action: "none", reason: "mock_provider" };
  if (record.threshold_source !== "calibrated") return { action: "none", reason: "demo_thresholds" };
  if (record.mode !== "enforce") return { action: "none", reason: "shadow_mode" };
  return { action: "publish" };
}
