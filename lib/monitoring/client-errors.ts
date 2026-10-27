// Launch audit A13: errors in the visitor's browser go to /api/client-errors, which counts them like the server's for
// Admin > Errores. At most five reports per page load, each error once, and never what the site can't fix: browser
// extensions and other sites' scripts, cancelled requests, lost connections and the ResizeObserver notice browsers
// raise on their own. An error page showing a server error (its error carries the server's digest) sends nothing,
// since the server counted it already. Best effort: reporting never throws.
export type ClientErrorKind = "error" | "unhandledrejection" | "boundary";

const MAX_REPORTS_PER_PAGE = 5;
const reported = new Set<string>();

const NOISE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /^(Failed to fetch|Load failed|Network request failed|NetworkError when attempting to fetch resource\.?|The network connection was lost\.?)$/i,
  /^(The operation was aborted\.?|The user aborted a request\.?|signal is aborted without reason)$/i,
];

export function describeClientError(reason: unknown) {
  if (reason instanceof Error) return { name: reason.name || "Error", message: reason.message };
  if (typeof reason === "string") return { name: "Error", message: reason };
  if (reason && typeof reason === "object") {
    const { name, message, code } = reason as { name?: unknown; message?: unknown; code?: unknown };
    if (typeof message === "string") {
      return { name: typeof name === "string" && name ? name : "Error", message: typeof code === "string" ? `${message} (${code})` : message };
    }
  }
  return { name: "Error", message: String(reason) };
}

export function isIgnoredClientError(name: string, message: string, filename?: string) {
  if (name === "AbortError") return true;
  if (filename && !isOwnScript(filename)) return true;
  return NOISE.some((pattern) => pattern.test(message.trim()));
}

function isOwnScript(filename: string) {
  try {
    return new URL(filename, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function reportClientError(kind: ClientErrorKind, reason: unknown, filename?: string) {
  try {
    if (reported.size >= MAX_REPORTS_PER_PAGE) return;
    if (kind === "boundary" && typeof (reason as { digest?: unknown } | null)?.digest === "string") return;
    const { name, message } = describeClientError(reason);
    if (isIgnoredClientError(name, message, filename)) return;
    const key = `${name}:${message}`;
    if (reported.has(key)) return;
    reported.add(key);
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, name: name.slice(0, 80), message: message.slice(0, 1000), route: window.location.pathname.slice(0, 300) }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Reporting an error must never add one.
  }
}
