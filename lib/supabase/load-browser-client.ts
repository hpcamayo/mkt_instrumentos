// The Supabase browser client, loaded the first time a component needs it. The listing page's components use this, so
// supabase-js and its Auth stay out of the page's first load (launch audit A29): a visitor from WhatsApp or Google
// downloads them only when a part of the page that talks to Supabase runs.
export async function loadSupabaseBrowserClient() {
  const { getSupabaseBrowserClient } = await import("@/lib/supabase/browser-client");
  return getSupabaseBrowserClient();
}
