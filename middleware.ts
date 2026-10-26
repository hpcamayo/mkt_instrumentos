import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getLoginPath } from "@/lib/auth/redirects";
import { isProtectedAccountPath } from "@/lib/auth/protected-paths";
import { isRefusedCrossSiteApiWrite } from "@/lib/same-origin";
import type { Database } from "@/lib/supabase/database.types";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isRefusedCrossSiteApiWrite(request, pathname)) {
    return NextResponse.json({ error: "Solicitud no permitida." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  // Only Admin's API routes need the session refreshed here; the others read it themselves.
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/admin/")) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

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
          response.cookies.set(name, value, options);
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
    // Every API route except the GET-only catalog and image routes, which see most of the traffic (A22).
    "/api/((?!catalog/|listing-images/).*)",
  ],
};
