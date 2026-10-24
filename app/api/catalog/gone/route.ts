import { NextResponse, type NextRequest } from "next/server";
import { fetchCatalogPage } from "@/lib/catalog";
import { categoryLandingPath, categoryTypePath } from "@/lib/category-pages";
import { getInstrumentFilterGroup } from "@/lib/instrument-filters";
import { getCategoryLabel } from "@/lib/listings";
import { READ_BUDGETS, createDeadline } from "@/lib/request-deadline";
import { createPublicReadClient } from "@/lib/supabase/public-read-client";

const SIMILAR = 4;

export const maxDuration = 30;

// FIND 16 (Effortless Laria): for a listing address that no longer opens, whether it was once public and, if so, live
// listings of the same type. public.listing_gone_hint says only the category and type, nothing about the old listing
// or its seller; an address that never was a public listing gets { gone: false }.
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 200) return NextResponse.json({ gone: false });
  // The hint and both similar-listing reads share one deadline.
  const supabase = createPublicReadClient(createDeadline(READ_BUDGETS.routeMs, request.signal));
  if (!supabase) return NextResponse.json({ gone: false }, { status: 503 });
  const { data, error } = await supabase.rpc("listing_gone_hint", { p_slug: slug });
  const hint = data?.[0];
  if (error || !hint) return NextResponse.json({ gone: false });
  const type = hint.instrument_type && hint.instrument_type !== "other" ? hint.instrument_type : undefined;
  const base = { category: hint.category, cities: [], conditions: [], advanced: {}, sort: "newest" as const };
  let similar = await fetchCatalogPage(supabase, { ...base, instrumentType: type }, 1, SIMILAR);
  if (!similar.error && (similar.data ?? []).length === 0 && type) similar = await fetchCatalogPage(supabase, base, 1, SIMILAR);
  const label = (type ? getInstrumentFilterGroup(type)?.label : undefined) ?? getCategoryLabel(hint.category);
  return NextResponse.json(
    {
      gone: true,
      label,
      href: type ? categoryTypePath(hint.category, type) : categoryLandingPath(hint.category),
      listings: similar.error ? [] : (similar.data ?? []),
    },
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
