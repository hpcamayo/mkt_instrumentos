import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { supportsServerFallback } from "@/lib/ai/config";

// The one place Laria calls Claude (UX-Effortless maybes). A request asks for a JSON answer that follows a schema
// (structured outputs, output_config.format), sets how much the model thinks with output_config.effort (thinking is
// adaptive and always on in Claude Opus 5.5, so there is no thinking field) and sends no sampling parameters, which the
// API version of the SDK pinned here rejects. A policy decline arrives as stop_reason "refusal" and is checked before
// any content is read; on models that have one, the API first retries it on Anthropic's recommended model
// (fallbacks: "default").

type CreateParams = Anthropic.Beta.MessageCreateParamsNonStreaming;
type AiResponse = Anthropic.Beta.BetaMessage;

// What the routes need of a client: the real SDK's, or a fake in the tests and in local screenshots.
export type AiClient = {
  beta: { messages: { create(params: CreateParams, options?: { timeout?: number; maxRetries?: number }): PromiseLike<AiResponse> } };
};

let client: AiClient | null = null;

// The fake answers only under `next dev` with LARIA_AI_FAKE=1 (local screenshots). In a production build the condition
// is false at compile time, so the fake isn't even bundled, and next.config.ts refuses to build with LARIA_AI_FAKE set.
export async function getAiClient(): Promise<AiClient | null> {
  if (process.env.NODE_ENV !== "production" && process.env.LARIA_AI_FAKE === "1") {
    return (await import("@/lib/ai/fake-client")).fakeAiClient;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  client ??= new Anthropic({ apiKey });
  return client;
}

export type StructuredCall = {
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: Record<string, unknown>;
  effort: "low" | "medium";
  // Thinking counts toward it, so it leaves room for that as well as the answer.
  maxTokens: number;
  timeoutMs: number;
};

export function structuredRequest(model: string, call: StructuredCall): CreateParams {
  return {
    model,
    max_tokens: call.maxTokens,
    system: call.system,
    messages: [{ role: "user", content: call.content }],
    output_config: { effort: call.effort, format: { type: "json_schema", schema: call.schema } },
    ...(supportsServerFallback(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  };
}

export type StructuredResult = {
  status: "ok" | "refused" | "invalid" | "failed";
  // The model that answered (a fallback's when one did), else the one asked.
  model: string;
  inputTokens: number;
  outputTokens: number;
  data?: unknown;
};

// Every attempt is billed (usage.iterations: the model's and a fallback's), so the log adds them up.
function tokensOf(usage: AiResponse["usage"]) {
  const attempts = (usage?.iterations ?? []).filter((entry) => entry.type === "message" || entry.type === "fallback_message");
  const total = (input: number, cacheWrite: number | null, cacheRead: number | null) => input + (cacheWrite ?? 0) + (cacheRead ?? 0);
  if (attempts.length) {
    return attempts.reduce((sum, entry) => ({
      input: sum.input + total(entry.input_tokens, entry.cache_creation_input_tokens, entry.cache_read_input_tokens),
      output: sum.output + entry.output_tokens,
    }), { input: 0, output: 0 });
  }
  return { input: total(usage?.input_tokens ?? 0, usage?.cache_creation_input_tokens ?? null, usage?.cache_read_input_tokens ?? null), output: usage?.output_tokens ?? 0 };
}

export async function callStructured(ai: AiClient, model: string, call: StructuredCall, label: string): Promise<StructuredResult> {
  let response: AiResponse;
  try {
    response = await ai.beta.messages.create(structuredRequest(model, call), { timeout: call.timeoutMs, maxRetries: 1 });
  } catch (error) {
    // Never the request or the answer: only what kind of failure it was.
    console.warn("ai-call-failed", label, error instanceof Anthropic.APIError ? `status ${error.status ?? "none"}` : error instanceof Error ? error.name : "unknown");
    return { status: "failed", model, inputTokens: 0, outputTokens: 0 };
  }
  const tokens = tokensOf(response.usage);
  const result = { model: typeof response.model === "string" && response.model ? response.model : model, inputTokens: tokens.input, outputTokens: tokens.output };
  if (response.stop_reason === "refusal") {
    console.warn("ai-call-refused", label, response.stop_details?.category ?? "none");
    return { status: "refused", ...result };
  }
  // A cut-off answer (max_tokens) or any other stop is not a complete JSON answer. A response can start with thinking
  // blocks, so the answer is the last text block.
  const text = response.stop_reason === "end_turn"
    ? [...response.content].reverse().find((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    : undefined;
  if (!text) return { status: "invalid", ...result };
  try {
    return { status: "ok", ...result, data: JSON.parse(text.text) };
  } catch {
    return { status: "invalid", ...result };
  }
}
