export const LEGAL_LAST_UPDATED = "27 de septiembre de 2026";

export const legalPages = [
  { href: "/terminos", label: "Términos y reglas" },
  { href: "/privacidad", label: "Privacidad" },
  { href: "/articulos-prohibidos", label: "Artículos prohibidos" },
  { href: "/consejos-de-seguridad", label: "Consejos de seguridad" },
] as const;

// Official contact channel for legal/privacy requests. Must be configured before go-live.
export function getLegalContactEmail() {
  const value = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  return value && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value) ? value : null;
}
