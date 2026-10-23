import { NextResponse } from "next/server";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

const NO_STORE = { "Cache-Control": "private, no-store" };

// save-07: the "Correos" settings page. Saves the two e-mail choices, or pauses every active alert at once.
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return NextResponse.json({ message: "Solicitud inválida." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const client = await getSupabaseServerClient();
  const { data } = client ? await client.auth.getUser() : { data: null };
  if (!client || !data?.user) return NextResponse.json({ message: "Ingresa para cambiar tus correos." }, { status: 401, headers: NO_STORE });

  if (body?.action === "pause_alerts") {
    const { data: alerts, error } = await client.from("saved_search_alerts").select("id").eq("user_id", data.user.id).eq("status", "active").is("deleted_at", null);
    if (error) return NextResponse.json({ message: "No pudimos pausar tus alertas." }, { status: 503, headers: NO_STORE });
    for (const alert of alerts ?? []) {
      const { error: pauseError } = await client.rpc("set_saved_search_alert_status", { p_alert_id: alert.id, p_active: false });
      if (pauseError) return NextResponse.json({ message: "No pudimos pausar todas tus alertas. Intenta nuevamente." }, { status: 503, headers: NO_STORE });
    }
    return NextResponse.json({ paused: alerts?.length ?? 0 }, { headers: NO_STORE });
  }

  if (typeof body?.priceDrops !== "boolean" || typeof body?.followDigest !== "boolean") return NextResponse.json({ message: "Solicitud inválida." }, { status: 400, headers: NO_STORE });
  const { error } = await client.rpc("set_email_preferences", { p_price_drop_emails: body.priceDrops, p_follow_digest_emails: body.followDigest });
  if (error) return NextResponse.json({ message: "No pudimos guardar el cambio. Intenta nuevamente." }, { status: 503, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
