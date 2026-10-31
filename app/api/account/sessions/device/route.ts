import { NextResponse, type NextRequest } from "next/server";
import { accountClient, NO_STORE } from "@/lib/account/route-helpers";
import { recordSignInDevice } from "@/lib/auth/devices";

// safe-08 (accounts batch): the login form signs in from the browser (launch audit A16) and then calls this, so the
// browser is recorded and a new one gets its e-mail, as after a sign-in through /api/auth/login or /auth/callback.
// record_sign_in_device caps the new-device e-mails at ten a day per account.
export async function POST(request: NextRequest) {
  const client = await accountClient(request);
  if ("response" in client) return client.response;
  const response = NextResponse.json({ ok: true }, { headers: NO_STORE });
  await recordSignInDevice(client.supabase, request, response, client.user);
  return response;
}
