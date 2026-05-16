import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export async function GET(request: Request) {
  const supabase = await getSupabaseServerClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/login`);
}
