import { NextResponse, type NextRequest } from "next/server";
import { fetchCatalogPage } from "@/lib/catalog";
import { reservedCardIds } from "@/lib/listing-reservations-server";
import { parseListingFilters } from "@/lib/listings";
import { parsePage } from "@/lib/pagination";
import { READ_BUDGETS, createDeadline } from "@/lib/request-deadline";
import { createPublicReadClient } from "@/lib/supabase/public-read-client";

export const maxDuration = 30;

// FIND 15: one more page of catalog cards for "Ver 24 más" on phones. Public data through the public read client, the
// same query as the catalog page, bounded by the route's deadline (and cancelled when the visitor leaves). talk-06:
// `reserved` names the cards that say "Reservado" (optional: empty when that read is off or failed).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const record = Object.fromEntries([...new Set(params.keys())].map((key) => [key, params.getAll(key)]));
  const deadline = createDeadline(READ_BUDGETS.routeMs, request.signal);
  const supabase = createPublicReadClient(deadline);
  if (!supabase) return NextResponse.json({ listings: [], reserved: [] }, { status: 503 });
  const { data, error } = await fetchCatalogPage(supabase, parseListingFilters(record), parsePage(record.page));
  if (error) return NextResponse.json({ listings: [], reserved: [] }, { status: 502 });
  const reserved = await reservedCardIds(data ?? [], deadline);
  return NextResponse.json({ listings: data ?? [], reserved: [...reserved] }, { headers: { "cache-control": "public, max-age=30" } });
}
