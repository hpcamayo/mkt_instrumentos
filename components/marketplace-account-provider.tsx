"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export type HeaderState = {
  authenticated: boolean;
  storeOwner: boolean;
  hasStore: boolean;
  admin: boolean;
  name: string | null;
  unreadNotifications: number;
  pendingBuyerConfirmations: number;
};
type FavoriteState = Record<string, boolean | undefined>;
// `settled` turns true after the first account check (success or failure) and stays true, so the header's
// account entry appears once instead of flashing "Ingresar" for a signed-in visitor.
type ContextValue = HeaderState & { ready: boolean; settled: boolean; favorites: FavoriteState; register: (id: string) => () => void; setFavorite: (id: string, saved: boolean) => Promise<void> };
const SIGNED_OUT: HeaderState = { authenticated: false, storeOwner: false, hasStore: false, admin: false, name: null, unreadNotifications: 0, pendingBuyerConfirmations: 0 };
const Context = createContext<ContextValue | null>(null);

export function MarketplaceAccountProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [header, setHeader] = useState<HeaderState>(SIGNED_OUT);
  const [ready, setReady] = useState(false);
  const [settled, setSettled] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteState>({});
  const ids = useRef(new Map<string, number>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const busy = useRef(new Set<string>());
  const invalidate = useCallback(() => ++generation.current, []);

  const loadStates = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const version = generation.current;
      const allIds = [...ids.current.keys()];
      try {
        for (let offset = 0; offset < allIds.length; offset += 100) {
          const batch = allIds.slice(offset, offset + 100);
          const response = await fetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "states", ids: batch }) });
          if (!response.ok || version !== generation.current) return;
          const result = await response.json();
          const saved = new Set<string>(result.saved);
          setFavorites((current) => { const next = { ...current }; for (const id of batch) if (!busy.current.has(id)) next[id] = saved.has(id); return next; });
        }
      } catch { /* Unknown state stays unavailable, not a fictional saved value. */ }
    }, 25);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const version = invalidate();
      setReady(false);
      setFavorites({});
      try {
        const response = await fetch("/api/account-navigation", { cache: "no-store" });
        if (!response.ok || !active || version !== generation.current) return;
        const state: HeaderState = { ...SIGNED_OUT, ...(await response.json()) };
        if (!active || version !== generation.current) return;
        setHeader(state); setReady(true);
        if (state.authenticated) loadStates();
      } catch { /* Header links are navigation, never an authorization boundary. */ } finally {
        if (active) setSettled(true);
      }
    };
    void refresh();
    // Keep the global shell independent of the large browser Auth SDK. Route,
    // tab-focus and cross-tab changes revalidate trusted server state instead.
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => { active = false; invalidate(); window.removeEventListener("focus", refresh); window.removeEventListener("storage", refresh); if (timer.current) clearTimeout(timer.current); };
  }, [pathname, loadStates, invalidate]);

  const register = useCallback((id: string) => {
    ids.current.set(id, (ids.current.get(id) ?? 0) + 1);
    if (ready && header.authenticated) loadStates();
    return () => { const count = (ids.current.get(id) ?? 1) - 1; if (count) ids.current.set(id, count); else ids.current.delete(id); };
  }, [ready, header.authenticated, loadStates]);

  const setFavorite = useCallback(async (id: string, saved: boolean) => {
    if (busy.current.has(id)) return;
    busy.current.add(id);
    const version = ++generation.current;
    try {
      const response = await fetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set", id, saved }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo guardar el favorito.");
      if (version === generation.current) setFavorites((current) => ({ ...current, [id]: result.saved }));
    } finally { busy.current.delete(id); loadStates(); }
  }, [loadStates]);

  return <Context.Provider value={{ ...header, ready, settled, favorites, register, setFavorite }}>{children}</Context.Provider>;
}

// The state every consumer renders on the server: the provider's initial state.
const SERVER_STATE = { ...SIGNED_OUT, ready: false, settled: false, favorites: {} as FavoriteState };
const subscribeToNothing = () => () => {};

// A section that streams in late (the listing page's related listings) hydrates after the first account check may have
// finished. Hydrating it with the live state rendered a different element than the server sent (a sign-in link instead
// of the disabled favourite button) and React threw #418 (docs/ux-redesign/ux-4-listing-store.md § First task). So while
// a component hydrates it gets the server's state (useSyncExternalStore's server snapshot), then the live state.
export function useMarketplaceAccount(): ContextValue {
  const value = useContext(Context);
  const hydrating = useSyncExternalStore(subscribeToNothing, () => false, () => true);
  if (!value) throw new Error("Marketplace account context required.");
  return hydrating ? { ...value, ...SERVER_STATE } : value;
}
