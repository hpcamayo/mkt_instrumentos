import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

const PRIVATE = { "Cache-Control": "private, no-store" };
const SIGNED_OUT = { authenticated: false, storeOwner: false, hasStore: false, admin: false, name: null, unreadNotifications: 0, pendingBuyerConfirmations: 0 };

// Hydrated header state; public server rendering never needs an Auth query. The header's bell, account menu and
// avatar read the same values the account rail shows (decision N6); a failed count or admin check degrades to none.
export async function GET() {
  const client = await getSupabaseServerClient();
  const { data } = client ? await client.auth.getUser() : { data: null };
  if (!data?.user || !client) return NextResponse.json(SIGNED_OUT, { headers: PRIVATE });
  const userId = data.user.id;
  const [profileResult, storeResult, adminResult, notificationsResult, confirmationsResult] = await Promise.all([
    client.from("profiles").select("account_type,full_name").eq("id", userId).maybeSingle(),
    client.from("stores").select("id").eq("owner_user_id", userId).maybeSingle(),
    client.rpc("is_admin"),
    client.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    client.rpc("get_pending_buyer_confirmation_count"),
  ]);
  if (profileResult.error) return NextResponse.json({ message: "No se pudo cargar la cuenta." }, { status: 503 });
  const storeOwner = profileResult.data?.account_type === "store_owner";
  if (storeOwner && storeResult.error) return NextResponse.json({ message: "No se pudo cargar la tienda." }, { status: 503 });
  const pending = Number(confirmationsResult.data);
  return NextResponse.json({
    authenticated: true,
    storeOwner,
    hasStore: storeOwner && Boolean(storeResult.data),
    admin: !adminResult.error && adminResult.data === true,
    name: profileResult.data?.full_name?.trim() || null,
    unreadNotifications: notificationsResult.error ? 0 : notificationsResult.count ?? 0,
    pendingBuyerConfirmations: confirmationsResult.error || !Number.isFinite(pending) ? 0 : pending,
  }, { headers: PRIVATE });
}
