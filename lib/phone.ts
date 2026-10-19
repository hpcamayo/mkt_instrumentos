// WhatsApp numbers (fix-01). Numbers are stored as digits with the country code, so wa.me links work.
// Peruvians write mobiles as nine digits starting with 9 ("987 654 321"); those get 51 in front.
// The same rule runs in the database (laria_private.normalize_pe_phone), which also fixes stored numbers.

export const PERU_COUNTRY_CODE = "51";

export function normalizePeruPhone(value: string | null | undefined) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^9\d{8}$/.test(digits)) return `${PERU_COUNTRY_CODE}${digits}`;
  return digits;
}

// A number WhatsApp can open: country code plus subscriber number, 10 to 15 digits.
export function isValidWhatsAppPhone(value: string | null | undefined) {
  return /^\d{10,15}$/.test(normalizePeruPhone(value));
}

export function formatPhoneForDisplay(value: string | null | undefined) {
  const digits = normalizePeruPhone(value);
  if (!digits) return "";
  const peruMobile = /^51(9\d{2})(\d{3})(\d{3})$/.exec(digits);
  if (peruMobile) return `+51 ${peruMobile[1]} ${peruMobile[2]} ${peruMobile[3]}`;
  return `+${digits}`;
}

export function buildWhatsAppHref(value: string | null | undefined, message?: string) {
  const digits = normalizePeruPhone(value);
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${text}`;
}
