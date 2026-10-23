// fix-08: signing in before confirming the e-mail says so, and the confirmation link can be sent again.
export const EMAIL_NOT_CONFIRMED = "email_not_confirmed";
export const RESEND_CONFIRMATION_WAIT_SECONDS = 60;

export function isEmailNotConfirmedError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === EMAIL_NOT_CONFIRMED || /email not confirmed/i.test(error.message ?? "");
}
