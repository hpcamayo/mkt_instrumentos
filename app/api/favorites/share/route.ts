import { NextResponse } from "next/server";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { absoluteUrl } from "@/lib/site";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

const NO_STORE = { "Cache-Control": "private, no-store" };

// save-11: create (or reuse) and revoke the account's shared favorites link.
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return NextResponse.json({ message: "Solicitud inválida." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const client = await getSupabaseServerClient();
  const { data } = client ? await client.auth.getUser() : { data: null };
  if (!client || !data?.user) return NextResponse.json({ message: "Ingresa para compartir tu lista." }, { status: 401 });
  if (body?.action === "create") {
    const { data: token, error } = await client.rpc("get_or_create_favorite_share");
    if (error || !token) return NextResponse.json({ message: "No se pudo crear el enlace." }, { status: 503 });
    return NextResponse.json({ url: absoluteUrl(`/favoritos/compartida/${token}`) }, { headers: NO_STORE });
  }
  if (body?.action === "revoke") {
    const { error } = await client.rpc("revoke_favorite_share");
    if (error) return NextResponse.json({ message: "No se pudo dejar de compartir." }, { status: 503 });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }
  return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
}
