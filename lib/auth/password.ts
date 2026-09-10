export function getPasswordValidationMessage(
  password: string,
  confirmation: string,
) {
  if (password.length < 8) return "Usa al menos 8 caracteres.";
  if (password !== confirmation) return "Las contraseñas no coinciden.";
  return null;
}
