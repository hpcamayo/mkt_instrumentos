// auth-01: one minimum everywhere (sign-up, reset and change).
export const PASSWORD_MIN_LENGTH = 8;

export function getPasswordValidationMessage(
  password: string,
  confirmation: string,
) {
  if (password.length < PASSWORD_MIN_LENGTH) return `Usa al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (password !== confirmation) return "Las contraseñas no coinciden.";
  return null;
}

export function getPasswordUpdateErrorMessage(
  error: { code?: string } | null | undefined,
) {
  if (error?.code === "same_password") {
    return "La nueva contraseña debe ser diferente de tu contraseña actual.";
  }
  return "No se pudo actualizar la contraseña. Solicita un nuevo enlace o intenta nuevamente.";
}
