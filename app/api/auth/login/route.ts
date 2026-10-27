import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { EMAIL_NOT_CONFIRMED, isEmailNotConfirmedError } from "@/lib/auth/confirmation";
import { recordSignInDevice } from "@/lib/auth/devices";
import { getAssurance } from "@/lib/auth/mfa";
import { rememberMarker, withRememberChoice } from "@/lib/auth/remember";
import type { Database } from "@/lib/supabase/database.types";

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
  // safe-08: "Mantener sesión iniciada" (ticked unless the person unticks it).
  const remember = !(body && body.remember === false);
  if (!email || !password) {
    return failure("Ingresa tu correo y contraseña.", 400);
  }

  let response = NextResponse.json({ ok: true });
  const sessionCookies: { name: string; value: string; options: Parameters<typeof withRememberChoice>[0] }[] = [];
  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values) {
          request.cookies.set(name, value);
          sessionCookies.push({ name, value, options });
        }
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // Supabase checks the password before the confirmation, so this answer does not reveal unconfirmed accounts.
  if (isEmailNotConfirmedError(error)) {
    return NextResponse.json(
      { code: EMAIL_NOT_CONFIRMED, message: "Te enviamos un enlace al registrarte. Ábrelo para activar tu cuenta y vuelve a ingresar." },
      { status: 403 },
    );
  }
  if (error) {
    return failure(
      "No se pudo iniciar sesión. Revisa tu correo y contraseña.",
      401,
    );
  }

  // safe-08: an account with an authenticator app finishes signing in with its code.
  const assurance = await getAssurance(supabase);
  response = NextResponse.json({ ok: true, needsCode: assurance.needsCode });
  for (const { name, value, options } of sessionCookies) {
    response.cookies.set(name, value, withRememberChoice(options, remember));
  }
  const marker = rememberMarker(remember, request.nextUrl.protocol === "https:");
  response.cookies.set(marker.name, marker.value, marker.options);
  await recordSignInDevice(supabase, request, response);

  return response;
}

function failure(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}
