import { NextResponse } from "next/server";
import { callStructured, getAiClient } from "@/lib/ai/claude";
import { AI_LIMITS, aiHelpersEnabled, aiModel } from "@/lib/ai/config";
import {
  STORE_QUESTION_MAX,
  parseStoreAnswer,
  storeAnswerHref,
  storeQuestionSchema,
  storeQuestionSystemPrompt,
} from "@/lib/ai/store-question";
import { allowAiCall, recordAiRequest, type AiOutcome } from "@/lib/ai/usage";
import { readBodyWithLimit } from "@/lib/request-body";
import { getInventorySummary } from "@/lib/store-inventory";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// stock-24, "Pregúntale a tu tienda" (docs/ux-effortless/maybes-ai.md): the owner of a store with Inventario asks in
// plain words and gets a link to the existing filters, a view of Estadísticas or Reposición. Only the question goes to
// the model, never the store's data; the answer is checked against the site's own lists (lib/ai/store-question.ts).

// Two attempts of up to 15 seconds each at most.
export const maxDuration = 40;

const LIMIT_RESET = "Se renueva a las 7 p. m., hora de Lima.";

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!aiHelpersEnabled()) return failure(404, "AI_OFF", "Esta ayuda no está disponible.");
  const text = await readBodyWithLimit(request, 2048);
  let question = "";
  try {
    const body = text ? JSON.parse(text) : null;
    if (body && typeof body.question === "string") question = body.question.replace(/\s+/g, " ").trim();
  } catch {
    question = "";
  }
  if (question.length < 3 || question.length > STORE_QUESTION_MAX) {
    return failure(400, "AI_QUESTION_INVALID", `Escribe tu pregunta en hasta ${STORE_QUESTION_MAX} caracteres.`);
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) return failure(503, "UNAVAILABLE", "No se pudo validar tu cuenta.");
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return failure(401, "AUTH_REQUIRED", "Ingresa a tu cuenta.");
  const { data: store } = await supabase.rpc("get_own_store").select("id").maybeSingle();
  const summary = store ? await getInventorySummary(supabase) : null;
  if (!store || !summary?.inventory_enabled) {
    return failure(403, "AI_STORE_REQUIRED", "Pregúntale a tu tienda está disponible para tiendas con Inventario.");
  }

  const allowance = await allowAiCall("store_question", store.id);
  if (allowance === "limited") return failure(429, "AI_LIMIT", `Tu tienda ya hizo las ${AI_LIMITS.storeQuestion.limit} preguntas de hoy. ${LIMIT_RESET}`);
  if (allowance === "site_limited") return failure(429, "AI_SITE_LIMIT", `La ayuda con IA llegó a su límite de hoy. ${LIMIT_RESET}`);
  const client = allowance === "allowed" ? await getAiClient() : null;
  if (!client) return failure(503, "AI_UNAVAILABLE", "No pudimos responder en este momento. Usa los filtros o vuelve a intentarlo en unos minutos.");

  const result = await callStructured(client, aiModel(), {
    system: storeQuestionSystemPrompt(),
    content: [{ type: "text", text: question }],
    schema: storeQuestionSchema(),
    effort: "low",
    maxTokens: 2000,
    timeoutMs: 15_000,
    retries: 1,
  }, "store_question");
  const answer = result.status === "ok" ? parseStoreAnswer(result.data) : null;
  const href = answer ? storeAnswerHref(answer) : null;
  const outcome: AiOutcome = result.status !== "ok" ? result.status : !answer ? "invalid" : href ? "answered" : "no_match";
  await recordAiRequest({
    feature: "store_question",
    userId: user.id,
    storeId: store.id,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    outcome,
  });

  if (outcome === "answered") return NextResponse.json({ ok: true, href }, { headers: { "Cache-Control": "no-store" } });
  if (outcome === "no_match") {
    return NextResponse.json({
      ok: true,
      href: null,
      message: "No encontré filtros de Inventario ni de Estadísticas para esa pregunta. Prueba, por ejemplo, con «guitarras agotadas» o «lo más visto esta semana».",
    }, { headers: { "Cache-Control": "no-store" } });
  }
  if (outcome === "refused") return failure(422, "AI_REFUSED", "No pudimos responder esa pregunta. Escríbela con otras palabras o usa los filtros.");
  return failure(503, "AI_UNAVAILABLE", "No pudimos responder en este momento. Usa los filtros o vuelve a intentarlo en unos minutos.");
}
