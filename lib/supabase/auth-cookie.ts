// A signed-in visitor carries this project's Supabase auth cookie, possibly split in chunks. @supabase/ssr names it with
// supabase-js's default storage key, sb-<the project URL's first label>-auth-token, and doesn't make it HttpOnly,
// since its browser client reads it, so the browser can tell too without loading that client. Another project's
// cookie on the same site (from an earlier Supabase URL, say) doesn't count.
export function hasSupabaseAuthCookie(names: readonly string[], supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  let name: string;
  try {
    name = `sb-${new URL(supabaseUrl ?? "").hostname.split(".")[0]}-auth-token`;
  } catch {
    return false;
  }
  return names.some((cookie) => cookie === name || (cookie.startsWith(`${name}.`) && /^\d+$/.test(cookie.slice(name.length + 1))));
}

// The names in a Cookie header or in document.cookie ("a=1; b=2").
export function cookieNames(cookies: string) {
  return cookies.split(";").map((cookie) => cookie.split("=")[0].trim());
}
