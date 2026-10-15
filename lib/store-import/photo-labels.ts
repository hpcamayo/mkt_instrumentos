import type { StatusTone } from "@/lib/ui/status";

// Why a photo was refused after upload (server check or database cross-check).
export const PHOTO_REJECT_LABELS: Record<string, string> = {
  PHOTO_NOT_IMAGE: "No es una foto JPG, PNG o WebP válida",
  PHOTO_TOO_LARGE: "Pesa más de 5 MB",
  PHOTO_DIMENSIONS: "Debe medir entre 400 y 8000 px por lado",
  PHOTO_SUSPICIOUS: "El archivo contiene algo más que una foto",
  PHOTO_TYPE_MISMATCH: "El formato no coincide con el archivo",
  PHOTO_INVALID: "No se pudo comprobar la foto",
};

// Why a valid photo is not placed on any SKU.
export const PHOTO_ISSUE_LABELS: Record<string, string> = {
  no_sku_in_name: "El nombre no sigue el formato SKU__01.jpg",
  unmatched_sku: "Ese SKU no está en este archivo",
  ambiguous_sku: "Ese SKU está en más de una fila",
  listed_twice: "La columna Foto(s) la nombra en más de una fila",
  duplicate_sequence: "Otra foto ya usa ese número para el mismo SKU",
  duplicate_image: "Es la misma foto que otra ya subida",
  over_limit: "El SKU ya tiene 10 fotos",
  removed: "La quitaste",
};

export const PHOTO_SOURCE_LABELS: Record<string, string> = {
  column: "Columna Foto(s)",
  manifest: "Lista de fotos",
  filename: "Nombre del archivo",
  manual: "Asignada por ti",
};

export const PHOTO_ROW_STATES: Record<string, { label: string; tone: StatusTone }> = {
  ready: { label: "Fotos listas", tone: "accent" },
  too_few: { label: "Falta 1 foto", tone: "warning" },
  none: { label: "Sin fotos", tone: "line" },
  too_many: { label: "Más de 10 fotos", tone: "danger" },
  blocked: { label: "Revisa el orden", tone: "danger" },
};
