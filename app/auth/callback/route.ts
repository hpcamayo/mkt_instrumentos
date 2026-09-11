import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import {
  getAuthCallbackDestination,
  getAuthCallbackErrorUrl,
  parseEmailOtpType,
} from "@/lib/auth/callback";
import {
  INDIVIDUAL_SELLER_ACCOUNT_TYPE,
  STORE_OWNER_ACCOUNT_TYPE,
  isSellerProfileComplete,
  upsertSellerProfile,
  upsertStoreOwnerProfile,
} from "@/lib/auth/profile";
import type { Database } from "@/lib/supabase/database.types";

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
      getAuthCallbackErrorUrl(origin, "Supabase no está configurado."),
    );
  }

  let response = NextResponse.redirect(new URL(next, origin));
  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { error: exchangeError } = tokenHash && type
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    : await supabase.auth.exchangeCodeForSession(code!);

  if (exchangeError) {
    response = NextResponse.redirect(
      getAuthCallbackErrorUrl(
        origin,
        type === "recovery"
          ? "El enlace de recuperación no es válido o ya venció."
          : "No se pudo confirmar la sesión.",
      ),
    );
    return response;
  }

  const { data } = await supabase.auth.getUser();
  const metadata = data.user?.user_metadata;

  if (data.user && metadata?.account_type === INDIVIDUAL_SELLER_ACCOUNT_TYPE) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name,phone,city,region")
      .eq("id", data.user.id)
      .maybeSingle();
    const profileIsComplete = isSellerProfileComplete(profile);
    if (!profileIsComplete) {
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
