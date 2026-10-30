import { NextResponse, type NextRequest } from "next/server";
import { fetchCatalogPage, fetchDescubrirPage } from "@/lib/catalog";
import { DESCUBRIR_PHOTOS, limaMidnight, readSince } from "@/lib/descubrir";
import { reservedCardIds } from "@/lib/listing-reservations-server";
import { parseListingFilters } from "@/lib/listings";
import { parsePage } from "@/lib/pagination";
import { READ_BUDGETS, createDeadline } from "@/lib/request-deadline";
import { createPublicReadClient } from "@/lib/supabase/public-read-client";

export const maxDuration = 30;

// FIND 15: one more page of catalog cards for "Ver 24 más" on phones. Public data through the public read client, the
// same query as the catalog page, bounded by the route's deadline (and cancelled when the visitor leaves).
// Descubrir (big-02) reads its next screens here too: `fotos=todas` brings each listing's photos (up to ten) and
// `desde` (a Lima day, at most 31 days back) keeps "Lo nuevo" to its window; `total` is the page's count. talk-06:
// `reserved` names the cards that say "Reservado" (optional: empty when that read is off or failed).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const record = Object.fromEntries([...new Set(params.keys())].map((key) => [key, params.getAll(key)]));
  const since = readSince(params.get("desde"), Date.now());
  if (since === "invalid") return NextResponse.json({ listings: [], reserved: [] }, { status: 400 });
  const deadline = createDeadline(READ_BUDGETS.routeMs, request.signal);
  const supabase = createPublicReadClient(deadline);
  if (!supabase) return NextResponse.json({ listings: [], reserved: [] }, { status: 503 });
  const filters = parseListingFilters(record);
  const page = parsePage(record.page);
  const descubrir = params.get("fotos") === "todas" || since !== null;
  const { data, count, error } = await (descubrir
    ? fetchDescubrirPage(supabase, filters, page, { photos: params.get("fotos") === "todas" ? DESCUBRIR_PHOTOS : 1, publishedSince: since ? limaMidnight(since) : undefined })
    : fetchCatalogPage(supabase, filters, page));
  // Inventory can shrink between pages. PostgREST's range error ends this page without a retry/count read;
  // its failed response has no reliable total, and must not cache an empty page over newly published inventory.
  if (page > 1 && error?.code === "PGRST103") {
    return NextResponse.json(
      { listings: [], total: null, reserved: [] },
      { headers: { "cache-control": "private, no-store" } },
    );
  }
  if (error) return NextResponse.json({ listings: [], reserved: [] }, { status: 502 });
  const reserved = await reservedCardIds(data ?? [], deadline);
  return NextResponse.json(
    { listings: data ?? [], total: count ?? null, reserved: [...reserved] },
    { headers: { "cache-control": "public, max-age=30" } },
  );
}
