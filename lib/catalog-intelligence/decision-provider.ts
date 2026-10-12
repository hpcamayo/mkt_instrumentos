import type { EvidencePacket } from "@/lib/catalog-intelligence/listing-evidence";
import type { JevQuestions } from "@/lib/catalog-intelligence/jev-questions";

// decision-provider: the only place that knows how a decision model is called. The rest of Laria sees validated,
// typed answers or a typed failure. A failure is never retried through another, unvalidated model.

export type ChoiceAnswer = { type: "choice"; choice: string; probabilities?: Record<string, number> };
export type BooleanAnswer = { type: "boolean"; probability: number };
export type ScoreAnswer = { type: "score"; score: number; probabilities?: Record<string, number> };
export type RefusalAnswer = { type: "refusal" };

export type JevAnswers = {
  product_choice: ChoiceAnswer | RefusalAnswer;
  evidence_sufficient: BooleanAnswer | RefusalAnswer;
  material_conflict: BooleanAnswer | RefusalAnswer;
  detail_quality: ScoreAnswer | RefusalAnswer;
  suspicious_text: BooleanAnswer | RefusalAnswer;
};

export type ProviderRawResult = {
  answers: unknown;
  requestId: string | null;
  modelId: string | null;
  usage: { inputTokens?: number; outputTokens?: number } | null;
};

export type DecisionProvider = {
  id: string;
  model: string;
  // A mock never stands for real results: records carry the flag and the policy refuses to enforce on it.
  mock: boolean;
  decide(state: EvidencePacket, questions: JevQuestions, options: { signal: AbortSignal }): Promise<ProviderRawResult>;
};

export type ProviderFailure = "timeout" | "provider_error" | "invalid_response" | "disabled";

export type ProviderOutcome =
  | {
      ok: true;
      provider: string;
      model: string;
      mock: boolean;
      answers: JevAnswers;
      requestId: string | null;
      usage: ProviderRawResult["usage"];
      latencyMs: number;
      attempts: number;
    }
  | {
      ok: false;
      provider: string;
      model: string;
      mock: boolean;
      failure: ProviderFailure;
      detail: string;
      latencyMs: number;
      attempts: number;
    };

// Bounded call: a hard timeout per attempt (the abort signal is also raced, for providers that ignore it), and at
// most `maxAttempts` attempts, retrying only provider errors. Timeouts and invalid answers are not retried.
export async function callDecisionProvider(
  provider: DecisionProvider,
  state: EvidencePacket,
  questions: JevQuestions,
  options: { timeoutMs: number; maxAttempts: number; now?: () => number },
): Promise<ProviderOutcome> {
  const now = options.now ?? (() => Date.now());
  const started = now();
  const meta = { provider: provider.id, model: provider.model, mock: provider.mock };
  let attempts = 0;
  let lastError = "";
  while (attempts < Math.max(1, options.maxAttempts)) {
    attempts += 1;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve("timeout");
      }, options.timeoutMs);
    });
    try {
      const raced = await Promise.race([provider.decide(state, questions, { signal: controller.signal }), timeout]);
      if (raced === "timeout") {
        return { ok: false, ...meta, failure: "timeout", detail: `no answer within ${options.timeoutMs} ms`, latencyMs: now() - started, attempts };
      }
      const answers = validateAnswers(raced.answers, questions);
      if (!answers.ok) {
        return { ok: false, ...meta, failure: "invalid_response", detail: answers.problem, latencyMs: now() - started, attempts };
      }
      return {
        ok: true,
        ...meta,
        model: raced.modelId ?? provider.model,
        answers: answers.value,
        requestId: raced.requestId,
        usage: raced.usage,
        latencyMs: now() - started,
        attempts,
      };
    } catch (error) {
      if (controller.signal.aborted) {
        return { ok: false, ...meta, failure: "timeout", detail: `no answer within ${options.timeoutMs} ms`, latencyMs: now() - started, attempts };
      }
      lastError = error instanceof Error ? error.message.slice(0, 300) : "unknown error";
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, ...meta, failure: "provider_error", detail: lastError, latencyMs: now() - started, attempts };
}

