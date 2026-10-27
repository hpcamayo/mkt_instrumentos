import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getAssurance } from "@/lib/auth/mfa";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";
import type { Database } from "@/lib/supabase/database.types";

// Feature ideas, accounts batch: the account routes (sessions, two-step recovery, e-mail, data, deletion) share these.

export const NO_STORE = { "Cache-Control": "private, no-store" };

export function accountJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function accountError(message: string, status: number, code?: string) {
  return accountJson({ code, message }, status);
}

type SignedIn = { supabase: SupabaseClient<Database>; user: User };

// The signed-in account's client. Writes need a same-origin request (the cookie session is the credential), and
// `secondStep` refuses a first-step session of an account that has an authenticator app.
export async function accountClient(
  request: Request,
  { write = true, secondStep = false }: { write?: boolean; secondStep?: boolean } = {},
): Promise<SignedIn | { response: NextResponse }> {
  if (write && !sameOriginEventRequest(request)) {
    return { response: accountError("Solicitud no permitida.", 403, "FORBIDDEN") };
  }
  const supabase = await getSupabaseServerClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!supabase || !data.user) {
    return { response: accountError("Tu sesión terminó. Vuelve a ingresar.", 401, "AUTH_REQUIRED") };
  }
  if (secondStep && (await getAssurance(supabase)).needsCode) {
    return { response: accountError("Escribe primero el código de tu app de autenticación.", 403, "TWO_STEP_REQUIRED") };
  }
  return { supabase, user: data.user };
}

export function isTwoStepRequiredError(error: { message?: string } | null | undefined) {
  return Boolean(error?.message?.includes("TWO_STEP_REQUIRED"));
}
