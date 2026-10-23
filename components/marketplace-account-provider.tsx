"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { clearDeviceFavorites, DEVICE_SAVES_EVENT, getDeviceFavorites, recordViewed, setDeviceFavorite, touchVisit } from "@/lib/device-saves";

export type HeaderState = {
  authenticated: boolean;
  storeOwner: boolean;
  hasStore: boolean;
  // The store sees "Pagos" (PAY-1 pilot on).
  payments: boolean;
  admin: boolean;
  name: string | null;
  unreadNotifications: number;
  pendingBuyerConfirmations: number;
};
type FavoriteState = Record<string, boolean | undefined>;
// A short confirmation at the bottom of the screen ("Guardado en favoritos"), with an optional link.
export type Flash = { message: string; href?: string; linkLabel?: string };
// `settled` turns true after the first account check (success or failure) and stays true, so the header's
// account entry appears once instead of flashing "Ingresar" for a signed-in visitor.
// Signed out, hearts save on this device (big-04). At sign-in they move into the
// account, so they work on every device. `deviceFavoriteIds` lists them while signed out.
type ContextValue = HeaderState & { ready: boolean; settled: boolean; favorites: FavoriteState; deviceFavoriteIds: string[]; register: (id: string) => () => void; setFavorite: (id: string, saved: boolean) => Promise<void>; flash: (value: Flash) => void };
const SIGNED_OUT: HeaderState = { authenticated: false, storeOwner: false, hasStore: false, payments: false, admin: false, name: null, unreadNotifications: 0, pendingBuyerConfirmations: 0 };
const Context = createContext<ContextValue | null>(null);

export function MarketplaceAccountProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [header, setHeader] = useState<HeaderState>(SIGNED_OUT);
  const [ready, setReady] = useState(false);
  const [settled, setSettled] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteState>({});
  const [deviceFavoriteIds, setDeviceFavoriteIds] = useState<string[]>([]);
  const [flashValue, setFlashValue] = useState<Flash | null>(null);
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

  // Favorites saved on this device join the account at sign-in, then the device copy is cleared (big-04).
  const mergeDeviceFavorites = useCallback(async () => {
    const saved = getDeviceFavorites().map((item) => item.id);
    if (!saved.length) return;
    try {
      const response = await fetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "merge", ids: saved }) });
      if (!response.ok) return;
      const result = await response.json();
      clearDeviceFavorites();
      const added = typeof result.added === "number" ? result.added : 0;
      if (added > 0) setFlashValue({ message: added === 1 ? "Guardamos 1 favorito de este dispositivo en tu cuenta." : `Guardamos ${added} favoritos de este dispositivo en tu cuenta.`, href: "/mi-cuenta/favoritos", linkLabel: "Ver favoritos" });
    } catch { /* The device copy stays and is merged on the next visit. */ }
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
        if (state.authenticated) {
          await mergeDeviceFavorites();
          loadStates();
        }
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
  }, [pathname, loadStates, invalidate, mergeDeviceFavorites]);

  // Device favorites, kept in step across tabs.
  useEffect(() => {
    const sync = () => setDeviceFavoriteIds(getDeviceFavorites().map((item) => item.id));
    sync();
    window.addEventListener(DEVICE_SAVES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(DEVICE_SAVES_EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);

  // The visit marker (save-04): every page change counts as being here, so a visit ends after 30 minutes away. And
  // "Vistos recientemente" (big-04, FIND 11): the listing pages this device opened.
  useEffect(() => {
    touchVisit();
    const match = /^\/instrumentos\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(pathname ?? "");
    if (match) recordViewed(match[1]);
  }, [pathname]);

  useEffect(() => {
    if (!flashValue) return;
    const timer = setTimeout(() => setFlashValue(null), 6000);
    return () => clearTimeout(timer);
  }, [flashValue]);

  const register = useCallback((id: string) => {
    ids.current.set(id, (ids.current.get(id) ?? 0) + 1);
    if (ready && header.authenticated) loadStates();
    return () => { const count = (ids.current.get(id) ?? 1) - 1; if (count) ids.current.set(id, count); else ids.current.delete(id); };
  }, [ready, header.authenticated, loadStates]);

  // Hearts change at once (fast-01); a failed save puts the heart back and the button shows why.
  const setFavorite = useCallback(async (id: string, saved: boolean) => {
    if (!header.authenticated) {
      setDeviceFavorite(id, saved);
      return;
    }
    if (busy.current.has(id)) return;
    busy.current.add(id);
    const version = ++generation.current;
    setFavorites((current) => ({ ...current, [id]: saved }));
    try {
      const response = await fetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set", id, saved }) });
      const result = await response.json();
      if (!response.ok) {
        setFavorites((current) => ({ ...current, [id]: !saved }));
        throw new Error(result.message ?? "No se pudo guardar el favorito.");
      }
      if (version === generation.current) setFavorites((current) => ({ ...current, [id]: result.saved }));
    } finally { busy.current.delete(id); loadStates(); }
  }, [header.authenticated, loadStates]);

  return (
    <Context.Provider value={{ ...header, ready, settled, favorites, deviceFavoriteIds, register, setFavorite, flash: setFlashValue }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        {flashValue ? (
          <p role="status" className="pointer-events-auto flex max-w-md flex-wrap items-center gap-x-3 gap-y-1 rounded-panel bg-ink px-4 py-3 t-ui text-surface shadow-level-1">
            <span>{flashValue.message}</span>
            {flashValue.href ? <Link href={flashValue.href} onClick={() => setFlashValue(null)} className="inline-flex min-h-6 items-center font-semibold text-surface underline decoration-accent decoration-2 underline-offset-[3px]">{flashValue.linkLabel ?? "Ver"}</Link> : null}
            <button type="button" onClick={() => setFlashValue(null)} className="inline-flex min-h-6 items-center font-semibold text-surface underline decoration-white/50 underline-offset-[3px]">Cerrar</button>
          </p>
        ) : null}
      </div>
    </Context.Provider>
  );
}

// The state every consumer renders on the server: the provider's initial state.
const SERVER_STATE = { ...SIGNED_OUT, ready: false, settled: false, favorites: {} as FavoriteState, deviceFavoriteIds: [] as string[] };
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
