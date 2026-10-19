import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PUSH_DEVICE_COOKIE, isPushDeviceId } from "@/lib/push/device";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export function GET() {
  // Navigation, link prefetch and crawlers must never change authentication.
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  if (
    request.headers.get("origin") !== origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return new NextResponse("Solicitud no permitida.", { status: 403 });
  }

  const supabase = await getSupabaseServerClient();

  const pushDevice = (await cookies()).get(PUSH_DEVICE_COOKIE)?.value;
  if (supabase) {
    // big-12: this device stops showing the account's notices once it signs out (a shared phone).
    if (isPushDeviceId(pushDevice)) await supabase.rpc("delete_push_subscription", { p_subscription_id: pushDevice });
    await supabase.auth.signOut();
  }

  const response = NextResponse.redirect(`${origin}/login`, 303);
  if (pushDevice) response.cookies.delete(PUSH_DEVICE_COOKIE);
  return response;
}
