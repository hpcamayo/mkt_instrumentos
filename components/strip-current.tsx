"use client";

import { useEffect, useSyncExternalStore } from "react";

// The category strip's current item when the URL alone cannot tell it (UX-4 L13 A): a listing page names its category,
// a verified store's page names "verified_stores". The page renders <StripCurrent value=… />; the strip reads it after
// hydration (the server snapshot is null, so the first render matches) and forgets it when the page goes. The
// underline is an inset shadow, so marking the item shifts nothing.
let current: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(value: string | null) {
  current = value;
  for (const listener of listeners) listener();
}

export function useStripCurrent() {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

export function StripCurrent({ value }: { value: string }) {
  useEffect(() => {
    publish(value);
    return () => publish(null);
  }, [value]);
  return null;
}
