import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { isFavoriteListingId } from "@/lib/favorites";

export default async function FavoriteDestination({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getAccountContext();
  const { data: destination } = supabase && isFavoriteListingId(id) ? await supabase.rpc("get_favorite_destination", { p_listing_id: id }) : { data: null };
  if (destination?.startsWith("/instrumentos/")) redirect(destination);
  return <section className="grid gap-4"><PageHeader title="Publicación no disponible" /><p>Esta publicación ya no está disponible públicamente. No podemos mostrar sus datos privados.</p><Link href="/mi-cuenta/favoritos" className="link font-semibold">Ver mis favoritos</Link></section>;
}
