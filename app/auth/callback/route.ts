import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import {
  getAuthCallbackDestination,
  getAuthCallbackErrorUrl,
  getConfirmationRecoveryUrl,
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
import { recordSignInDevice } from "@/lib/auth/devices";
import { getAssurance, twoStepPath } from "@/lib/auth/mfa";
import { rememberMarker, remembersSession, withRememberChoice } from "@/lib/auth/remember";
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
  // safe-08 (accounts batch): the sign-in page passes recordar=0 when "Mantener sesión iniciada" was unticked.
  const remember = remembersSession(requestUrl.searchParams.get("recordar"));

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
        response.cookies.set(name, value, withRememberChoice(options, remember)),
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
    if (!limited && exchangeError.code === "otp_expired" && (type === "email" || type === "signup")) {
      return NextResponse.redirect(getConfirmationRecoveryUrl(origin, next));
    }
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
  const provider = data.user?.app_metadata?.provider;

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
  } else if (data.user && (provider === "google" || provider === "apple")) {
    // buy-11 (accounts batch): a first sign-in with Google or Apple creates the same name-only profile as the sign-up
    // form; the provider has already confirmed the address.
    await upsertBasicSellerProfile(
      supabase,
      data.user.id,
      String(metadata?.full_name ?? metadata?.name ?? data.user.email?.split("@")[0] ?? "Cuenta Laria"),
    );
  }

  if (type === "recovery" && data.user?.app_metadata?.role !== "admin" && data.user?.factors?.length) {
    const { retirePilotNonAdminFactors } = await import("@/lib/auth/pilot-two-step");
    await retirePilotNonAdminFactors(data.user);
  }

  if (data.user && type !== "recovery") {
    // safe-08 (accounts batch): remember the choice, note the device, and finish with the code when the account has one.
    const marker = rememberMarker(remember, requestUrl.protocol === "https:");
    response.cookies.set(marker.name, marker.value, marker.options);
    const assurance = await getAssurance(supabase);
    if (assurance.needsCode) {
      const codeStep = NextResponse.redirect(new URL(twoStepPath("codigo", next), origin));
      response.cookies.getAll().forEach((cookie) => codeStep.cookies.set(cookie));
      response = codeStep;
    }
    await recordSignInDevice(supabase, request, response, data.user);
  }

  return response;
}
