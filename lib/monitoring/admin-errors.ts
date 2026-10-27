import type { Json } from "@/lib/supabase/database.types";

// Launch audit A13: the rows of Admin > Errores (public.get_admin_app_errors) and how the page names them.
export type AppErrorRow = {
  fingerprint: string;
  source: "server" | "browser";
  kind: string;
  route: string;
  name: string;
  message: string;
  client: string;
  digest: string | null;
  occurrences: number;
  first_at: string;
  last_at: string;
};

export const APP_ERROR_PERIODS = [1, 7, 30] as const;
export const APP_ERROR_SOURCES = [
  { param: "", source: null, label: "Todos" },
  { param: "servidor", source: "server", label: "Servidor" },
  { param: "navegador", source: "browser", label: "Navegador" },
] as const;

const KIND_LABELS: Record<string, string> = {
  render: "Página",
  route: "Ruta de la API",
  action: "Acción de un formulario",
  middleware: "Middleware",
  error: "Error en la página",
  unhandledrejection: "Promesa sin respuesta",
  boundary: "Pantalla de error",
  overflow: "Otros errores",
};

export function appErrorKindLabel(kind: string) {
  return KIND_LABELS[kind] ?? kind;
}

export function parseAppErrors(value: Json | null): AppErrorRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const { fingerprint, source, kind, route, name, message, client, digest, occurrences, first_at, last_at } = entry;
    if (typeof fingerprint !== "string" || (source !== "server" && source !== "browser")) return [];
    if (typeof occurrences !== "number" || typeof first_at !== "string" || typeof last_at !== "string") return [];
    return [{
      fingerprint,
      source,
      kind: typeof kind === "string" ? kind : "",
      route: typeof route === "string" ? route : "",
      name: typeof name === "string" ? name : "Error",
      message: typeof message === "string" ? message : "",
      client: typeof client === "string" ? client : "",
      digest: typeof digest === "string" ? digest : null,
      occurrences,
      first_at,
      last_at,
    }];
  });
}
