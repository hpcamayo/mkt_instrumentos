import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getLoginPath } from "@/lib/auth/redirects";
import { isProtectedAccountPath } from "@/lib/auth/protected-paths";
import { REMEMBER_COOKIE, remembersSession, withRememberChoice } from "@/lib/auth/remember";
import { twoStepRedirectPath } from "@/lib/auth/two-step-gate";
import type { Database } from "@/lib/supabase/database.types";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  // safe-08 (accounts batch): without "Mantener sesión iniciada" the refreshed session cookies end with the browser.
  const remember = remembersSession(request.cookies.get(REMEMBER_COOKIE)?.value);
  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, withRememberChoice(options, remember));
        });
      },
    },
  });

  const { data: claimsData } = await supabase.auth.getClaims();

  const isProtectedPath = isProtectedAccountPath(request.nextUrl.pathname);

  if (isProtectedPath && !claimsData?.claims) {
    const url = request.nextUrl.clone();
    // Accounts batch, save-02: the query comes along, so a filtered page opens as it was after signing in.
    const loginPath = new URL(getLoginPath(request.nextUrl.pathname + request.nextUrl.search), url);
    url.pathname = loginPath.pathname;
    url.search = loginPath.search;
    return NextResponse.redirect(url);
  }

  // safe-08 (accounts batch): the code step after signing in, and the code that Mi tienda and Admin require.
  const twoStepPath = await twoStepRedirectPath(supabase, request, claimsData?.claims);
  if (twoStepPath) {
    const redirect = NextResponse.redirect(new URL(twoStepPath, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/mi-cuenta/:path*",
    "/mis-publicaciones/:path*",
    "/vender",
    "/registro/:path*",
    "/login",
    "/logout",
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};
