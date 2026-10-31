import { buildWhatsAppHref, formatPhoneForDisplay, isValidWhatsAppPhone } from "@/lib/phone";

// safe-10 (accounts batch): Laria's own WhatsApp support line. It shows only once both the number and its hours are
// set (NEXT_PUBLIC_SUPPORT_WHATSAPP, digits with the country code; NEXT_PUBLIC_SUPPORT_HOURS, e.g. "lunes a viernes,
// de 9:00 a 18:00"), so the help center never offers a line nobody answers.
export function supportWhatsApp() {
  const number = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.trim() ?? "";
  const hours = process.env.NEXT_PUBLIC_SUPPORT_HOURS?.trim() ?? "";
  if (!number || !hours || !isValidWhatsAppPhone(number)) return null;
  return {
    href: buildWhatsAppHref(number, "Hola, tengo una consulta sobre Laria."),
    display: formatPhoneForDisplay(number),
    hours,
  };
}
