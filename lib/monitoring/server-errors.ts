import type { Instrumentation } from "next";
import { recordAppError } from "@/lib/monitoring/record-error";

type RequestErrorContext = Parameters<Instrumentation.onRequestError>[2];
type WaitUntil = (promise: Promise<unknown>) => void;

// Launch audit A13: an error Next.js caught while rendering a page or running an API route, a server action or the
// middleware (instrumentation.ts) is counted under the route's file pattern, never the address, which can carry ids
// and query strings. Next.js still logs it to Vercel's runtime logs as before. The count is saved after the response
// (the request's waitUntil) when the platform offers it, so an error page is never held up by it.
export async function recordServerError(error: unknown, context: RequestErrorContext) {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const failure = error instanceof Error ? error : null;
  const digest = (error as { digest?: unknown } | null)?.digest;
  const saving = recordAppError({
    source: "server",
    kind: context.routeType,
    route: context.routePath,
    name: failure?.name || "Error",
    message: failure ? failure.message : String(error),
    digest: typeof digest === "string" ? digest : null,
  });
  const waitUntil = requestWaitUntil();
  if (waitUntil) waitUntil(saving);
  else await saving;
}

// The waitUntil Vercel gives each request, read the way Next.js's after() and @vercel/functions read it.
function requestWaitUntil(): WaitUntil | null {
  for (const name of ["@next/request-context", "@vercel/request-context"]) {
    const store = (globalThis as Record<symbol, { get?: () => { waitUntil?: WaitUntil } | undefined } | undefined>)[Symbol.for(name)];
    const context = store?.get?.();
    if (typeof context?.waitUntil === "function") return (promise) => context.waitUntil?.(promise);
  }
  return null;
}
