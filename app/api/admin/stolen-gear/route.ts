import { NextResponse } from "next/server";
import { isEntityId } from "@/lib/marketplace-event-payload";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// safe-02 (accounts batch): Admin reviews a match ("Coincide" e-mails the reporter once, without naming the listing or
// the seller; "No coincide" closes it) or sets aside a report that is not credible, with a reason, and reopens it.
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return failure("Solicitud inválida.", 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !isEntityId(body.id)) return failure("Solicitud inválida.");
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  const supabase = await getSupabaseServerClient();
  if (!supabase) return failure("No se pudo validar tu cuenta.", 503);

  if (body.kind === "match" && ["confirmed", "dismissed"].includes(body.status)) {
    const { data, error } = await supabase.rpc("admin_review_stolen_match", { p_match_id: body.id, p_status: body.status, p_note: note || null });
    if (error) return failure(error.code === "42501" ? "Solo Admin." : "Esta coincidencia ya se revisó.", error.code === "42501" ? 403 : 409);
    return NextResponse.json({ ok: true, result: data }, { headers: { "Cache-Control": "no-store" } });
  }
  if (body.kind === "report" && ["active", "rejected"].includes(body.status)) {
    if (body.status === "rejected" && note.length < 3) return failure("Indica el motivo.");
    const { error } = await supabase.rpc("admin_set_stolen_report_status", { p_report_id: body.id, p_status: body.status, p_reason: note || null });
    if (error) return failure(error.code === "42501" ? "Solo Admin." : "No se pudo cambiar el reporte.", error.code === "42501" ? 403 : 400);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }
  return failure("Solicitud inválida.");
}

function failure(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}
