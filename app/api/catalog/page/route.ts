import { NextResponse, type NextRequest } from "next/server";
import { fetchCatalogPage } from "@/lib/catalog";
import { parseListingFilters } from "@/lib/listings";
import { parsePage } from "@/lib/pagination";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";

// FIND 15: one more page of catalog cards for "Ver 24 más" on phones. Public data through the public client, the same
// query as the catalog page.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const record = Object.fromEntries([...new Set(params.keys())].map((key) => [key, params.getAll(key)]));
  const supabase = getPublicSupabaseClient();
  if (!supabase) return NextResponse.json({ listings: [] }, { status: 503 });
  const { data, error } = await fetchCatalogPage(supabase, parseListingFilters(record), parsePage(record.page));
  if (error) return NextResponse.json({ listings: [] }, { status: 502 });
  return NextResponse.json({ listings: data ?? [] }, { headers: { "cache-control": "public, max-age=30" } });
}
