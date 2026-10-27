import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dropCachedListingPages } from "@/lib/listing-cache";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
// Two runs of the schedule, so a late run still sees a change; each change drops the pages once or twice.
const WINDOW_MS = 2 * 60 * 1000;

// Launch audit A19: runs every minute (vercel.json), CRON_SECRET-protected like the e-mail worker. When a listing or a
// store left public view in the last two minutes (a listing hidden, sold, archived, rejected or out of stock; a store
// hidden, rejected or no longer verified), whichever path changed it (its owner, Admin, Inventario, an import, a
// database function), every cached listing page and the home are dropped (lib/listing-cache.ts), so its card stops
// showing on other pages even when their rebuild fails. A quiet minute drops nothing. Other changes, such as a new
// price, show when each page rebuilds within the minute.
export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ message: "No autorizado." }, { status: 401, headers: NO_STORE });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ message: "Configuración incompleta." }, { status: 503, headers: NO_STORE });

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const [listings, stores] = await Promise.all([
    client.from("listings").select("id")
      .or("status.in.(hidden,sold,archived,rejected),stock_state.eq.out_of_stock")
      .gte("updated_at", since)
      .limit(1),
    client.from("stores").select("id")
      .or("status.in.(hidden,rejected),and(status.eq.active,is_verified.is.false)")
      .gte("updated_at", since)
      .limit(1),
  ]);
  const error = listings.error ?? stores.error;
  if (error) {
    // Without an answer nothing is dropped: the cached copies keep serving while the database recovers.
    console.error("public_pages_refresh_failure", error.message.slice(0, 200));
    return NextResponse.json({ message: "No se pudieron revisar los cambios." }, { status: 503, headers: NO_STORE });
  }

  const changed = { listings: listings.data?.length ?? 0, stores: stores.data?.length ?? 0 };
  const refreshed = changed.listings + changed.stores > 0;
  if (refreshed) {
    dropCachedListingPages();
    console.info("public_pages_refreshed", JSON.stringify(changed));
  }
  return NextResponse.json({ refreshed }, { headers: NO_STORE });
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  if (!expected || authorization.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authorization), Buffer.from(expected));
}
