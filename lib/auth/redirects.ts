const DEFAULT_AUTH_REDIRECT = "/mi-cuenta";

export function getSafeAuthRedirect(
  next: string | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT,
) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return fallback;
  }

  return next;
}

export function getLoginPath(next?: string) {
  const safeNext = getSafeAuthRedirect(next, DEFAULT_AUTH_REDIRECT);
  return `/login?next=${encodeURIComponent(safeNext)}`;
}
