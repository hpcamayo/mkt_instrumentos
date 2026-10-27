import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { EMAIL_NOT_CONFIRMED, isEmailNotConfirmedError } from "@/lib/auth/confirmation";
import { TOO_MANY_ATTEMPTS, isAuthRateLimited } from "@/lib/auth/limits";
import { RATE_LIMITS, allowRequest } from "@/lib/rate-limit";
import type { Database } from "@/lib/supabase/database.types";
import { visitorAuthKey } from "@/lib/supabase/visitor-auth";

// Sign-in for scripts and tests. The login form signs in from the browser (launch audit A16): from here every
// attempt counts against the server's address at Supabase Auth unless the visitor's is forwarded, so this route
// also limits each visitor itself.
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return failure("No se pudo iniciar sesión.", 503);
  }

  const body = await request.json().catch(() => null);
  const email =
    body && typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";
  const password =
    body && typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return failure("Ingresa tu correo y contraseña.", 400);
  }
  if (!(await allowRequest(RATE_LIMITS.login, request))) return failure(TOO_MANY_ATTEMPTS, 429);

  const response = NextResponse.json({ ok: true });
  const forwarded = visitorAuthKey(request);
  const supabase = createServerClient<Database>(supabaseUrl, forwarded?.key ?? supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values) {
          response.cookies.set(name, value, options);
        }
      },
    },
    ...(forwarded ? { global: { headers: forwarded.headers } } : {}),
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // Supabase checks the password before the confirmation, so this answer does not reveal unconfirmed accounts.
  if (isEmailNotConfirmedError(error)) {
    return NextResponse.json(
      { code: EMAIL_NOT_CONFIRMED, message: "Te enviamos un enlace al registrarte. Ábrelo para activar tu cuenta y vuelve a ingresar." },
      { status: 403 },
    );
  }
  if (isAuthRateLimited(error)) return failure(TOO_MANY_ATTEMPTS, 429);
  if (error) {
    return failure(
      "No se pudo iniciar sesión. Revisa tu correo y contraseña.",
      401,
    );
  }

  return response;
}

function failure(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}
