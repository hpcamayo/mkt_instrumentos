import { TOO_MANY_ATTEMPTS, isAuthRateLimited } from "@/lib/auth/limits";

// Launch audit A15: the authenticator code as typed on the security page (components/auth/two-step-verification.tsx).

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
