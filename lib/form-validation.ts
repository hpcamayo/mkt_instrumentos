import { normalizeProfilePhone } from "@/lib/auth/profile";
import { normalizePeruRegion } from "@/lib/location";

export function profileFieldErrors(input: { fullName: string; phone: string; city: string; region: string }) {
  const errors: Record<string, string> = {};
  if (!input.fullName.trim()) errors.fullName = "Ingresa tu nombre completo.";
  if (!normalizeProfilePhone(input.phone)) errors.phone = "Ingresa un WhatsApp válido.";
  if (!input.city.trim()) errors.city = "Ingresa una ciudad válida.";
  if (!normalizePeruRegion(input.region)) errors.region = "Selecciona una región válida de Perú.";
  return errors;
}

export function storeFieldErrors(input: {
  name: string; razon_social: string; ruc: string; email: string; contact_person: string;
  whatsapp_phone: string; city: string; region: string; address: string;
}) {
  const errors: Record<string, string> = {};
  if (!input.name) errors.name = "Escribe el nombre público de la tienda.";
  if (!input.razon_social) errors.razon_social = "Escribe la razón social.";
  if (input.ruc.length !== 11) errors.ruc = "Ingresa un RUC de 11 dígitos.";
  if (!/^\S+@\S+\.\S+$/.test(input.email)) errors.email = "Ingresa un correo comercial válido.";
  if (!input.contact_person) errors.contact_person = "Escribe el nombre de la persona de contacto.";
  if (input.whatsapp_phone.length < 9) errors.whatsapp_phone = "Ingresa un teléfono o WhatsApp válido.";
  if (!input.city) errors.city = "Escribe la ciudad.";
  if (!input.region) errors.region = "Selecciona una región válida de Perú.";
  if (!input.address) errors.address = "Escribe la dirección física.";
  return errors;
}
