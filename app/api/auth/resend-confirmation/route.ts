import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { TOO_MANY_EMAILS, isAuthRateLimited } from "@/lib/auth/limits";
import { getSafeAuthRedirect } from "@/lib/auth/redirects";
import { RATE_LIMITS, allowRequest } from "@/lib/rate-limit";
import type { Database } from "@/lib/supabase/database";
import { visitorAuthKey } from "@/lib/supabase/visitor-auth";

// fix-08: sends the sign-up confirmation e-mail again. The answer is the same whether or not the address has an
// unconfirmed account, so it cannot be used to find out who is registered. Supabase Auth limits how often it sends;
// the form also waits RESEND_CONFIRMATION_WAIT_SECONDS between sends.
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ message: "No se pudo enviar el enlace." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const email = body && typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ message: "Ingresa un correo válido." }, { status: 400 });
  }
  const next = getSafeAuthRedirect(body && typeof body.next === "string" ? body.next : null);
  // Launch audit A16: each visitor's resends are limited here too, since Supabase Auth counts the server's address
  // unless the visitor's is forwarded.
  if (!(await allowRequest(RATE_LIMITS.resendConfirmation, request))) {
    return NextResponse.json({ message: TOO_MANY_EMAILS }, { status: 429 });
  }

  const forwarded = visitorAuthKey(request);
  const supabase = createServerClient<Database>(supabaseUrl, forwarded?.key ?? supabaseAnonKey, {
    cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} },
    ...(forwarded ? { global: { headers: forwarded.headers } } : {}),
  });
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${request.nextUrl.origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (isAuthRateLimited(error)) return NextResponse.json({ message: TOO_MANY_EMAILS }, { status: 429 });
  return NextResponse.json({ ok: true });
}
