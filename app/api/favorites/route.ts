import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";
import { isFavoriteListingId, parsePublicListingCards } from "@/lib/favorites";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";

const NO_STORE = { "Cache-Control": "private, no-store" };
const isSlug = (value: unknown): value is string => typeof value === "string" && value.length <= 200 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return NextResponse.json({ message: "Solicitud inválida." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const client = await getSupabaseServerClient();
  if (!client) return NextResponse.json({ message: "No se pudieron cargar los favoritos." }, { status: 503 });

  // big-04: cards for favorites saved on this device and listings viewed on it. Public data, no account needed.
  if (body?.action === "cards") {
    const ids = Array.isArray(body.ids) ? body.ids.filter(isFavoriteListingId).slice(0, 100) : [];
    const slugs = Array.isArray(body.slugs) ? body.slugs.filter(isSlug).slice(0, 30) : [];
    if (!ids.length && !slugs.length) return NextResponse.json({ cards: [] }, { headers: NO_STORE });
    const { data, error } = await client.rpc("get_public_listing_cards", { p_ids: ids, p_slugs: slugs });
    if (error) return NextResponse.json({ message: "No se pudieron cargar los favoritos." }, { status: 503 });
    return NextResponse.json({ cards: parsePublicListingCards(data) }, { headers: NO_STORE });
  }

  const { data } = await client.auth.getUser();
  if (!data?.user) return NextResponse.json({ message: "Ingresa para guardar favoritos." }, { status: 401 });
  if (body?.action === "states" && Array.isArray(body.ids) && body.ids.length <= 100 && body.ids.every(isFavoriteListingId)) {
    const { data: rows, error } = await client.from("favorites").select("listing_id").eq("user_id", data.user.id).in("listing_id", [...new Set<string>(body.ids)]);
    if (error) return NextResponse.json({ message: "No se pudieron cargar los favoritos." }, { status: 503 });
    return NextResponse.json({ saved: (rows ?? []).map((row) => row.listing_id) }, { headers: NO_STORE });
  }
  // big-04: at sign-in, the favorites saved on the device join the account.
  if (body?.action === "merge" && Array.isArray(body.ids) && body.ids.length <= 100 && body.ids.every(isFavoriteListingId)) {
    const { data: added, error } = await client.rpc("merge_device_favorites", { p_ids: body.ids });
    if (error) return NextResponse.json({ message: "No se pudieron guardar tus favoritos." }, { status: 503 });
    return NextResponse.json({ added: added ?? 0 }, { headers: NO_STORE });
  }
  // save-11: a note per favorite.
  if (body?.action === "note" && isFavoriteListingId(body.id) && typeof body.note === "string" && body.note.length <= 280) {
    const { data: note, error } = await client.rpc("set_favorite_note", { p_listing_id: body.id, p_note: body.note });
    if (error) return NextResponse.json({ message: "No se pudo guardar la nota." }, { status: 409 });
    return NextResponse.json({ note }, { headers: NO_STORE });
  }
  if (body?.action !== "set" || !isFavoriteListingId(body.id) || typeof body.saved !== "boolean") return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  const { data: saved, error } = await client.rpc("set_listing_favorite", { p_listing_id: body.id, p_saved: body.saved });
  if (error) {
    const message = error.message.includes("FAVORITE_SELF_NOT_ALLOWED") ? "No puedes guardar tu propia publicación."
      : error.message.includes("FAVORITE_UNAVAILABLE") ? "Esta publicación ya no está disponible para guardar."
        : "No se pudo guardar el favorito. Intenta nuevamente.";
    return NextResponse.json({ message }, { status: 409 });
  }
  return NextResponse.json({ saved }, { headers: NO_STORE });
}
