import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getLoginPath } from "@/lib/auth/redirects";
import { isProtectedAccountPath } from "@/lib/auth/protected-paths";
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
    const loginPath = new URL(getLoginPath(request.nextUrl.pathname), url);
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
    "/admin",
    "/api/admin/:path*",
  ],
};
