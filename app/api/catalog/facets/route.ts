import { NextResponse, type NextRequest } from "next/server";
import { fetchCatalogFacets } from "@/lib/catalog-facets";
import { parseListingFilters } from "@/lib/listings";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";

// FIND 07: the filter counts for a draft in the phone sheet (the same counts the catalog page shows). Public data.
export async function GET(request: NextRequest) {
  if (process.env.LARIA_CATALOG_ENRICHMENT_DISABLED === "true") {
    return NextResponse.json(null, { headers: { "cache-control": "public, max-age=30, s-maxage=60" } });
  }
  const params = request.nextUrl.searchParams;
  const record = Object.fromEntries([...new Set(params.keys())].map((key) => [key, params.getAll(key)]));
  const supabase = getPublicSupabaseClient();
  if (!supabase) return NextResponse.json(null, { status: 503 });
  const data = await fetchCatalogFacets(supabase, parseListingFilters(record));
  if (!data) return NextResponse.json(null, { status: 502 });
  return NextResponse.json(data, { headers: { "cache-control": "public, max-age=30" } });
}
