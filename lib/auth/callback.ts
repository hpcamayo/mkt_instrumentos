import type { EmailOtpType } from "@supabase/supabase-js";
import { getSafeAuthRedirect } from "./redirects";

const emailOtpTypes = new Set<EmailOtpType>([
  "email",
  "invite",
  "magiclink",
  "recovery",
  "signup",
  "email_change",
]);

export function parseEmailOtpType(value: string | null) {
  return value && emailOtpTypes.has(value as EmailOtpType)
    ? (value as EmailOtpType)
    : null;
}

export function getAuthCallbackDestination(
  type: EmailOtpType | null,
  requestedDestination: string | null,
) {
  if (type === "recovery") return "/restablecer-contrasena";
  return getSafeAuthRedirect(requestedDestination);
}

export function getAuthCallbackErrorUrl(origin: string, message: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", message);
  return url;
}
