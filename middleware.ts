import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getLoginPath } from "@/lib/auth/redirects";
import { isProtectedAccountPath } from "@/lib/auth/protected-paths";
import type { Database } from "@/lib/supabase/database.types";
import { blocksCatalogCrawler, isCatalogDataPath } from "@/lib/catalog-crawlers";
import { parseCatalogRequest, searchParamsRecord } from "@/lib/catalog-request";

export async function middleware(request: NextRequest) {
  if (isCatalogDataPath(request.nextUrl.pathname)) {
    // Public traffic must leave this branch before constructing a session client or touching cookies.
    if (blocksCatalogCrawler(request.nextUrl.pathname, request.headers.get("user-agent") ?? "")) {
      return new NextResponse(request.method === "HEAD" ? null : "Acceso no permitido.", {
        status: 403,
        headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8", Vary: "User-Agent" },
      });
    }
    if (request.nextUrl.pathname === "/listados" || request.nextUrl.pathname === "/listados/") {
      const { redirectHref } = parseCatalogRequest(searchParamsRecord(request.nextUrl.searchParams));
      if (redirectHref) {
        return NextResponse.redirect(new URL(redirectHref, request.url), {
          status: 308,
          headers: { "Cache-Control": "private, no-store" },
        });
      }
    }
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
    "/listados",
    "/api/catalog/:path*",
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
