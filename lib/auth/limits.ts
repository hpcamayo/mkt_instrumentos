// Launch audit A16: Supabase Auth's own limits (too many sign-ins, codes or e-mails in a row) are reported as such,
// never as a wrong password or a missing account.
export const TOO_MANY_ATTEMPTS = "Hiciste muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo.";
export const TOO_MANY_EMAILS = "Ya te enviamos varios correos. Espera unos minutos antes de pedir otro.";
// The link itself is not used up by a refused attempt.
export const TOO_MANY_LINK_OPENS = "Hubo muchos intentos seguidos. Espera unos minutos y vuelve a abrir el enlace del correo.";
// Sign-up: the limit may be this visitor's or the project's e-mail quota, so the message blames no one.
export const SIGN_UP_PAUSED = "Hubo muchos registros seguidos. Espera unos minutos y vuelve a intentarlo.";

export function isAuthRateLimited(error: { status?: number; code?: string } | null | undefined) {
  return Boolean(error && (error.status === 429 || error.code === "over_request_rate_limit" || error.code === "over_email_send_rate_limit"));
}
