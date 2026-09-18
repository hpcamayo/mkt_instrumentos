import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountContext } from "@/lib/account-context";
import { isFavoriteListingId } from "@/lib/favorites";

export default async function FavoriteDestination({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getAccountContext();
  const { data: destination } = supabase && isFavoriteListingId(id) ? await supabase.rpc("get_favorite_destination", { p_listing_id: id }) : { data: null };
  if (destination?.startsWith("/instrumentos/")) redirect(destination);
  return <section className="grid gap-4"><h1 className="text-2xl font-black">Publicación no disponible</h1><p>Esta publicación ya no está disponible públicamente. No podemos mostrar sus datos privados.</p><Link href="/mi-cuenta/favoritos" className="font-black text-laria-blue">Ver mis favoritos</Link></section>;
}
