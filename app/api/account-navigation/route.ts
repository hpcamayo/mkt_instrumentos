import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// Hydrated header state; public server rendering never needs an Auth query.
export async function GET() {
  const client = await getSupabaseServerClient();
  const { data } = client ? await client.auth.getUser() : { data: null };
  if (!data?.user || !client) return NextResponse.json({ authenticated: false, storeOwner: false, hasStore: false }, { headers: { "Cache-Control": "private, no-store" } });
  const { data: profile, error } = await client.from("profiles").select("account_type").eq("id", data.user.id).maybeSingle();
  if (error) return NextResponse.json({ message: "No se pudo cargar la cuenta." }, { status: 503 });
  const storeOwner = profile?.account_type === "store_owner";
  const { data: store, error: storeError } = storeOwner ? await client.from("stores").select("id").eq("owner_user_id", data.user.id).maybeSingle() : { data: null, error: null };
  if (storeError) return NextResponse.json({ message: "No se pudo cargar la tienda." }, { status: 503 });
  return NextResponse.json({ authenticated: true, storeOwner, hasStore: Boolean(store) }, { headers: { "Cache-Control": "private, no-store" } });
}
