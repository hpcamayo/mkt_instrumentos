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

  const pushDevice = requestCookie(request, PUSH_DEVICE_COOKIE);
  if (supabase) {
    // big-12: this device stops showing the account's notices once it signs out (a shared phone).
    if (isPushDeviceId(pushDevice)) await supabase.rpc("delete_push_subscription", { p_subscription_id: pushDevice });
    await supabase.auth.signOut();
  }

  const response = NextResponse.redirect(`${origin}/login`, 303);
  if (pushDevice) response.cookies.delete(PUSH_DEVICE_COOKIE);
  return response;
}

// Read from the request itself, so the route needs nothing from Next's request scope.
function requestCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return undefined;
}
