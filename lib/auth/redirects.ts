const DEFAULT_AUTH_REDIRECT = "/mi-cuenta";
// Only used to resolve a value: a path that keeps this origin after resolving stays on Laria.
const RESOLVE_ORIGIN = "https://laria.invalid";

// Launch audit A08: browsers drop tabs and newlines while parsing an address, so "/<tab>/evil.example" turns into
// "//evil.example". Any control character or backslash is refused; the value is then resolved the way a browser
// would, and only a path that stays on this origin comes back (path, query and hash, never "//").
export function getSafeAuthRedirect(
  next: string | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT,
) {
  if (!next || !next.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(next)) {
    return fallback;
  }

  let resolved: URL;
  try {
    resolved = new URL(next, RESOLVE_ORIGIN);
  } catch {
    return fallback;
  }
  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  if (resolved.origin !== RESOLVE_ORIGIN || path.startsWith("//")) {
    return fallback;
  }

  return path;
}

export function getLoginPath(next?: string) {
  const safeNext = getSafeAuthRedirect(next, DEFAULT_AUTH_REDIRECT);
  return `/login?next=${encodeURIComponent(safeNext)}`;
}
