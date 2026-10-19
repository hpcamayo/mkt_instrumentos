// Libro de Reclamaciones virtual (EASE stores trust-05). Ley 29571, Código de Protección y Defensa del Consumidor, and
// its Reglamento del Libro de Reclamaciones (D.S. 011-2011-PCM and amendments).
// PENDIENTE DE REVISIÓN LEGAL ANTES DE PRODUCCIÓN: the provider data below are marked stand-ins until Laria's legal
// entity is confirmed, and the answer term must be checked against the regulation in force at go-live.
// The limits mirror the checks in supabase/migrations/20261106150000_ux_complaints_book.sql.

export const COMPLAINTS_BOOK_PATH = "/libro-de-reclamaciones";
export const COMPLAINTS_BOOK_LABEL = "Libro de Reclamaciones";

// Laria's legal data are not in the repo. Every value stays visibly bracketed until legal replaces it; never put an
// invented RUC here.
export const COMPLAINTS_BOOK_PROVIDER = {
  businessName: "[Razón social de Laria por confirmar]",
  ruc: "[RUC por confirmar]",
  address: "[Domicilio fiscal por confirmar]",
  pendingLegalData: true,
} as const;

// Plazo de respuesta: Ley 29571, art. 24, as amended by Ley 31435 (2022), and the Reglamento as amended by
// D.S. 101-2022-PCM: quince (15) días hábiles improrrogables. Legal review confirms it before production.
export const COMPLAINTS_BOOK_ANSWER_DAYS = 15;
export const COMPLAINTS_BOOK_ANSWER_TERM = "quince (15) días hábiles improrrogables";

export const COMPLAINTS_BOOK_LIMITS = {
  consumerName: [3, 160],
  address: [5, 300],
  guardianName: [3, 160],
  itemDescription: [3, 1000],
  detail: [10, 3000],
  request: [3, 2000],
} as const;

export const DOCUMENT_TYPES = [
  { value: "dni", label: "DNI", pattern: /^[0-9]{8}$/, hint: "8 dígitos." },
  { value: "ce", label: "Carné de extranjería", pattern: /^[A-Z0-9]{6,12}$/, hint: "De 6 a 12 letras o dígitos." },
  { value: "pasaporte", label: "Pasaporte", pattern: /^[A-Z0-9]{6,12}$/, hint: "De 6 a 12 letras o dígitos." },
  { value: "ruc", label: "RUC", pattern: /^[0-9]{11}$/, hint: "11 dígitos." },
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number]["value"];
export type ComplaintType = "reclamo" | "queja";
export type ItemType = "producto" | "servicio";

export type ComplaintsBookInput = {
  consumerName: string;
  documentType: string;
  documentNumber: string;
  address: string;
  phone: string;
  email: string;
  isMinor: boolean;
  guardianName: string;
  itemType: string;
  claimedAmount: string;
  itemDescription: string;
  listingSlug: string;
  complaintType: string;
  detail: string;
  request: string;
  declaration: boolean;
};

export type ComplaintsBookEntry = {
  consumerName: string;
  documentType: DocumentType;
  documentNumber: string;
  address: string;
  phone: string;
  email: string;
  isMinor: boolean;
  guardianName: string | null;
  itemType: ItemType;
  claimedAmount: number | null;
  itemDescription: string;
  listingSlug: string | null;
  complaintType: ComplaintType;
  detail: string;
  request: string;
};

export const EMAIL_PATTERN = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const PHONE_PATTERN = /^[0-9+ ]{6,20}$/;
const AMOUNT_PATTERN = /^[0-9]{1,10}([.,][0-9]{1,2})?$/;
export const LISTING_SLUG_PATTERN = /^[a-z0-9-]{1,200}$/;

export function normalizeDocumentNumber(value: string) {
  return value.replace(/\s/g, "").toUpperCase();
}

// "1500", "1500.5" or "1500,50" in soles; empty means no amount.
export function parseClaimedAmount(value: string): number | null | undefined {
  const text = value.replace(/\s/g, "");
  if (!text) return null;
  if (!AMOUNT_PATTERN.test(text)) return undefined;
  return Number(text.replace(",", "."));
}

function lengthError(value: string, [min, max]: readonly [number, number], empty: string) {
  if (!value) return empty;
  if (value.length < min) return `Usa al menos ${min} caracteres.`;
  if (value.length > max) return `Usa como máximo ${max} caracteres.`;
  return "";
}

