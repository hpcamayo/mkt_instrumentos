import { NextResponse } from "next/server";
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

  if (supabase) {
    await supabase.auth.signOut();
  }

  return NextResponse.redirect(`${origin}/login`, 303);
}
