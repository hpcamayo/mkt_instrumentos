// mine-03: the moderator's fixed list of rejection reasons. Labels match laria_private.ux_rejection_reason_label()
// (supabase/migrations/20261105120000_ux_my_listings_lifecycle.sql); `fields` are the edit-form fields each reason
// concerns, so the edit page can mark them.
export type ListingField = "photos" | "title" | "category" | "instrument_type" | "brand" | "model" | "condition" | "price_pen" | "description";

export const REJECTION_REASONS = [
  { code: "pocas_fotos", label: "Pocas fotos o fotos poco claras", fields: ["photos"] },
  { code: "falta_reverso", label: "Falta una foto del reverso o de los detalles", fields: ["photos"] },
  { code: "precio_incoherente", label: "El precio no es coherente con el equipo", fields: ["price_pen"] },
  { code: "contacto_en_descripcion", label: "Datos de contacto en la descripción", fields: ["description"] },
  { code: "descripcion_incompleta", label: "La descripción no explica el estado real", fields: ["description"] },
  { code: "titulo_impreciso", label: "El título no identifica el equipo", fields: ["title"] },
  { code: "categoria_incorrecta", label: "Categoría o tipo incorrectos", fields: ["category", "instrument_type"] },
  { code: "marca_modelo", label: "Marca o modelo incorrectos", fields: ["brand", "model"] },
  { code: "condicion_incoherente", label: "La condición no coincide con las fotos", fields: ["condition"] },
  { code: "articulo_prohibido", label: "El equipo está entre los Artículos prohibidos", fields: [] },
] as const satisfies readonly { code: string; label: string; fields: readonly ListingField[] }[];

export type RejectionCode = (typeof REJECTION_REASONS)[number]["code"];

const BY_CODE = new Map<string, (typeof REJECTION_REASONS)[number]>(REJECTION_REASONS.map((reason) => [reason.code, reason]));

export function rejectionReasonLabel(code: string) {
  return BY_CODE.get(code)?.label ?? null;
}

// Known codes only, in list order of the moderator's choice; unknown values are dropped.
export function parseRejectionCodes(value: unknown): RejectionCode[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((code): code is RejectionCode => typeof code === "string" && BY_CODE.has(code)))];
}

export function fieldsForRejection(codes: readonly string[]): Set<ListingField> {
  return new Set(codes.flatMap((code) => [...(BY_CODE.get(code)?.fields ?? [])]));
}

// The moderator's free note, which the database appends to the labels as ". Nota: …".
export function rejectionNote(reason: string | null | undefined) {
  const marker = ". Nota: ";
  if (!reason) return null;
  const index = reason.indexOf(marker);
  return index >= 0 ? reason.slice(index + marker.length) : null;
}
