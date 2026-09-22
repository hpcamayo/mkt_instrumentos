import { NextResponse } from "next/server";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { searchAlertFiltersAsJson, type SearchAlertFilters } from "@/lib/search-alerts";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return response("Solicitud inválida.", 403);
  const body = await request.json().catch(() => null);
  const supabase = await getSupabaseServerClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: null };
  if (!supabase || !data?.user) return response("Ingresa para administrar alertas.", 401);

  if (body?.action === "create") {
    if (!isRecord(body.filters) || !["immediate", "daily"].includes(body.frequency)) return response("Revisa la búsqueda y la frecuencia.", 400);
    const { data: alert, error } = await supabase.rpc("create_saved_search_alert", {
      p_filters: searchAlertFiltersAsJson(body.filters as SearchAlertFilters),
      p_frequency: body.frequency,
    });
    if (error) {
      if (error.message.includes("ALERT_ALREADY_EXISTS")) return response("Ya guardaste esta búsqueda. Puedes administrarla en Alertas.", 409);
      if (error.message.includes("ALERT_FILTERS_INVALID") || error.message.includes("ALERT_FREQUENCY_INVALID")) return response("La búsqueda no contiene filtros compatibles.", 400);
      return response("No pudimos crear la alerta. Intenta nuevamente.", 503);
    }
    return NextResponse.json({ alert }, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (!uuidPattern.test(body?.id ?? "")) return response("Solicitud inválida.", 400);
  if (body.action === "status" && typeof body.active === "boolean") {
    const { error } = await supabase.rpc("set_saved_search_alert_status", { p_alert_id: body.id, p_active: body.active });
    if (error) return alertActionError(error.message);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (body.action === "delete") {
    const { error } = await supabase.rpc("delete_saved_search_alert", { p_alert_id: body.id });
    if (error) return alertActionError(error.message);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  }
  return response("Solicitud inválida.", 400);
}

function alertActionError(message: string) {
  return response(message.includes("ALERT_NOT_OWNED") ? "La alerta ya no está disponible." : "No pudimos actualizar la alerta.", message.includes("ALERT_NOT_OWNED") ? 404 : 503);
}

function response(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
