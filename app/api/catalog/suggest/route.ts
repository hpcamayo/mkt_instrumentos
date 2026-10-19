import { NextResponse, type NextRequest } from "next/server";
import { buildSuggestions, suggestionQuery } from "@/lib/catalog-suggest";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";

// FIND 01: suggestions for the search box (public data, cached briefly).
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("q") ?? "";
  if (suggestionQuery(raw).length < 2) return NextResponse.json([]);
  const supabase = getPublicSupabaseClient();
  if (!supabase) return NextResponse.json([], { status: 503 });
  const [types, brands] = await Promise.all([supabase.rpc("catalog_type_counts"), supabase.rpc("catalog_suggest", { p_q: raw.slice(0, 200), p_limit: 6 })]);
  if (types.error || brands.error) console.error(`Search: the suggestions failed: ${(types.error ?? brands.error)?.message}`);
  const suggestions = buildSuggestions(raw, types.data ?? [], brands.data ?? []);
  return NextResponse.json(suggestions, { headers: { "cache-control": "public, max-age=60" } });
}
