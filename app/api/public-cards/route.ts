import { NextResponse } from "next/server";
import { createPublicReadClient } from "@/lib/supabase/public-read-client";
import { createDeadline, READ_BUDGETS } from "@/lib/request-deadline";
import { isFavoriteListingId } from "@/lib/favorites";

// A public snapshot shared by all visitors: never accept a history, account or list of desired cards.
export async function GET(request: Request) {
  const after = new URL(request.url).searchParams.get("after");
  if (after && !isFavoriteListingId(after)) return NextResponse.json({ message: "Página inválida." }, { status: 400 });
  const client = createPublicReadClient(createDeadline(READ_BUDGETS.pageMs));
  if (!client) return NextResponse.json({ message: "No se pudieron cargar las publicaciones." }, { status: 503 });
  const { data, error } = await client.rpc("get_public_card_page", { p_after: after });
  if (error) return NextResponse.json({ message: "No se pudieron cargar las publicaciones." }, { status: 503 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
