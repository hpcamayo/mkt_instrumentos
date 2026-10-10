import "server-only";

import { experimental_decide } from "ai";
import type { DecisionProvider } from "@/lib/catalog-intelligence/decision-provider";

// The real Jev adapter: Laria (server) -> AI SDK experimental_decide -> Vercel AI Gateway -> TypeSafe Jev.
// The gateway reads AI_GATEWAY_API_KEY (or Vercel OIDC) from the environment. Retries are bounded by
// callDecisionProvider(), so the SDK's own retries are turned off here.
//
// NOT EXERCISED: no gateway credentials were available while building the prototype, so this adapter has never
// received a real response. The SDK types it is written against are ai@7.0.137.

export const DEFAULT_JEV_MODEL = "typesafe-ai/jev";

export function createJevGatewayProvider(modelId: string = DEFAULT_JEV_MODEL): DecisionProvider {
  return {
    id: "vercel-ai-gateway",
    model: modelId,
    mock: false,
    async decide(state, questions, { signal }) {
      const result = await experimental_decide({
        model: modelId,
        state: state as unknown as Parameters<typeof experimental_decide>[0]["state"],
        questions,
        maxRetries: 0,
        abortSignal: signal,
      });
      return {
        answers: result.answers,
        requestId: result.response.id ?? null,
        modelId: result.response.modelId ?? modelId,
        usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens },
      };
    },
  };
}
