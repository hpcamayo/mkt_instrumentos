import { NextResponse } from "next/server";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";

type ListingViewRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  _request: Request,
  { params }: ListingViewRouteContext,
) {
  const { id } = await params;
  const supabase = getPublicSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase no esta configurado." },
      { status: 503 },
    );
  }

  const { data, error } = await supabase.rpc("increment_listing_view_count", {
    p_listing_id: id,
  });

  if (error) {
    return NextResponse.json(
      { error: "No se pudo registrar la visita." },
      { status: 500 },
    );
  }

  return NextResponse.json({ view_count: data ?? 0 });
}
