import { NextResponse } from "next/server";
import { getSafeAuthRedirect } from "@/lib/auth/redirects";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const next = getSafeAuthRedirect(requestUrl.searchParams.get("next"));
  const origin = requestUrl.origin;

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("No se pudo iniciar sesion.")}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("El enlace no es valido o expiro.")}`,
    );
  }

  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Supabase no esta configurado.")}`,
    );
  }

  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("No se pudo confirmar la sesion.")}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
