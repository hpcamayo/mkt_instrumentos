import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";
import { cleanupListingEditUploads } from "@/lib/listing-photo-cleanup";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.paths) || body.paths.length > 100 || body.paths.some((path: unknown) => typeof path !== "string") || !["listing-edit-photos", "listing-photos"].includes(body.bucket)) {
    return NextResponse.json({ message: "Solicitud de limpieza inválida." }, { status: 400 });
  }
  const supabase = await getSupabaseServerClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: null };
  if (!data?.user) return NextResponse.json({ message: "Ingresa a tu cuenta." }, { status: 401 });
  const listing = await supabase!.from("listings").select("id").eq("id", id).eq("owner_user_id", data.user.id).maybeSingle();
  if (!listing.data) return NextResponse.json({ message: "Publicación no encontrada." }, { status: 404 });
  const removed = await cleanupListingEditUploads(id, data.user.id, body.paths, body.bucket);
  if (!removed) return NextResponse.json({ message: "No se pudo completar la limpieza segura de las fotos. Intenta nuevamente." }, { status: 503 });
  return NextResponse.json({ ok: true, removed });
}
