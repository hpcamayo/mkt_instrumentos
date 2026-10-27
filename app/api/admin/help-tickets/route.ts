import { NextResponse } from "next/server";
import { isEntityId } from "@/lib/marketplace-event-payload";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// safe-10 (accounts batch): Admin answers, closes or reopens a help-center question. The database checks the Admin role
// and e-mails the answer when the question came from an account; otherwise it returns the address to answer by hand.
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return failure("Solicitud inválida.", 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || !isEntityId(body.ticketId)
    || !["answer", "answer_close", "close", "reopen"].includes(body.action)) {
    return failure("Solicitud inválida.");
  }
  const supabase = await getSupabaseServerClient();
  if (!supabase) return failure("No se pudo validar tu cuenta.", 503);

  if (body.action === "answer" || body.action === "answer_close") {
    const answer = typeof body.answer === "string" ? body.answer.trim().slice(0, 4000) : "";
    if (answer.length < 3) return failure("Escribe la respuesta.");
    const { data, error } = await supabase.rpc("admin_answer_help_ticket", { p_ticket_id: body.ticketId, p_answer: answer, p_close: body.action === "answer_close" });
    if (error) return failure(error.code === "42501" ? "Solo Admin puede responder." : "No se pudo guardar la respuesta.", error.code === "42501" ? 403 : 400);
    return NextResponse.json({ ok: true, result: data }, { headers: { "Cache-Control": "no-store" } });
  }
  const { error } = await supabase.rpc("admin_set_help_ticket_status", { p_ticket_id: body.ticketId, p_status: body.action === "close" ? "cerrado" : "abierto" });
  if (error) return failure(error.code === "42501" ? "Solo Admin puede cambiar el estado." : "No se pudo cambiar el estado.", error.code === "42501" ? 403 : 400);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

function failure(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}
