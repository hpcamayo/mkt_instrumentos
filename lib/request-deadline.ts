// Time budgets for public reads (docs/operations/catalog-performance.md § Budgets). A deadline is an AbortSignal that
// fires when the budget is spent, plus the moment it does, so work started later only gets what is left. Every public
// catalog read passes a budget signal to fetch, which cancels the HTTP request itself. PostgREST does not cancel a
// statement whose client has gone, so the database stops it on its own role limit (anon 3 s on Supabase); the core
// budget sits just above that limit, so the usual failure is the database's own timeout, reported as an error.
//
// The budgets leave room for a slow network and a busy database, not for a query that has gone wrong (measurements in
// the same doc).
export const READ_BUDGETS = {
  // Counts, menus, suggestions, price guidance, empty-search rescue: the page renders without them.
  optionalMs: 1500,
  // The listings themselves (catalog page, listing, store, home feed). Just above the database's 3 s anon limit, so the
  // usual failure is the database's own timeout, reported as an error.
  coreMs: 3500,
  // Everything one server render waits for, metadata and layout included: far below Vercel's 300 s limit.
  pageMs: 8000,
  // One browser-facing API request (facets, suggestions, next page).
  routeMs: 4000,
} as const;

export type Deadline = { readonly signal: AbortSignal; readonly expiresAt: number };

export function createDeadline(ms: number, parent?: Deadline | AbortSignal | null): Deadline {
  const parentSignal = parent && "signal" in parent ? parent.signal : (parent ?? null);
  const parentExpires = parent && "expiresAt" in parent ? parent.expiresAt : Number.POSITIVE_INFINITY;
  const expiresAt = Math.min(Date.now() + Math.max(0, ms), parentExpires);
  const own = AbortSignal.timeout(Math.max(0, expiresAt - Date.now()));
  return { signal: parentSignal ? AbortSignal.any([own, parentSignal]) : own, expiresAt };
}

export function remainingMs(deadline: Deadline) {
  return Math.max(0, deadline.expiresAt - Date.now());
}

// A signal for one call: the call's own budget, never past the deadline, and the caller's signal when there is one.
export function budgetSignal(deadline: Deadline | null | undefined, ms: number, caller?: AbortSignal | null) {
  const signals = [AbortSignal.timeout(deadline ? Math.min(ms, remainingMs(deadline)) : ms)];
  if (deadline) signals.push(deadline.signal);
  if (caller) signals.push(caller);
  return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}

export function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const { name, code, message } = error as { name?: unknown; code?: unknown; message?: unknown };
  return name === "AbortError" || name === "TimeoutError" || code === "ABORT_ERR" || code === 23
    || (typeof message === "string" && /^(AbortError|TimeoutError)\b/.test(message));
}

// Waits for shared work (a cache refresh other requests also wait for) until the signal fires, then gives up with the
// fallback. The shared work itself is bounded by its own deadline (lib/shared-aggregate.ts), so giving up here never
// leaves unbounded work behind; per-request reads cancel their fetch instead and never go through this.
export function settleWithin<T>(work: Promise<T>, signal: AbortSignal, fallback: T): Promise<T> {
  if (signal.aborted) {
    work.catch(() => undefined);
    return Promise.resolve(fallback);
  }
  return new Promise<T>((resolve) => {
    const onAbort = () => resolve(fallback);
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      () => {
        signal.removeEventListener("abort", onAbort);
        resolve(fallback);
      },
    );
  });
}
