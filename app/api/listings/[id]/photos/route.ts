import { NextResponse } from "next/server";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";

type ListingPhotosRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  request: Request,
  { params }: ListingPhotosRouteContext,
) {
  const { id } = await params;
  const supabase = getPublicSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase no esta configurado." },
      { status: 503 },
    );
  }

  const excludeId = new URL(request.url).searchParams.get("exclude_id");
  let query = supabase
    .from("listing_photos")
    .select("id, listing_id, image_url, alt_text, sort_order")
    .eq("listing_id", id);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  query = query
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "No se pudieron cargar las fotos." },
      { status: 500 },
    );
  }

  return NextResponse.json({ photos: data ?? [] });
}
