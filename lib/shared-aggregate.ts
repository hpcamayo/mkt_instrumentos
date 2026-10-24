import "server-only";
import { unstable_cache } from "next/cache";
import { READ_BUDGETS, createDeadline, settleWithin, type Deadline } from "@/lib/request-deadline";

// Public aggregates that every visitor sees alike (menu brands, type counts, facet counts for a set of filters) are
// computed once and shared (docs/operations/catalog-performance.md § Caching):
// - each server instance answers from memory while its last result is younger than `memoryFreshMs`, without a call;
// - with `persist` (the default), Next's data cache keeps a result for `revalidateSeconds` across requests and
//   instances, and refreshes it in the background after that while the old result keeps being served. Aggregates whose
//   key varies a lot (facets per filter set) stay in memory only, so a crawl of filter combinations does not write a
//   cache entry per combination; their API routes are shared through the CDN instead;
// - in each server instance, concurrent misses for one key share a single load (single flight), so an expired entry
//   does not send one query per waiting request;
// - a failed load is not cached, and for `cooldownMs` after it the key answers "unavailable" without touching the
//   database, so a failing query is not retried by every page render (unstable_cache does not keep failures, so
//   without this a timed-out menu count runs again on every render of every page);
// - the last good result in this instance stays usable for `maxStaleMs` when a refresh fails;
// - every load runs under its own deadline (`loadBudgetMs`), independent of the request that started it, and a request
//   waits for it at most until its own signal fires.
// Only anonymous, public data belongs here: loads use the public read client, which never sees a session.

type Entry<T> = { value: T; at: number };

// Across keys: after `failures` failed loads within `windowMs`, every key answers "unavailable" (or its last good
// result) for `openMs` without a database call. One breaker can serve several aggregates.
export function createBreaker({ failures = 3, windowMs = 10_000, openMs = 30_000 } = {}) {
  let recent: number[] = [];
  let openUntil = 0;
  return {
    isOpen: () => Date.now() < openUntil,
    fail() {
      const now = Date.now();
      recent = [...recent.filter((at) => now - at < windowMs), now];
      if (recent.length >= failures) {
        openUntil = now + openMs;
        recent = [];
      }
    },
    reset() {
      recent = [];
      openUntil = 0;
    },
  };
}
export type Breaker = ReturnType<typeof createBreaker>;

export type SharedAggregate<A extends unknown[], T> = {
  get: (signal: AbortSignal, ...args: A) => Promise<T | null>;
  // Tests: forget in-process state.
  reset: () => void;
};

export function sharedAggregate<A extends unknown[], T>(options: {
  key: string;
  revalidateSeconds: number;
  load: (deadline: Deadline, ...args: A) => Promise<T>;
  loadBudgetMs?: number;
  cooldownMs?: number;
  maxStaleMs?: number;
  // Bounds this instance's memory when the arguments vary (facets per filter set).
  maxEntries?: number;
  breaker?: Breaker;
  memoryFreshMs?: number;
  persist?: boolean;
}): SharedAggregate<A, T> {
  const { key, revalidateSeconds, load, loadBudgetMs = READ_BUDGETS.coreMs, cooldownMs = 30_000, maxStaleMs = 60 * 60_000, maxEntries = 200, breaker } = options;
  const memoryFreshMs = options.memoryFreshMs ?? Math.min(revalidateSeconds * 1000, 60_000);
  const persist = options.persist ?? true;
  const inflight = new Map<string, Promise<T>>();
  const failedAt = new Map<string, number>();
  const lastGood = new Map<string, Entry<T>>();

  const loadNow = async (...args: A) => load(createDeadline(loadBudgetMs), ...args);
  const cached = persist ? unstable_cache(loadNow, [key], { revalidate: revalidateSeconds, tags: [key] }) : loadNow;

  function remember<V>(map: Map<string, V>, id: string, value: V) {
    map.delete(id);
    map.set(id, value);
    if (map.size > maxEntries) map.delete(map.keys().next().value as string);
  }

  function start(id: string, args: A) {
    const running = inflight.get(id);
    if (running) return running;
    const work = cached(...args)
      .then((value) => {
        failedAt.delete(id);
        remember(lastGood, id, { value, at: Date.now() });
        return value;
      })
      .catch((error: unknown) => {
        remember(failedAt, id, Date.now());
        breaker?.fail();
        console.warn(`${key} is unavailable:`, error instanceof Error ? error.message : error);
        throw error;
      })
      .finally(() => inflight.delete(id));
    inflight.set(id, work);
    return work;
  }

  return {
    async get(signal, ...args) {
      const id = JSON.stringify(args);
      const stale = lastGood.get(id);
      if (stale && Date.now() - stale.at < memoryFreshMs) return stale.value;
      const usableStale = stale && Date.now() - stale.at <= maxStaleMs ? stale.value : null;
      const failed = failedAt.get(id);
      if ((failed !== undefined && Date.now() - failed < cooldownMs) || breaker?.isOpen()) return usableStale;
      return settleWithin<T | null>(start(id, args), signal, usableStale);
    },
    reset() {
      inflight.clear();
      failedAt.clear();
      lastGood.clear();
    },
  };
}
