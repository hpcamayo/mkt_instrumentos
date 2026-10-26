import { NextResponse } from "next/server";
import { isEntityId } from "@/lib/marketplace-event-payload";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

const NO_STORE = { "Cache-Control": "private, no-store" };

// safe-02 (accounts batch): "Lo recuperé" or "Retirar reporte" on the reporter's own report.
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return NextResponse.json({ message: "Solicitud no permitida." }, { status: 403, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as { id?: unknown; status?: unknown } | null;
  if (!isEntityId(body?.id) || (body?.status !== "recovered" && body?.status !== "withdrawn")) {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400, headers: NO_STORE });
  }
  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ message: "No pudimos conectar con Laria." }, { status: 503, headers: NO_STORE });
  const { error } = await supabase.rpc("set_my_stolen_report_status", { p_report_id: body.id, p_status: body.status });
  if (error) return NextResponse.json({ message: "Este reporte ya no está activo." }, { status: 409, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
