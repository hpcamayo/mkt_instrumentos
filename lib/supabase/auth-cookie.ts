// A signed-in visitor carries a Supabase auth cookie (sb-<project>-auth-token, possibly split in chunks). @supabase/ssr
// doesn't make it HttpOnly, since its browser client reads it, so the browser can tell too without loading that client.
export function hasSupabaseAuthCookie(names: readonly string[]) {
  return names.some((name) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name));
}

// The names in a Cookie header or in document.cookie ("a=1; b=2").
export function cookieNames(cookies: string) {
  return cookies.split(";").map((cookie) => cookie.split("=")[0].trim());
}
