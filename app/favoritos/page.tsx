import { redirect } from "next/navigation";
import { DeviceFavorites } from "@/components/saving/device-favorites";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { NOINDEX_ROBOTS } from "@/lib/site";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const metadata = { title: "Favoritos", robots: NOINDEX_ROBOTS };

// big-04: favorites without an account. Signed in, the account's Favoritos is the one list.
export default async function DeviceFavoritesPage() {
  const supabase = await getSupabaseServerClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: null };
  if (data?.user) redirect("/mi-cuenta/favoritos");
  return (
    <PageContainer as="section" className="grid gap-6 py-8 sm:py-10">
      <PageHeader title="Favoritos" meta="Guardados en este dispositivo, sin cuenta." />
      <DeviceFavorites />
    </PageContainer>
  );
}
