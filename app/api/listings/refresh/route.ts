import { NextResponse } from "next/server";
import { dropCachedListingPages } from "@/lib/listing-cache";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 100;

// Launch audit A19: changes made straight from the browser (lib/listing-page-refresh.ts) ask here to drop the cached
// pages that show the listings they changed (lib/listing-cache.ts). Listings come by id, or by the id of a revision
// Admin just decided. Only a listing's owner or Admin can ask for it, so nobody else can make Laria rebuild pages at
// will; anything else is skipped without saying why.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const listingIds = readIds(body?.listings);
  const revisionIds = readIds(body?.revisions);
  if (!listingIds || !revisionIds || !listingIds.length && !revisionIds.length || listingIds.length + revisionIds.length > MAX_IDS) {
    return failure("Solicitud inválida.", 400);
  }

  const supabase = await getSupabaseServerClient();
  const admin = getSupabaseAdminClient();
  if (!supabase || !admin) return failure("No se pudo actualizar la publicación.", 503);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return failure("Ingresa a tu cuenta.", 401);

  const ids = new Set(listingIds);
  if (revisionIds.length) {
    const { data, error } = await admin.from("listing_revisions").select("listing_id").in("id", revisionIds);
    if (error) return failure("No se pudo actualizar la publicación.", 503);
    for (const revision of data ?? []) ids.add(revision.listing_id);
  }
  if (!ids.size) return NextResponse.json({ refreshed: 0 });

  const { data: listings, error } = await admin.from("listings").select("owner_user_id").in("id", [...ids]);
  if (error) return failure("No se pudo actualizar la publicación.", 503);
  const userId = userData.user.id;
  // Admin is only asked about when the caller doesn't own every listing.
  const isAdmin = (listings ?? []).every((listing) => listing.owner_user_id === userId)
    || (await supabase.rpc("is_admin")).data === true;
  const refreshed = (listings ?? []).filter((listing) => isAdmin || listing.owner_user_id === userId).length;
  if (refreshed) dropCachedListingPages();
  return NextResponse.json({ refreshed });
}

function readIds(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((id) => typeof id === "string" && UUID.test(id))) return null;
  return [...new Set(value as string[])];
}

function failure(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}
