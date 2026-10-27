import { accountClient, accountError, accountJson, isTwoStepRequiredError } from "@/lib/account/route-helpers";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// safe-08 (accounts batch): "Cerrar sesión" on one other device, from Seguridad.
export async function POST(request: Request) {
  const client = await accountClient(request, { secondStep: true });
  if ("response" in client) return client.response;
  const body = (await request.json().catch(() => null)) as { session_id?: unknown } | null;
  const sessionId = typeof body?.session_id === "string" && UUID.test(body.session_id) ? body.session_id : null;
  if (!sessionId) return accountError("No encontramos ese dispositivo.", 400);
  const { data, error } = await client.supabase.rpc("revoke_my_session", { p_session_id: sessionId });
  if (isTwoStepRequiredError(error)) return accountError("Escribe primero el código de tu app de autenticación.", 403, "TWO_STEP_REQUIRED");
  if (error?.message?.includes("SESSION_IS_CURRENT")) return accountError("Para este dispositivo usa «Cerrar sesión».", 400);
  if (error) return accountError("No pudimos cerrar esa sesión. Vuelve a intentarlo.", 503);
  return accountJson({ ok: true, closed: data === true });
}
