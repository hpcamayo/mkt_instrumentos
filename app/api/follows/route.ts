import { NextResponse } from "next/server";
import { parseAccountFollows, parseFollowedArrivals } from "@/lib/follows";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

const NO_STORE = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// save-12: follow or stop following a store or a brand; "list" returns what the account follows and "arrivals" what
// those stores and brands published in the last two weeks (the home's "Nuevo de lo que sigues").
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return NextResponse.json({ message: "Solicitud inválida." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const client = await getSupabaseServerClient();
  const { data } = client ? await client.auth.getUser() : { data: null };
  if (!client || !data?.user) return NextResponse.json({ message: "Ingresa para seguir tiendas y marcas." }, { status: 401, headers: NO_STORE });

  if (body?.action === "list") {
    const { data: rows, error } = await client.rpc("get_account_follows");
    if (error) return NextResponse.json({ message: "No pudimos cargar lo que sigues." }, { status: 503, headers: NO_STORE });
    return NextResponse.json({ follows: parseAccountFollows(rows) }, { headers: NO_STORE });
  }
  if (body?.action === "arrivals") {
    const { data: rows, error } = await client.rpc("get_followed_arrivals", { p_limit: 8, p_days: 14 });
    if (error) return NextResponse.json({ message: "No pudimos cargar lo que sigues." }, { status: 503, headers: NO_STORE });
    return NextResponse.json({ arrivals: parseFollowedArrivals(rows) }, { headers: NO_STORE });
  }

  const storeId = typeof body?.storeId === "string" && uuid.test(body.storeId) ? body.storeId : null;
  const brand = typeof body?.brand === "string" && body.brand.trim() && body.brand.length <= 80 ? body.brand.trim() : null;
  if ((storeId ? 1 : 0) + (brand ? 1 : 0) !== 1 || typeof body?.follow !== "boolean") return NextResponse.json({ message: "Solicitud inválida." }, { status: 400, headers: NO_STORE });
  const { error } = await client.rpc("set_follow", { p_store_id: storeId, p_brand: brand, p_follow: body.follow });
  if (error) {
    const message = error.message.includes("FOLLOW_SELF_NOT_ALLOWED") ? "No puedes seguir tu propia tienda."
      : error.message.includes("FOLLOW_UNAVAILABLE") ? "Esta tienda ya no está disponible."
      : "No pudimos guardar el cambio. Intenta nuevamente.";
    return NextResponse.json({ message }, { status: error.message.includes("FOLLOW_") ? 400 : 503, headers: NO_STORE });
  }
  return NextResponse.json({ following: body.follow }, { headers: NO_STORE });
}
