import { NextResponse } from "next/server";
import { dropListingPages } from "@/lib/listing-cache";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 100;
// The browser asks right after its change; a listing that hasn't changed lately has nothing new to show.
const RECENT_MS = 10 * 60 * 1000;

// Launch audit A19: changes made straight from the browser (lib/listing-page-refresh.ts) ask here to drop the cached
// pages of the listings they changed (lib/listing-cache.ts), so the owner or Admin sees the change on the next visit.
// Listings come by id, or by the id of a revision Admin just decided. Only listings the caller owns, or any for
// Admin, that changed in the last ten minutes count, and only their own pages are dropped, so nobody can make Laria
// rebuild other pages at will; anything else is skipped without saying why. Other pages that show the listing follow
// within the minute (app/api/internal/public-pages/refresh).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const allOwned = body?.owned === true;
  const listingIds = readIds(body?.listings);
  const revisionIds = readIds(body?.revisions);
  if (!listingIds || !revisionIds
    || (!allOwned && !listingIds.length && !revisionIds.length)
    || listingIds.length + revisionIds.length > MAX_IDS
    || (allOwned && (listingIds.length > 0 || revisionIds.length > 0))) {
    return failure("Solicitud inválida.", 400);
  }

  const supabase = await getSupabaseServerClient();
  const admin = getSupabaseAdminClient();
  if (!supabase || !admin) return failure("No se pudo actualizar la publicación.", 503);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return failure("Ingresa a tu cuenta.", 401);

  // Vacation mode changes every owned listing. Derive ownership from Auth, never from a supplied user id,
  // and paginate so Particular accounts with more than the API's row limit do not keep stale public pages.
  if (allOwned) {
    const slugs: string[] = [];
    const cutoff = new Date(Date.now() - RECENT_MS).toISOString();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.from("listings").select("slug")
        .eq("owner_user_id", userData.user.id).gte("updated_at", cutoff).order("id").range(offset, offset + 999);
      if (error) return failure("No se pudo actualizar la publicación.", 503);
      slugs.push(...(data ?? []).map((listing) => listing.slug));
      if (!data || data.length < 1000) break;
    }
    dropListingPages(slugs);
    return NextResponse.json({ refreshed: slugs.length });
  }

  const ids = new Set(listingIds);
  if (revisionIds.length) {
    const { data, error } = await admin.from("listing_revisions").select("listing_id").in("id", revisionIds);
    if (error) return failure("No se pudo actualizar la publicación.", 503);
    for (const revision of data ?? []) ids.add(revision.listing_id);
  }
  if (!ids.size) return NextResponse.json({ refreshed: 0 });

  const { data: listings, error } = await admin.from("listings").select("slug,owner_user_id,updated_at").in("id", [...ids]);
  if (error) return failure("No se pudo actualizar la publicación.", 503);
  const userId = userData.user.id;
  const recent = (listings ?? []).filter((listing) => Date.parse(listing.updated_at) >= Date.now() - RECENT_MS);
  // Admin is only asked about when the caller doesn't own every listing.
  const isAdmin = recent.every((listing) => listing.owner_user_id === userId)
    || (await supabase.rpc("is_admin")).data === true;
  const slugs = recent.filter((listing) => isAdmin || listing.owner_user_id === userId).map((listing) => listing.slug);
  dropListingPages(slugs);
  return NextResponse.json({ refreshed: slugs.length });
}

function readIds(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((id) => typeof id === "string" && UUID.test(id))) return null;
  return [...new Set(value as string[])];
}

function failure(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}
