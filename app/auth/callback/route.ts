import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import {
  getAuthCallbackDestination,
  getAuthCallbackErrorUrl,
  parseEmailOtpType,
} from "@/lib/auth/callback";
import { TOO_MANY_LINK_OPENS, isAuthRateLimited } from "@/lib/auth/limits";
import {
  INDIVIDUAL_SELLER_ACCOUNT_TYPE,
  STORE_OWNER_ACCOUNT_TYPE,
  isSellerProfileComplete,
  upsertBasicSellerProfile,
  upsertSellerProfile,
  upsertStoreOwnerProfile,
} from "@/lib/auth/profile";
import { RATE_LIMITS, allowRequest } from "@/lib/rate-limit";
import type { Database } from "@/lib/supabase/database";
import { visitorAuthKey } from "@/lib/supabase/visitor-auth";

export async function GET(request: NextRequest) {
  const requestUrl = request.nextUrl;
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = parseEmailOtpType(requestUrl.searchParams.get("type"));
  const providerError = requestUrl.searchParams.get("error");
  const next = getAuthCallbackDestination(
    type,
    requestUrl.searchParams.get("next"),
  );
  const origin = requestUrl.origin;

  if (providerError) {
    return NextResponse.redirect(
      getAuthCallbackErrorUrl(origin, "No se pudo iniciar sesión."),
    );
  }

  if (!code && !(tokenHash && type)) {
    return NextResponse.redirect(
      getAuthCallbackErrorUrl(
        origin,
        "El enlace no es válido o ya venció.",
      ),
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(
      getAuthCallbackErrorUrl(origin, "No se pudo conectar con Laria. Intenta nuevamente."),
    );
  }

  // Launch audit A16: a refused attempt doesn't use up the link, so the message asks to open it again later.
  if (!(await allowRequest(RATE_LIMITS.callback, request))) {
    return NextResponse.redirect(getAuthCallbackErrorUrl(origin, TOO_MANY_LINK_OPENS));
  }

  let response = NextResponse.redirect(new URL(next, origin));
  const cookies: CookieMethodsServer = {
    getAll: () => request.cookies.getAll(),
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value }) =>
        request.cookies.set(name, value),
      );
      cookiesToSet.forEach(({ name, value, options }) =>
        response.cookies.set(name, value, options),
      );
    },
  };
  // The link is checked under the visitor's address when the server can forward it; the session it opens lands in
  // the same cookies either way.
  const forwarded = visitorAuthKey(request);
  const verifier = createServerClient<Database>(supabaseUrl, forwarded?.key ?? supabaseAnonKey, {
    cookies,
    ...(forwarded ? { global: { headers: forwarded.headers } } : {}),
  });

  const { error: exchangeError } = tokenHash && type
    ? await verifier.auth.verifyOtp({ token_hash: tokenHash, type })
    : await verifier.auth.exchangeCodeForSession(code!);

  if (exchangeError) {
    const limited = isAuthRateLimited(exchangeError);
    if (limited) console.warn("auth-callback-rate-limited", exchangeError.code ?? exchangeError.status);
    response = NextResponse.redirect(
      getAuthCallbackErrorUrl(
        origin,
        limited
          ? TOO_MANY_LINK_OPENS
          : type === "recovery"
            ? "El enlace de recuperación no es válido o ya venció."
            : "No se pudo confirmar la sesión.",
      ),
    );
    return response;
  }

  // The profile is read and saved with the anon key and the new session, as before.
  const supabase = forwarded ? createServerClient<Database>(supabaseUrl, supabaseAnonKey, { cookies }) : verifier;
  const { data } = await supabase.auth.getUser();
  const metadata = data.user?.user_metadata;

  if (data.user && metadata?.account_type === INDIVIDUAL_SELLER_ACCOUNT_TYPE) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name,phone,city,region")
      .eq("id", data.user.id)
      .maybeSingle();
    const profileIsComplete = isSellerProfileComplete(profile);
    // auth-02: accounts created with only a name get a profile row with the name; WhatsApp comes at publishing.
    if (!profile && !metadata.phone) {
      await upsertBasicSellerProfile(supabase, data.user.id, String(metadata.full_name ?? ""));
    } else if (!profileIsComplete && metadata.phone) {
      await upsertSellerProfile(supabase, data.user.id, {
        fullName: String(metadata.full_name ?? ""),
        phone: String(metadata.phone ?? ""),
        city: String(metadata.city ?? ""),
        region: String(metadata.region ?? ""),
      });
    }
  } else if (data.user && metadata?.account_type === STORE_OWNER_ACCOUNT_TYPE) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name,phone,city,region")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!isSellerProfileComplete(profile)) {
      await upsertStoreOwnerProfile(supabase, data.user.id, {
        fullName: String(metadata.full_name ?? ""),
        phone: String(metadata.phone ?? ""),
        city: String(metadata.city ?? ""),
        region: String(metadata.region ?? ""),
      });
    }
  }

  return response;
}
