import { NextResponse } from "next/server";
import { isEntityId } from "@/lib/marketplace-event-payload";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// safe-05 (accounts batch): Admin marks a photo-copy flag "Es una copia" or "No es copia". The listing itself changes
// only through the usual moderation buttons.
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return failure("Solicitud inválida.", 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !isEntityId(body.id) || !["confirmed", "dismissed"].includes(body.status)) {
    return failure("Solicitud inválida.");
  }
  const supabase = await getSupabaseServerClient();
  if (!supabase) return failure("No se pudo validar tu cuenta.", 503);
  const { error } = await supabase.rpc("admin_review_red_flag", {
    p_flag_id: body.id,
    p_status: body.status,
    p_note: typeof body.note === "string" ? body.note.slice(0, 500) : null,
  });
  if (error) return failure(error.code === "42501" ? "Solo Admin." : "Esta alerta ya se revisó.", error.code === "42501" ? 403 : 409);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

function failure(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}
