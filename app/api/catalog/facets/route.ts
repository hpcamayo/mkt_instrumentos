import { NextResponse, type NextRequest } from "next/server";
import { getFacetsForKey } from "@/lib/catalog-data";
import { catalogSearchParams } from "@/lib/catalog-filters";
import { catalogEnrichmentDisabled } from "@/lib/catalog-guard";
import { parseListingFilters } from "@/lib/listings";
import { READ_BUDGETS, budgetSignal, createDeadline } from "@/lib/request-deadline";

export const maxDuration = 30;

// FIND 07: the filter counts for a draft in the phone sheet (the same counts the catalog page shows). Public data:
// the same answer for everyone, so the CDN shares it per canonical address (a minute fresh, five more minutes while it
// refreshes), and the server shares it per filter set (lib/catalog-data.ts). An address that is not canonical (other
// order, repeated or unknown parameters) is sent to the canonical one, so equivalent drafts share one entry.
export async function GET(request: NextRequest) {
  if (catalogEnrichmentDisabled()) {
    return NextResponse.json(null, { headers: { "cache-control": "public, max-age=30, s-maxage=60" } });
  }
  const params = request.nextUrl.searchParams;
  const record = Object.fromEntries([...new Set(params.keys())].map((key) => [key, params.getAll(key)]));
  const canonical = catalogSearchParams({ ...parseListingFilters(record), sort: "newest" }).toString();
  if (canonical !== params.toString()) {
    const target = new URL(request.nextUrl.toString());
    target.search = canonical;
    return NextResponse.redirect(target, { status: 308, headers: { "cache-control": "public, max-age=300, s-maxage=3600" } });
  }
  const deadline = createDeadline(READ_BUDGETS.routeMs, request.signal);
  const data = await getFacetsForKey(canonical, budgetSignal(deadline, READ_BUDGETS.optionalMs));
  // Unavailable: the sheet keeps its plain "Ver resultados". Shared for a few seconds so a burst does not repeat it.
  if (!data) return NextResponse.json(null, { status: 503, headers: { "cache-control": "public, max-age=5, s-maxage=10" } });
  return NextResponse.json(data, { headers: { "cache-control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300" } });
}
