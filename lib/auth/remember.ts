import type { CookieOptions } from "@supabase/ssr";

// safe-08 (accounts batch): "Mantener sesión iniciada". Supabase's session cookies last 400 days by default, which is
// what "keep me signed in" means: closing the browser keeps the session and its second-factor level, so the code is
// asked again only on a new device or after signing out. Unticking the box stores this marker cookie for the browser
// session, and every place that writes the session cookies (middleware, server routes, the browser client) then
// writes them without Max-Age, so they end when the browser closes.

export const REMEMBER_COOKIE = "laria_recordar";

export function remembersSession(markerValue: string | undefined | null) {
  return markerValue !== "0";
}

// A removal (Max-Age 0) always stays a removal.
export function withRememberChoice(options: CookieOptions | undefined, remember: boolean): CookieOptions {
  const resolved = options ?? {};
  if (remember || resolved.maxAge === 0) return resolved;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { maxAge, expires, ...sessionOnly } = resolved;
  return sessionOnly;
}

// The marker itself: a browser-session cookie the browser client can read; removed when the box stays ticked.
export function rememberMarker(remember: boolean, secure: boolean) {
  return {
    name: REMEMBER_COOKIE,
    value: remember ? "" : "0",
    options: { path: "/", sameSite: "lax" as const, secure, httpOnly: false, ...(remember ? { maxAge: 0 } : {}) },
  };
}

export function parseCookieHeader(header: string) {
  return header.split(";").flatMap((part) => {
    const index = part.indexOf("=");
    if (index < 1) return [];
    const name = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // Keep the raw value when it is not URI-encoded.
    }
    return name ? [{ name, value }] : [];
  });
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? "/"}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.expires) parts.push(`Expires=${new Date(options.expires).toUTCString()}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  const sameSite = options.sameSite === true ? "strict" : options.sameSite;
  if (sameSite) parts.push(`SameSite=${String(sameSite).charAt(0).toUpperCase()}${String(sameSite).slice(1)}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}
