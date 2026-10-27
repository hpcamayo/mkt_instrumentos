import type { DatabaseClient } from "@/lib/supabase/database";

// safe-08 (accounts batch): a session that still owes its authenticator code (the password only, on an account with the
// app on) may use nothing but the code step. The database refuses such a session on every request made with its own
// token, and in Storage (20261210120700, public.check_two_step_request). A route that acts with the service role for
// the signed-in account skips those checks, so it asks here first. True when the session owes its code, and also when
// the answer can't be read, so a failed check never lets the request through.
export const TWO_STEP_OWED_MESSAGE = "Ingresa el código de tu app de autenticación para continuar.";

export async function sessionOwesTwoStep(supabase: DatabaseClient) {
  const { data, error } = await supabase.rpc("my_two_step_owed");
  return Boolean(error) || data !== false;
}
