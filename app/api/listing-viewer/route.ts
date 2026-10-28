import { NextResponse } from "next/server";
import { readReleaseWatch, reservationErrorMessage, setReleaseWatch } from "@/lib/listing-reservations";
import { isEntityId } from "@/lib/marketplace-event-payload";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

const PRIVATE = { "Cache-Control": "private, no-store" };
const VISITOR = { authenticated: false, owner: false, stockManaged: false, watching: false };

// What the signed-in viewer can do on one public listing page: the owner's shortcuts (mine-05) and whether they already
// asked "Avísame cuando vuelva" (list-11), or on a reserved listing (`reserved`) "Avísame si se libera" (talk-06). The
// page itself stays public and cacheable; this is asked after it loads. Ownership is the listing's owner account (a
// store listing's owner is the store owner), read through RLS.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !isEntityId(body.listingId)) return NextResponse.json({ message: "Solicitud inválida." }, { status: 400, headers: PRIVATE });
  const client = await getSupabaseServerClient();
  const { data } = client ? await client.auth.getUser() : { data: null };
  if (!client || !data?.user) return NextResponse.json(VISITOR, { headers: PRIVATE });
  const reserved = body.reserved === true;
  const [listingResult, watchResult, releaseWatching] = await Promise.all([
    client.from("listings").select("owner_user_id,stock_state").eq("id", body.listingId).maybeSingle(),
    client.rpc("get_listing_stock_watch", { p_listing_id: body.listingId }),
    reserved ? readReleaseWatch(client, body.listingId) : null,
  ]);
  const listing = listingResult.data;
  return NextResponse.json({
    authenticated: true,
    owner: Boolean(listing && listing.owner_user_id === data.user.id),
    // A listing whose stock Inventario controls is never marked sold from here (D-15).
    stockManaged: Boolean(listing && listing.stock_state !== null),
    watching: !watchResult.error && watchResult.data === true,
    ...(reserved ? { releaseWatching: releaseWatching === true } : {}),
  }, { headers: PRIVATE });
}

// "Avísame cuando vuelva" on and off (list-11); with `kind: "release"`, "Avísame si se libera" (talk-06).
export async function PUT(request: Request) {
  if (!sameOriginEventRequest(request)) return NextResponse.json({ message: "Solicitud inválida." }, { status: 403, headers: PRIVATE });
  const body = await request.json().catch(() => null);
  if (!body || !isEntityId(body.listingId) || typeof body.watch !== "boolean" || ![undefined, "release"].includes(body.kind)) return NextResponse.json({ message: "Solicitud inválida." }, { status: 400, headers: PRIVATE });
  const client = await getSupabaseServerClient();
  const { data } = client ? await client.auth.getUser() : { data: null };
  if (!client || !data?.user) return NextResponse.json({ message: "Ingresa para recibir el aviso." }, { status: 401, headers: PRIVATE });
  if (body.kind === "release") {
    const result = await setReleaseWatch(client, body.listingId, body.watch);
    if (result.error !== null) {
      const known = reservationErrorMessage(result.error);
      return NextResponse.json({ message: known ?? "No pudimos guardar el aviso. Intenta de nuevo." }, { status: known ? 409 : 503, headers: PRIVATE });
    }
    return NextResponse.json({ watching: result.data }, { headers: PRIVATE });
  }
  const { data: watching, error } = await client.rpc("set_listing_stock_watch", { p_listing_id: body.listingId, p_watch: body.watch });
  if (error) {
    const match = /^STOCK_WATCH_[A-Z_]+: ([\s\S]+)$/.exec(error.message);
    return NextResponse.json({ message: match ? match[1] : "No pudimos guardar el aviso. Intenta de nuevo." }, { status: match ? 409 : 503, headers: PRIVATE });
  }
  return NextResponse.json({ watching: watching === true }, { headers: PRIVATE });
}
