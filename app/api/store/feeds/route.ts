import { NextResponse } from "next/server";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { storeReachDb, storeReachErrorMessage } from "@/lib/store-reach-db";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// reach-02 "Catálogo para redes": the owner turns the store's feed on or off. The database binds the store to the
// signed-in owner and turns it on only for an active store.
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return failure("Solicitud inválida.", 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "enabled") || typeof body.enabled !== "boolean") {
    return failure("Solicitud inválida.");
  }
  const supabase = await getSupabaseServerClient();
  if (!supabase) return failure("No se pudo validar tu cuenta.", 503);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return failure("Ingresa a tu cuenta.", 401);
  const { data, error } = await storeReachDb(supabase).rpc("set_store_feed_enabled", { p_enabled: body.enabled });
  if (error) return failure(storeReachErrorMessage(error, "No se pudo guardar. Intenta nuevamente."));
  return NextResponse.json({ ok: true, settings: data }, { headers: { "Cache-Control": "no-store" } });
}

function failure(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}
