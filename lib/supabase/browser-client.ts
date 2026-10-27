import { createBrowserClient } from "@supabase/ssr";
import { parseCookieHeader, REMEMBER_COOKIE, remembersSession, serializeCookie, withRememberChoice } from "@/lib/auth/remember";
import type { Database } from "@/lib/supabase/database";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null =
  null;

export function getSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      supabaseUrl,
      supabaseAnonKey,
      {
        // safe-08 (accounts batch): the same cookies as the library's default, except that a session that should not
        // be remembered keeps its refreshed cookies for this browser session only. Client components can create it
        // while rendering on the server, where there are no browser cookies to read or write.
        cookies: {
          getAll: () => (typeof document === "undefined" ? [] : parseCookieHeader(document.cookie)),
          setAll(cookiesToSet) {
            if (typeof document === "undefined") return;
            const remember = remembersSession(parseCookieHeader(document.cookie).find((cookie) => cookie.name === REMEMBER_COOKIE)?.value);
            cookiesToSet.forEach(({ name, value, options }) => {
              document.cookie = serializeCookie(name, value, withRememberChoice(options, remember));
            });
          },
        },
      },
    );
  }

  return browserClient;
}
