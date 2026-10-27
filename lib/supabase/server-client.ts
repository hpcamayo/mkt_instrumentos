import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { REMEMBER_COOKIE, remembersSession, withRememberChoice } from "@/lib/auth/remember";
import type { Database } from "@/lib/supabase/database";

export async function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const cookieStore = await cookies();
  // safe-08 (accounts batch): session-only cookies when "Mantener sesión iniciada" was unticked.
  const remember = remembersSession(cookieStore.getAll().find((cookie) => cookie.name === REMEMBER_COOKIE)?.value);

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, withRememberChoice(options, remember));
          });
        } catch {
          // Server Components cannot always set cookies. Middleware refreshes
          // sessions for normal page requests.
        }
      },
    },
  });
}
