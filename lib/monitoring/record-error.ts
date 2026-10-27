// Launch audit A13: counts an error in the database (public.record_app_error, supabase/migrations/
// 20261114170000_launch_audit_monitoring.sql), which keeps its message only as one of a fixed set, so nothing that could
// identify someone, for Admin > Errores. Server code only: it sends the service role key. It calls PostgREST with the platform's fetch
// rather than the Supabase client, so instrumentation.ts can use it in either runtime, and rather than Next.js's
// fetch, which would count the call as part of the page: an error during a background page refresh would then turn
// the cached page dynamic. Best effort: it never throws, gives up after 2.5 seconds, and does nothing without the
// database settings (local builds and tests). The arguments are still checked against the generated types (`satisfies`),
// so a renamed one fails the typecheck instead of silently stopping the count.
import type { Database } from "@/lib/supabase/database";

export type AppErrorReport = {
  source: "server" | "browser";
  kind: string;
  route: string;
  name: string;
  message: string;
  client?: string;
  digest?: string | null;
};

const RECORD_TIMEOUT_MS = 2_500;

export async function recordAppError(report: AppErrorReport) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const response = await platformFetch()(`${url.replace(/\/+$/, "")}/rest/v1/rpc/record_app_error`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        p_source: report.source,
        p_kind: report.kind.slice(0, 40),
        p_route: report.route.slice(0, 1000),
        p_name: report.name.slice(0, 80),
        p_message: report.message.slice(0, 2000),
        p_client: (report.client ?? "").slice(0, 40),
        p_digest: report.digest ? report.digest.slice(0, 40) : null,
      } satisfies Database["public"]["Functions"]["record_app_error"]["Args"]),
      signal: AbortSignal.timeout(RECORD_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// The fetch Next.js wraps, which it keeps on its wrapper; the global one where Next.js hasn't wrapped it.
function platformFetch(): typeof fetch {
  const current = globalThis.fetch as typeof fetch & { _nextOriginalFetch?: typeof fetch };
  return current._nextOriginalFetch ?? current;
}

const CLIENT_KINDS = new Set(["error", "unhandledrejection", "boundary"]);

// The body lib/monitoring/client-errors.ts sends, or null when it isn't one.
export function parseClientErrorReport(text: string): Pick<AppErrorReport, "kind" | "route" | "name" | "message"> | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { kind, name, message, route } = body as Record<string, unknown>;
  if (typeof kind !== "string" || !CLIENT_KINDS.has(kind)) return null;
  if (typeof name !== "string" || typeof message !== "string" || typeof route !== "string") return null;
  if (!route.startsWith("/")) return null;
  return { kind, name: name.slice(0, 80), message: message.slice(0, 1000), route: route.split(/[?#]/)[0].slice(0, 300) };
}

// The browser family and platform from the User-Agent, so an error that only one browser shows stands out, the in-app
// browsers of Instagram, Facebook and TikTok included. Never the User-Agent itself.
export function browserFamily(userAgent: string | null) {
  const agent = userAgent ?? "";
  const name = /Instagram/.test(agent) ? "Instagram"
    : /FBAN|FBAV|FB_IAB/.test(agent) ? "Facebook"
      : /musical_ly|TikTok|BytedanceWebview/.test(agent) ? "TikTok"
        : /SamsungBrowser/.test(agent) ? "Samsung Internet"
          : /EdgA?\/|EdgiOS/.test(agent) ? "Edge"
            : /OPR\/|Opera/.test(agent) ? "Opera"
              : /Firefox\/|FxiOS/.test(agent) ? "Firefox"
                : /CriOS|Chrome\//.test(agent) ? "Chrome"
                  : /Safari\//.test(agent) ? "Safari"
                    : "";
  if (!name) return "Otro";
  const platform = /iPhone|iPad|iPod/.test(agent) ? "iOS" : /Android/.test(agent) ? "Android" : "";
  return platform ? `${name} ${platform}` : name;
}
