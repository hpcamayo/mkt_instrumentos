// Merchant-facing names for import states, shared by the start page and the wizard.
import { categoryOptions } from "@/lib/listings";
import type { StatusTone } from "@/lib/ui/status";

export const IMPORT_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  awaiting_upload: { label: "Esperando el archivo", tone: "neutral" },
  parsing: { label: "Leyendo el archivo", tone: "neutral" },
  mapping_required: { label: "Elegir columnas", tone: "warning" },
  validating: { label: "Revisando filas", tone: "neutral" },
  ready: { label: "Lista para confirmar", tone: "warning" },
  committing: { label: "Aplicando cambios", tone: "neutral" },
  committed: { label: "Aplicada", tone: "accent" },
  partially_committed: { label: "Aplicada en parte", tone: "warning" },
  failed: { label: "No se pudo leer", tone: "danger" },
  cancelled: { label: "Cancelada", tone: "line" },
  expired: { label: "Vencida", tone: "line" },
};

export const OPEN_IMPORT_STATUSES = ["awaiting_upload", "parsing", "mapping_required", "validating", "ready", "committing"];

export function importStatus(status: string) {
  return IMPORT_STATUS[status] ?? { label: status, tone: "neutral" as StatusTone };
}

// Category chips of a large import (review fix B3): rows whose Categoría was empty or not recognized.
export const IMPORT_NO_CATEGORY = "none";

// Chips for the categories present in `counts` ({category value | "none": rows}), in taxonomy order, "Sin categoría"
// last. Nothing to choose from (one group or none) means no chips.
export function importCategoryChips(counts: Record<string, number>) {
  const chips = [
    ...categoryOptions.filter((option) => (counts[option.value] ?? 0) > 0).map((option) => ({ value: option.value as string, label: option.label as string, count: counts[option.value] })),
    ...((counts[IMPORT_NO_CATEGORY] ?? 0) > 0 ? [{ value: IMPORT_NO_CATEGORY, label: "Sin categoría", count: counts[IMPORT_NO_CATEGORY] }] : []),
  ];
  return chips.length > 1 ? chips : [];
}

// stock-22 (Effortless Laria, stores): an open import closes on its own after 7 days without activity
// (expire_store_import_sessions, daily). Saying when turns a hidden deadline into a plan.
export const IMPORT_IDLE_DAYS = 7;

export function importExpiresAt(updatedAt: string) {
  return new Date(new Date(updatedAt).getTime() + IMPORT_IDLE_DAYS * 24 * 60 * 60 * 1000);
}

const expiryFormat = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", timeZone: "America/Lima" });

export function importExpiryText(updatedAt: string) {
  return `Vence el ${expiryFormat.format(importExpiresAt(updatedAt))} si no la continúas.`;
}
