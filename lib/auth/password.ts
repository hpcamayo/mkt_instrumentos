export function getPasswordValidationMessage(
  password: string,
  confirmation: string,
) {
  if (password.length < 8) return "Usa al menos 8 caracteres.";
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
