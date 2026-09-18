import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";
import { isFavoriteListingId } from "@/lib/favorites";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";

export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return NextResponse.json({ message: "Solicitud inválida." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const client = await getSupabaseServerClient();
  const { data } = client ? await client.auth.getUser() : { data: null };
  if (!client || !data?.user) return NextResponse.json({ message: "Ingresa para guardar favoritos." }, { status: 401 });
  if (body?.action === "states" && Array.isArray(body.ids) && body.ids.length <= 100 && body.ids.every(isFavoriteListingId)) {
    const { data: rows, error } = await client.from("favorites").select("listing_id").eq("user_id", data.user.id).in("listing_id", [...new Set<string>(body.ids)]);
    if (error) return NextResponse.json({ message: "No se pudieron cargar los favoritos." }, { status: 503 });
    return NextResponse.json({ saved: (rows ?? []).map((row) => row.listing_id) }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (body?.action !== "set" || !isFavoriteListingId(body.id) || typeof body.saved !== "boolean") return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  const { data: saved, error } = await client.rpc("set_listing_favorite", { p_listing_id: body.id, p_saved: body.saved });
  if (error) {
    const message = error.message.includes("FAVORITE_SELF_NOT_ALLOWED") ? "No puedes guardar tu propia publicación."
      : error.message.includes("FAVORITE_UNAVAILABLE") ? "Esta publicación ya no está disponible para guardar."
        : "No se pudo guardar el favorito. Intenta nuevamente.";
    return NextResponse.json({ message }, { status: 409 });
  }
  return NextResponse.json({ saved }, { headers: { "Cache-Control": "private, no-store" } });
}
