import { NextResponse } from "next/server";
import { callStructured, getAiClient } from "@/lib/ai/claude";
import { AI_LIMITS, aiHelpersEnabled, aiModel } from "@/lib/ai/config";
import {
  LISTING_ASSIST_MAX_BODY_BYTES,
  LISTING_ASSIST_MAX_PHOTOS,
  LISTING_ASSIST_MAX_PHOTO_BYTES,
  LISTING_ASSIST_PHOTO_SIDE,
  jpegSize,
  listingAssistSchema,
  listingAssistSystemPrompt,
  parseListingSuggestion,
} from "@/lib/ai/listing-assist";
import { allowAiCall, recordAiRequest, type AiOutcome } from "@/lib/ai/usage";
import { readBodyWithLimit } from "@/lib/request-body";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// big-07, "Completar con IA" (docs/ux-effortless/maybes-ai.md): up to four photos the seller's browser already shrank
// to JPEGs of at most 1024 pixels, sent only when the seller taps the button. Nothing is stored: the photos go to the
// model and the suggestion comes back, checked against the site's registries (lib/ai/listing-assist.ts).

// One attempt of up to 50 seconds: two would not fit in the 60 seconds the site's longest routes take. On Opus the
// API's own fallback (lib/ai/claude.ts) covers an overloaded model within that one request.
export const maxDuration = 60;

const LIMIT_RESET = "Se renueva a las 7 p. m., hora de Lima.";

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });
}

function photosFrom(text: string | null): string[] | null {
  if (!text) return null;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  const photos = (body as { photos?: unknown } | null)?.photos;
  if (!Array.isArray(photos) || photos.length < 1 || photos.length > LISTING_ASSIST_MAX_PHOTOS) return null;
  for (const photo of photos) {
    if (typeof photo !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo)) return null;
    const bytes = Buffer.from(photo, "base64");
    const size = jpegSize(bytes);
    // A few pixels of leeway for the browser's rounding.
    if (bytes.length > LISTING_ASSIST_MAX_PHOTO_BYTES || !size || Math.max(size.width, size.height) > LISTING_ASSIST_PHOTO_SIDE + 8) return null;
  }
  return photos as string[];
}

export async function POST(request: Request) {
  if (!aiHelpersEnabled()) return failure(404, "AI_OFF", "Esta ayuda no está disponible.");
  const photos = photosFrom(await readBodyWithLimit(request, LISTING_ASSIST_MAX_BODY_BYTES));
  if (!photos) {
    return failure(400, "AI_PHOTOS_INVALID", `Envía de 1 a ${LISTING_ASSIST_MAX_PHOTOS} fotos JPEG reducidas. Vuelve a tocar Completar con IA.`);
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) return failure(503, "UNAVAILABLE", "No se pudo validar tu cuenta.");
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return failure(401, "AUTH_REQUIRED", "Ingresa a tu cuenta.");

  const allowance = await allowAiCall("listing_assist", user.id);
  if (allowance === "limited") return failure(429, "AI_LIMIT", `Ya usaste las ${AI_LIMITS.listingAssist.limit} ayudas de hoy. ${LIMIT_RESET}`);
  if (allowance === "site_limited") return failure(429, "AI_SITE_LIMIT", `La ayuda con IA llegó a su límite de hoy. ${LIMIT_RESET}`);
  const client = allowance === "allowed" ? await getAiClient() : null;
  if (!client) return failure(503, "AI_UNAVAILABLE", "No pudimos sugerir datos en este momento. Completa los campos a mano o vuelve a intentarlo en unos minutos.");

  const result = await callStructured(client, aiModel(), {
    system: listingAssistSystemPrompt(),
    content: [
      ...photos.map((data) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } })),
      { type: "text", text: "Fotos del instrumento o equipo que quiero publicar en Laria." },
    ],
    schema: listingAssistSchema(),
    effort: "medium",
    maxTokens: 8000,
    timeoutMs: 50_000,
    retries: 0,
  }, "listing_assist");
  const suggestion = result.status === "ok" ? parseListingSuggestion(result.data) : null;
  const outcome: AiOutcome = result.status !== "ok" ? result.status : !suggestion ? "invalid" : suggestion.recognized ? "answered" : "no_match";
  await recordAiRequest({
    feature: "listing_assist",
    userId: user.id,
    storeId: null,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    outcome,
  });

  if (suggestion) return NextResponse.json({ ok: true, suggestion }, { headers: { "Cache-Control": "no-store" } });
  if (outcome === "refused") return failure(422, "AI_REFUSED", "No pudimos sugerir datos para estas fotos. Completa los campos a mano.");
  return failure(503, "AI_UNAVAILABLE", "No pudimos sugerir datos en este momento. Completa los campos a mano o vuelve a intentarlo en unos minutos.");
}
