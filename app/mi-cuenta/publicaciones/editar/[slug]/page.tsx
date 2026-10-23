import { notFound, redirect } from "next/navigation";
import { getAccountContext } from "@/lib/account-context";

// E-mails carry the listing's slug, not its id: this resolves the owner's own listing and opens its edit page,
// so "Corregir publicación" lands on the form instead of the list (mine-01).
export default async function EditBySlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, supabase } = await getAccountContext();
  if (!supabase) redirect("/mi-cuenta/publicaciones");
  const { data: listing } = await supabase.from("listings").select("id").eq("slug", slug).eq("owner_user_id", user.id).maybeSingle();
  if (!listing) notFound();
  redirect(`/mi-cuenta/publicaciones/${listing.id}/editar`);
}
