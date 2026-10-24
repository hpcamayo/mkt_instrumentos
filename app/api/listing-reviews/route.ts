import { NextResponse } from "next/server";
import { isEntityId } from "@/lib/marketplace-event-payload";
import { readReviewPage, REVIEW_PAGE_SIZE } from "@/lib/listing-page";
import { READ_BUDGETS, createDeadline } from "@/lib/request-deadline";
import { createPublicReadClient } from "@/lib/supabase/public-read-client";

// "Ver las 14 reseñas" (list-06): the next page of a seller's or store's visible reviews. Public data, the same
// visibility as the listing page (get_public_review_page).
export const maxDuration = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = url.searchParams.get("user");
  const store = url.searchParams.get("store");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  if ((user === null) === (store === null) || !isEntityId(user ?? store) || !Number.isInteger(offset) || offset < 0 || offset > 10_000) {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }
  const client = createPublicReadClient(createDeadline(READ_BUDGETS.routeMs, request.signal));
  if (!client) return NextResponse.json({ message: "No disponible." }, { status: 503 });
  const { data, error } = await client.rpc("get_public_review_page", {
    p_subject_user_id: user ?? undefined,
    p_subject_store_id: store ?? undefined,
    p_offset: offset,
    p_limit: REVIEW_PAGE_SIZE,
  });
  const page = error ? null : readReviewPage(data);
  if (!page) return NextResponse.json({ message: "No pudimos cargar las reseñas." }, { status: 503 });
  return NextResponse.json(page, { headers: { "Cache-Control": "public, max-age=60" } });
}
