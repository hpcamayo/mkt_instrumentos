// What Laria remembers on this device without an account (big-04, save-01, save-04, save-06). Everything lives in
// localStorage or a first-party cookie, is wrapped so a blocked or full storage never breaks a page, and can be
// cleared from /favoritos ("Borrar lo guardado en este dispositivo").

const FAVORITES_KEY = "laria:favoritos";
const VIEWED_KEY = "laria:vistos";
const INTENT_KEY = "laria:pendiente";
const SEARCHES_KEY = "laria:busquedas";
const DISMISSED_KEY = "laria:alertas-descartadas";
export const DEVICE_SAVES_EVENT = "laria:device-saves";

export const MAX_DEVICE_FAVORITES = 100;
export const MAX_VIEWED = 30;
const INTENT_TTL_MS = 60 * 60 * 1000;

type DeviceFavorite = { id: string; at: number };
type Viewed = { slug: string; at: number };
export type PendingIntent =
  | { kind: "alert"; path: string; filters: unknown; frequency: "immediate" | "daily"; at: number }
  | { kind: "report"; path: string; targetType: string; targetId: string; at: number };

function read<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage full or blocked: the page keeps working without it. */
  }
  try {
    window.dispatchEvent(new Event(DEVICE_SAVES_EVENT));
  } catch {
    /* Not in a browser. */
  }
}

const isId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
const isSlug = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 200;

export function getDeviceFavorites(): DeviceFavorite[] {
  const items = read<DeviceFavorite[]>(FAVORITES_KEY, []);
  return Array.isArray(items) ? items.filter((item) => item && isId(item.id) && typeof item.at === "number") : [];
}

export function isDeviceFavorite(id: string) {
  return getDeviceFavorites().some((item) => item.id === id);
}

export function setDeviceFavorite(id: string, saved: boolean) {
  if (!isId(id)) return getDeviceFavorites();
  const rest = getDeviceFavorites().filter((item) => item.id !== id);
  const next = saved ? [{ id, at: Date.now() }, ...rest].slice(0, MAX_DEVICE_FAVORITES) : rest;
  write(FAVORITES_KEY, next);
  return next;
}

export function clearDeviceFavorites() {
  write(FAVORITES_KEY, null);
}

export function getViewed(): Viewed[] {
  const items = read<Viewed[]>(VIEWED_KEY, []);
  return Array.isArray(items) ? items.filter((item) => item && isSlug(item.slug) && typeof item.at === "number") : [];
}

export function recordViewed(slug: string) {
  if (!isSlug(slug)) return;
  const rest = getViewed().filter((item) => item.slug !== slug);
  write(VIEWED_KEY, [{ slug, at: Date.now() }, ...rest].slice(0, MAX_VIEWED));
}

export function clearViewed() {
  write(VIEWED_KEY, null);
}

export function clearDeviceSaves() {
  for (const key of [FAVORITES_KEY, VIEWED_KEY, INTENT_KEY, SEARCHES_KEY, DISMISSED_KEY]) write(key, null);
  try {
    document.cookie = `${LAST_VISIT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
    document.cookie = `${PREVIOUS_VISIT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    /* Not in a browser. */
  }
}

// save-01: what the person was doing when Laria asked them to sign in. Kept for an hour, so it survives the
// confirmation e-mail opening in another tab, and used once.
export function savePendingIntent(intent: PendingIntent extends infer T ? (T extends PendingIntent ? Omit<T, "at"> : never) : never) {
  write(INTENT_KEY, { ...intent, at: Date.now() });
}

export function takePendingIntent<K extends PendingIntent["kind"]>(kind: K, path: string, match?: (intent: Extract<PendingIntent, { kind: K }>) => boolean): Extract<PendingIntent, { kind: K }> | null {
  const intent = read<PendingIntent | null>(INTENT_KEY, null);
  if (!intent || intent.kind !== kind || intent.path !== path || Date.now() - intent.at > INTENT_TTL_MS) return null;
  if (match && !match(intent as Extract<PendingIntent, { kind: K }>)) return null;
  write(INTENT_KEY, null);
  return intent as Extract<PendingIntent, { kind: K }>;
}

// save-04: the previous visit, as a cookie the server can read. A visit starts after 30 minutes away; every page change
// counts as being here (components/marketplace-account-provider.tsx).
export const LAST_VISIT_COOKIE = "laria_ultima_visita";
export const PREVIOUS_VISIT_COOKIE = "laria_visita_anterior";
const VISIT_GAP_MS = 30 * 60 * 1000;

function readCookies(): Record<string, string> {
  return Object.fromEntries(document.cookie.split("; ").filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

export function touchVisit(now = Date.now()) {
  try {
    const cookies = readCookies();
    const last = Number(cookies[LAST_VISIT_COOKIE]);
    const maxAge = 60 * 60 * 24 * 90;
    if (Number.isFinite(last) && last > 0 && now - last > VISIT_GAP_MS) {
      document.cookie = `${PREVIOUS_VISIT_COOKIE}=${last}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
    }
    document.cookie = `${LAST_VISIT_COOKIE}=${now}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
  } catch {
    /* Cookies blocked: nothing is marked as new. */
  }
}

export function parsePreviousVisit(value: string | undefined) {
  const time = Number(value);
  return Number.isFinite(time) && time > 0 ? new Date(time) : null;
}

// The previous visit as of `now`: the last page view when it was more than 30 minutes ago (this page starts a new visit
// and touchVisit has not run yet), otherwise the one already kept. It gives the same answer before and after
// touchVisit, so Favoritos and Alertas on the server and the home's "Nuevo desde tu última visita" agree
// (UXD-integration-9).
export function previousVisitFrom(last: string | undefined, previous: string | undefined, now = Date.now()) {
  const lastTime = Number(last);
  if (Number.isFinite(lastTime) && lastTime > 0 && now - lastTime > VISIT_GAP_MS) return new Date(lastTime);
  return parsePreviousVisit(previous);
}

export function previousVisit(now = Date.now()) {
  try {
    const cookies = readCookies();
    return previousVisitFrom(cookies[LAST_VISIT_COOKIE], cookies[PREVIOUS_VISIT_COOKIE], now);
  } catch {
    return null;
  }
}

// save-06: the same search seen on separate occasions (more than 10 minutes apart, or after another search).
const SEARCH_GAP_MS = 10 * 60 * 1000;
type SearchRecord = { last: string | null; seen: Record<string, { count: number; at: number }> };

export function recordSearch(signature: string, now = Date.now()) {
  const history = read<SearchRecord>(SEARCHES_KEY, { last: null, seen: {} });
  const seen = history && typeof history.seen === "object" ? history.seen : {};
  const previous = seen[signature];
  const repeated = previous && (history.last !== signature || now - previous.at > SEARCH_GAP_MS);
  const entry = previous ? { count: repeated ? previous.count + 1 : previous.count, at: now } : { count: 1, at: now };
  const trimmed = Object.fromEntries(Object.entries({ ...seen, [signature]: entry }).sort((a, b) => b[1].at - a[1].at).slice(0, 40));
  write(SEARCHES_KEY, { last: signature, seen: trimmed });
  return entry.count;
}

export function dismissAlertPrompt(signature: string) {
  const dismissed = read<string[]>(DISMISSED_KEY, []);
  write(DISMISSED_KEY, [signature, ...(Array.isArray(dismissed) ? dismissed.filter((item) => item !== signature) : [])].slice(0, 100));
}

export function alertPromptDismissed(signature: string) {
  const dismissed = read<string[]>(DISMISSED_KEY, []);
  return Array.isArray(dismissed) && dismissed.includes(signature);
}
