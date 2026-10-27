import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { READ_BUDGETS, budgetSignal, createDeadline, type Deadline } from "@/lib/request-deadline";
import type { Database } from "@/lib/supabase/database";

// The anonymous client for public catalog reads (docs/operations/catalog-performance.md § Budgets): the same anon key
// and row-level security as lib/supabase/public-client.ts, plus
// - a deadline: every request's fetch carries a signal that fires at the call's budget (core by default; optional
//   reads pass a shorter one with .abortSignal) or when the deadline is spent, whichever comes first, and still honors
//   a caller's own signal;
// - no automatic retries: postgrest-js retries GET/HEAD three times (1 s, 2 s, 4 s) on network errors and 503/520,
//   which multiplies requests against a database that is already failing.
// It never reads cookies or a session, so nothing it returns depends on who is asking: safe for shared caches.
// Writes, uploads, auth and workers keep their own clients.

export type PublicReadClient = ReturnType<typeof createClient<Database>>;

export const NO_RETRY_REASON = "Automatic retries are off for public reads";

export function createPublicReadClient(deadline: Deadline, defaultMs: number = READ_BUDGETS.coreMs): PublicReadClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => {
        // A retry the builder might still attempt is refused before it reaches the network.
        if (new Headers(init?.headers).has("X-Retry-Count")) return Promise.reject(new DOMException(NO_RETRY_REASON, "AbortError"));
        return fetch(input, { ...init, signal: budgetSignal(deadline, defaultMs, init?.signal) });
      },
    },
  });
  // supabase-js does not pass postgrest-js's `retry` option through; the REST client reads it for every query.
  (client as unknown as { rest: { retry?: boolean } }).rest.retry = false;
  return client;
}

// One deadline and one client per server render (React cache is request-scoped), shared by the layout, metadata and
// the page, so sequential reads draw on one total budget. Route handlers create their own with createDeadline.
export const getRequestReads = cache(() => {
  const deadline = createDeadline(READ_BUDGETS.pageMs);
  return { deadline, supabase: createPublicReadClient(deadline) };
});

// A signal for an optional read inside this render: the optional budget, never past the render's deadline.
export function optionalReadSignal(deadline: Deadline) {
  return budgetSignal(deadline, READ_BUDGETS.optionalMs);
}