// The same rules the database enforces, checked first in the browser so each field says what to fix.
export function complaintsBookErrors(input: ComplaintsBookInput) {
  const errors: Record<string, string> = {};
  const set = (name: string, message: string) => { if (message) errors[name] = message; };
  set("consumerName", lengthError(input.consumerName.trim(), COMPLAINTS_BOOK_LIMITS.consumerName, "Escribe tu nombre completo."));
  const documentType = DOCUMENT_TYPES.find((type) => type.value === input.documentType);
  if (!documentType) errors.documentType = "Elige el tipo de documento.";
  const documentNumber = normalizeDocumentNumber(input.documentNumber);
  if (!documentNumber) errors.documentNumber = "Escribe el número de tu documento.";
  else if (documentType && !documentType.pattern.test(documentNumber)) errors.documentNumber = `Revisa el número: ${documentType.hint}`;
  set("address", lengthError(input.address.trim(), COMPLAINTS_BOOK_LIMITS.address, "Escribe tu domicilio."));
  if (!PHONE_PATTERN.test(input.phone.trim())) errors.phone = "Escribe un teléfono de 6 a 20 dígitos.";
  if (!EMAIL_PATTERN.test(input.email.trim()) || input.email.trim().length > 254) errors.email = "Escribe un correo válido.";
  if (input.isMinor) set("guardianName", lengthError(input.guardianName.trim(), COMPLAINTS_BOOK_LIMITS.guardianName, "Escribe el nombre de tu padre, madre o apoderado."));
  if (input.itemType !== "producto" && input.itemType !== "servicio") errors.itemType = "Elige una opción.";
  if (parseClaimedAmount(input.claimedAmount) === undefined) errors.claimedAmount = "Escribe el monto en soles, por ejemplo 1500 o 1500.50.";
  set("itemDescription", lengthError(input.itemDescription.trim(), COMPLAINTS_BOOK_LIMITS.itemDescription, "Describe qué contrataste o sobre qué es tu reclamo."));
  if (input.complaintType !== "reclamo" && input.complaintType !== "queja") errors.complaintType = "Elige reclamo o queja.";
  set("detail", lengthError(input.detail.trim(), COMPLAINTS_BOOK_LIMITS.detail, "Cuenta qué pasó."));
  set("request", lengthError(input.request.trim(), COMPLAINTS_BOOK_LIMITS.request, "Escribe qué solicitas."));
  if (!input.declaration) errors.declaration = "Marca la declaración para registrar la hoja.";
  return errors;
}

export function toComplaintsBookEntry(input: ComplaintsBookInput): ComplaintsBookEntry {
  const slug = input.listingSlug.trim();
  return {
    consumerName: input.consumerName.trim(),
    documentType: input.documentType as DocumentType,
    documentNumber: normalizeDocumentNumber(input.documentNumber),
    address: input.address.trim(),
    phone: input.phone.trim(),
    email: input.email.trim().toLowerCase(),
    isMinor: input.isMinor,
    guardianName: input.isMinor ? input.guardianName.trim() : null,
    itemType: input.itemType as ItemType,
    claimedAmount: parseClaimedAmount(input.claimedAmount) ?? null,
    itemDescription: input.itemDescription.trim(),
    listingSlug: LISTING_SLUG_PATTERN.test(slug) ? slug : null,
    complaintType: input.complaintType as ComplaintType,
    detail: input.detail.trim(),
    request: input.request.trim(),
  };
}

export function complaintsBookRpcArgs(entry: ComplaintsBookEntry) {
  return {
    p_consumer_name: entry.consumerName,
    p_document_type: entry.documentType,
    p_document_number: entry.documentNumber,
    p_address: entry.address,
    p_phone: entry.phone,
    p_email: entry.email,
    p_is_minor: entry.isMinor,
    p_guardian_name: entry.guardianName,
    p_item_type: entry.itemType,
    p_claimed_amount: entry.claimedAmount,
    p_item_description: entry.itemDescription,
    p_listing_slug: entry.listingSlug,
    p_complaint_type: entry.complaintType,
    p_detail: entry.detail,
    p_request: entry.request,
    p_declaration_accepted: true,
  };
}

export function complaintsBookErrorMessage(message: string) {
  if (message.includes("COMPLAINT_RATE_LIMITED")) return "Ya registraste varias hojas con este correo hoy. Si necesitas agregar algo, espera 24 horas o usa el canal de contacto de Laria.";
  if (message.includes("COMPLAINT_INVALID") || message.includes("COMPLAINT_DECLARATION_REQUIRED")) return "Revisa los datos de la hoja: alguno no tiene el formato esperado.";
  return "No pudimos registrar la hoja. Revisa tu conexión e inténtalo de nuevo; tus datos siguen en el formulario.";
}

// Sheet date in Lima time, e.g. "19 de octubre de 2026, 14:32".
export function formatSheetDate(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Lima" }).format(new Date(iso));
}

export function formatClaimedAmount(amount: number | null) {
  if (amount === null) return "No indicado";
  return `S/ ${new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}

export function documentTypeLabel(value: string) {
  return DOCUMENT_TYPES.find((type) => type.value === value)?.label ?? value;
}

// ?publicacion=<slug> from a listing page prefills the description of the "bien"; it stays optional and editable.
export function listingContextDescription(listing: { title: string; slug: string } | null) {
  return listing ? `Publicación «${listing.title}» en Laria (${listingPath(listing.slug)}).` : "";
}

function listingPath(slug: string) {
  return `/instrumentos/${slug}`;
}
