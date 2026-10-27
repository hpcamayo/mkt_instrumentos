import "server-only";
import { clientAddress } from "@/lib/rate-limit";

// Launch audit A16: Supabase Auth limits requests per address (30 e-mail link checks every 5 minutes, for example),
// and calls made from the server would all count against Vercel's address. With a secret API key (sb_secret_...)
// the server names the visitor's address in Sb-Forwarded-For and Supabase counts that address instead, once IP
// forwarding is on in Auth's rate-limit settings. Production needs both (docs/owner-manual.md); without the key the
// calls count the server's address as before, and the logs say so once per instance.
// The key is only for Auth calls; database reads keep the anon key and the visitor's session.
let reportedMissingKey = false;

export function visitorAuthKey(request: Request) {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key?.startsWith("sb_secret_")) {
    if (process.env.VERCEL_ENV === "production" && !reportedMissingKey) {
      reportedMissingKey = true;
      console.warn("auth-forwarding-off");
    }
    return null;
  }
  const address = clientAddress(request);
  if (address === "unknown") return null;
  return { key, headers: { "Sb-Forwarded-For": address } };
}
