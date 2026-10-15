// Merchant-facing names for import states, shared by the start page and the wizard.
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
