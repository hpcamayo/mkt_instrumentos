import { TOO_MANY_ATTEMPTS, isAuthRateLimited } from "@/lib/auth/limits";
import { getSafeAuthRedirect } from "@/lib/auth/redirects";

// Launch audit A15: Admin works only in a session that also passed an authenticator app's code (an aal2 session,
// Supabase MFA with TOTP); public.is_admin() checks it in the database. The two-step section is on the security
// page, and Admin pages send an Admin there with the page to come back to.
export const TWO_STEP_PAGE = "/mi-cuenta/seguridad";
export const TWO_STEP_SECTION_ID = "dos-pasos";

export function twoStepPath(next = "/admin") {
  const query = new URLSearchParams({ verificar: "admin", next: getSafeAuthRedirect(next, "/admin") });
  return `${TWO_STEP_PAGE}?${query}#${TWO_STEP_SECTION_ID}`;
}

// The page to open once the code is accepted: only an Admin page, so the security page can't be used to send
// someone elsewhere.
export function twoStepNext(value: string | string[] | undefined | null) {
  const next = getSafeAuthRedirect(Array.isArray(value) ? value[0] : value, "");
  return next === "/admin" || next.startsWith("/admin/") || next.startsWith("/admin?") ? next : null;
}

// Six digits, spaces allowed (apps show "123 456").
export function readTwoStepCode(value: unknown) {
  const code = typeof value === "string" ? value.replace(/\s+/g, "") : "";
  return /^\d{6}$/.test(code) ? code : null;
}

export function twoStepErrorMessage(error: { code?: string; status?: number } | null | undefined) {
  if (!error) return "";
  if (isAuthRateLimited(error)) return TOO_MANY_ATTEMPTS;
  if (error.code === "mfa_verification_failed" || error.code === "mfa_challenge_expired" || error.code === "mfa_verification_rejected") {
    return "El código no es correcto o ya cambió. Escribe el que muestra tu app en este momento.";
  }
  return "No pudimos completar la verificación. Vuelve a intentarlo.";
}
