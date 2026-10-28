import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_LIMITS, aiSiteRule } from "@/lib/ai/config";
import { checkKey } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

// The AI helpers' limits and their log (supabase/migrations/20261120120000_maybes_ai_helpers.sql). The log's types
// live here until the generated lib/supabase/database.types.ts includes laria_private.ai_requests and
// public.record_ai_request; then RecordAiRequestArgs becomes Database["public"]["Functions"]["record_ai_request"]["Args"].

export type AiFeature = "store_question" | "listing_assist";

// answered: used; no_match: a valid answer with nothing to use; refused: the model declined; invalid: an answer that
// failed the site's checks; failed: no answer (network, timeout, an API error).
export type AiOutcome = "answered" | "no_match" | "refused" | "invalid" | "failed";

export type RecordAiRequestArgs = {
  p_feature: AiFeature;
  p_user_id: string;
  p_store_id: string | null;
  p_model: string;
  p_input_tokens: number;
  p_output_tokens: number;
  p_outcome: AiOutcome;
};

// A row of laria_private.ai_requests, which no API role reads; for SQL reports and the tests.
export type AiRequestRow = {
  id: number;
  feature: AiFeature;
  user_id: string | null;
  store_id: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  outcome: AiOutcome;
  created_at: string;
};

export type AiAllowance = "allowed" | "limited" | "site_limited" | "unavailable";

// The account's or store's own daily allowance first, then the site's. A counter that can't count refuses: an AI call
// costs money, so it never runs without a limit.
export async function allowAiCall(feature: AiFeature, subject: string): Promise<AiAllowance> {
  const own = await checkKey(feature === "store_question" ? AI_LIMITS.storeQuestion : AI_LIMITS.listingAssist, `${feature}:${subject}`);
  if (own !== "allowed") return own;
  const site = await checkKey(aiSiteRule(), "site");
  return site === "allowed" ? "allowed" : site === "limited" ? "site_limited" : "unavailable";
}

export type AiRequestRecord = {
  feature: AiFeature;
  userId: string;
  storeId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  outcome: AiOutcome;
};

// One row per call that reached the API, without its content. A log that can't be written is reported in the
// server's own log and never fails the answer.
export async function recordAiRequest(record: AiRequestRecord) {
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  const args: RecordAiRequestArgs = {
    p_feature: record.feature,
    p_user_id: record.userId,
    p_store_id: record.storeId,
    p_model: record.model,
    p_input_tokens: record.inputTokens,
    p_output_tokens: record.outputTokens,
    p_outcome: record.outcome,
  };
  const { error } = await (admin as unknown as SupabaseClient).rpc("record_ai_request", args);
  if (error) console.warn("ai-request-log-failed", record.feature, error.code ?? error.message);
}