// Every question answered, with its own type, probabilities inside [0, 1], and a choice that is one of the offered
// options. Anything else is an invalid response (SYSTEM_FAILURE downstream), never a guess.
export function validateAnswers(raw: unknown, questions: JevQuestions): { ok: true; value: JevAnswers } | { ok: false; problem: string } {
  if (!raw || typeof raw !== "object") return { ok: false, problem: "answers missing" };
  const answers = raw as Record<string, Record<string, unknown> | undefined>;
  const isProbability = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
  const out: Record<string, unknown> = {};
  for (const [id, question] of Object.entries(questions) as [keyof JevQuestions, JevQuestions[keyof JevQuestions]][]) {
    const answer = answers[id];
    if (!answer || typeof answer !== "object") return { ok: false, problem: `${id}: no answer` };
    if (answer.type === "refusal") {
      out[id] = { type: "refusal" };
      continue;
    }
    if (answer.type !== question.type) return { ok: false, problem: `${id}: expected ${question.type}, got ${String(answer.type)}` };
    if (question.type === "choice") {
      const choice = answer.choice;
      if (typeof choice !== "string" || !Object.hasOwn(question.criteria, choice)) return { ok: false, problem: `${id}: choice outside the options` };
      const probabilities = answer.probabilities as Record<string, unknown> | undefined;
      if (probabilities !== undefined) {
        if (typeof probabilities !== "object" || probabilities === null) return { ok: false, problem: `${id}: bad distribution` };
        for (const [key, value] of Object.entries(probabilities)) {
          if (!Object.hasOwn(question.criteria, key) || !isProbability(value)) return { ok: false, problem: `${id}: bad distribution` };
        }
      }
      out[id] = { type: "choice", choice, probabilities: probabilities as Record<string, number> | undefined };
    } else if (question.type === "boolean") {
      if (!isProbability(answer.probability)) return { ok: false, problem: `${id}: probability outside [0, 1]` };
      out[id] = { type: "boolean", probability: answer.probability };
    } else {
      const score = answer.score;
      if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > question.criteria.length - 1) {
        return { ok: false, problem: `${id}: score outside the levels` };
      }
      out[id] = { type: "score", score, probabilities: answer.probabilities as Record<string, number> | undefined };
    }
  }
  return { ok: true, value: out as JevAnswers };
}

// ------------------------------------------------------------------------------------- mock provider

// MOCK. Deterministic heuristics over the evidence packet so the pipeline, the policy and the Admin view can be
// exercised without credentials. Its numbers are invented by these rules, are not Jev output, and must never be
// reported as Jev accuracy, cost or latency. `scenario` forces the failure paths the prototype must handle.
export type MockScenario = "normal" | "timeout" | "error" | "invalid" | "ambiguous_scores";

export function createMockDecisionProvider(scenario: MockScenario = "normal"): DecisionProvider {
  return {
    id: "mock",
    model: "mock-jev-heuristic",
    mock: true,
    async decide(state, questions, { signal }) {
      if (scenario === "timeout") {
        await new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
      }
      if (scenario === "error") throw new Error("mock provider error (HTTP 503)");
      if (scenario === "invalid") {
        return { answers: { product_choice: { type: "choice", choice: "Fender Stratocaster invented" } }, requestId: "mock-invalid", modelId: "mock-jev-heuristic", usage: null };
      }
      return { answers: mockAnswers(state, questions, scenario), requestId: `mock-${state.catalog.top_option ?? "none"}`, modelId: "mock-jev-heuristic", usage: null };
    },
  };
}

function mockAnswers(state: EvidencePacket, questions: JevQuestions, scenario: MockScenario): JevAnswers {
  const { catalog, listing, checks } = state;
  const contradicted = catalog.reasons.includes("brand_contradicted");
  const options = Object.keys(questions.product_choice.criteria);
  const distribution = (pick: string, p: number, second?: string, q = 0) => {
    const rest = (1 - p - q) / Math.max(1, options.length - (second ? 2 : 1));
    return Object.fromEntries(options.map((key) => [key, key === pick ? p : key === second ? q : rest]));
  };
  let choice: ChoiceAnswer;
  if (scenario === "ambiguous_scores" && catalog.candidates.length >= 2) {
    choice = { type: "choice", choice: "candidate_1", probabilities: distribution("candidate_1", 0.51, "candidate_2", 0.45) };
  } else if (contradicted) {
    choice = { type: "choice", choice: "CONFLICTING_INFORMATION", probabilities: distribution("CONFLICTING_INFORMATION", 0.72) };
  } else if (catalog.candidates.length === 0) {
    choice = { type: "choice", choice: "NONE_OF_THE_ABOVE", probabilities: distribution("NONE_OF_THE_ABOVE", 0.8) };
  } else if (catalog.decision === "CONFLICTING" && catalog.candidates.length >= 2) {
    choice = { type: "choice", choice: "candidate_1", probabilities: distribution("candidate_1", 0.49, "candidate_2", 0.46) };
  } else if (catalog.decision === "FAMILY" || !catalog.top_option) {
    choice = { type: "choice", choice: "INSUFFICIENT_INFORMATION", probabilities: distribution("INSUFFICIENT_INFORMATION", 0.6, catalog.top_option ?? undefined, 0.3) };
  } else {
    const p = catalog.tier === "AUTO" ? 0.97 : 0.7;
    choice = { type: "choice", choice: catalog.top_option, probabilities: distribution(catalog.top_option, p) };
  }
  const descriptionLength = listing.description.trim().length;
  const attributeCount = Object.keys(listing.attributes).length;
  const detail = descriptionLength < 40 ? 0 : descriptionLength < 80 ? 1 : attributeCount >= 2 || descriptionLength >= 160 ? 3 : 2;
  return {
    product_choice: choice,
    evidence_sufficient: { type: "boolean", probability: catalog.tier === "AUTO" && !contradicted ? 0.95 : catalog.tier === "REVIEW" ? 0.45 : 0.15 },
    material_conflict: { type: "boolean", probability: contradicted ? 0.88 : 0.04 },
    detail_quality: { type: "score", score: detail },
    suspicious_text: { type: "boolean", probability: checks.text_signals.includes("instruction_like") ? 0.9 : checks.text_signals.length ? 0.4 : 0.03 },
  };
}
