import { NextResponse } from "next/server";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import type { DatabaseClient } from "@/lib/supabase/database";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";
import {
  isQuestionId,
  moderationReasonError,
  questionErrorCode,
  questionErrorMessage,
  questionErrorStatus,
  questionTextError,
  type ListingQuestionAction,
} from "@/lib/listing-questions";

// big-11: public questions on a listing. GET ?listingId= reads the Q&A and the caller's flags (signed in or not);
// POST { action: "ask" | "answer" | "hide" | "restore", listingId, … } writes through the database functions and
// answers with the refreshed Q&A. They run as the cookie-bound client; the database checks every permission.
const NO_STORE = { "Cache-Control": "private, no-store" };

async function client() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;
  // Refreshes an expired session, so the RPC sees the visitor's account.
  const { data } = await supabase.auth.getUser();
  return { db: supabase, userId: data?.user?.id ?? null };
}

async function readState(db: DatabaseClient, listingId: string) {
  const { data, error } = await db.rpc("get_listing_questions", { p_listing_id: listingId });
  // The raw RPC shape: the browser parses it with parseListingQuestions (parsing here too would hand it camelCase it
  // cannot read).
  return error ? null : (data ?? {});
}

export async function GET(request: Request) {
  const listingId = new URL(request.url).searchParams.get("listingId");
  if (!isQuestionId(listingId)) return message("Solicitud inválida.", 400);
  const session = await client();
  if (!session) return message("Las preguntas no están disponibles por ahora.", 503);
  const state = await readState(session.db, listingId);
  if (!state) return message("No pudimos cargar las preguntas.", 503);
  return NextResponse.json(state, { headers: NO_STORE });
}

export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return message("Solicitud inválida.", 403);
  const body = await request.json().catch(() => null);
  const action = body?.action as ListingQuestionAction | undefined;
  if (!action || !["ask", "answer", "hide", "restore"].includes(action) || !isQuestionId(body?.listingId)) {
    return message("Solicitud inválida.", 400);
  }
  const session = await client();
  if (!session) return message("Las preguntas no están disponibles por ahora.", 503);
  if (!session.userId) return message(action === "ask" ? "Ingresa para hacer una pregunta." : "Ingresa para continuar.", 401);

  let call: PromiseLike<{ error: { message: string } | null }>;
  if (action === "ask") {
    const text = typeof body.body === "string" ? body.body : "";
    const invalid = questionTextError(text, "question");
    if (invalid) return message(invalid, 400);
    call = session.db.rpc("ask_listing_question", { p_listing_id: body.listingId, p_body: text });
  } else {
    if (!isQuestionId(body.questionId)) return message("Solicitud inválida.", 400);
    if (action === "answer") {
      const text = typeof body.answer === "string" ? body.answer : "";
      const invalid = questionTextError(text, "answer");
      if (invalid) return message(invalid, 400);
      call = session.db.rpc("answer_listing_question", { p_question_id: body.questionId, p_answer: text });
    } else {
      const reason = typeof body.reason === "string" ? body.reason : "";
      const invalid = moderationReasonError(reason);
      if (invalid) return message(invalid, 400);
      call = session.db.rpc(action === "hide" ? "hide_listing_question" : "restore_listing_question", {
        p_question_id: body.questionId,
        p_reason: reason,
      });
    }
  }

  const { error } = await call;
  if (error) {
    const code = questionErrorCode(error.message);
    if (!code) console.error("listing-questions", action, error.message);
    return message(questionErrorMessage(error.message, action), questionErrorStatus(code));
  }
  const state = await readState(session.db, body.listingId);
  return NextResponse.json({ ok: true, state }, { headers: NO_STORE });
}

function message(text: string, status: number) {
  return NextResponse.json({ message: text }, { status, headers: NO_STORE });
}
