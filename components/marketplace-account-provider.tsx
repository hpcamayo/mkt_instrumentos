"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type HeaderState = { authenticated: boolean; storeOwner: boolean; hasStore: boolean };
type FavoriteState = Record<string, boolean | undefined>;
type ContextValue = HeaderState & { ready: boolean; favorites: FavoriteState; register: (id: string) => () => void; setFavorite: (id: string, saved: boolean) => Promise<void> };
const Context = createContext<ContextValue | null>(null);

export function MarketplaceAccountProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [header, setHeader] = useState<HeaderState>({ authenticated: false, storeOwner: false, hasStore: false });
  const [ready, setReady] = useState(false);
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
        const state: HeaderState = await response.json();
        if (!active || version !== generation.current) return;
        setHeader(state); setReady(true);
        if (state.authenticated) loadStates();
      } catch { /* Header links are navigation, never an authorization boundary. */ }
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

  return <Context.Provider value={{ ...header, ready, favorites, register, setFavorite }}>{children}</Context.Provider>;
}

export function useMarketplaceAccount() {
  const value = useContext(Context);
  if (!value) throw new Error("Marketplace account context required.");
  return value;
}
