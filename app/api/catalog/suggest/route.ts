import { NextResponse, type NextRequest } from "next/server";
import { suggestionQuery } from "@/lib/catalog-suggest";
import { loadSuggestions } from "@/lib/catalog-suggest-data";
import { READ_BUDGETS, budgetSignal, createDeadline } from "@/lib/request-deadline";

export const maxDuration = 30;

// FIND 01: suggestions for the search box (public data, shared by the CDN and the server for two minutes). Late or
// unavailable parts are left out (lib/catalog-suggest-data.ts); an empty list still lets the visitor search.
export async function GET(request: NextRequest) {
  const query = suggestionQuery(request.nextUrl.searchParams.get("q") ?? "");
  if (query.length < 2) return NextResponse.json([]);
  const deadline = createDeadline(READ_BUDGETS.routeMs, request.signal);
  const suggestions = await loadSuggestions(query, budgetSignal(deadline, READ_BUDGETS.optionalMs));
  return NextResponse.json(suggestions, { headers: { "cache-control": "public, max-age=60, s-maxage=120" } });
}
