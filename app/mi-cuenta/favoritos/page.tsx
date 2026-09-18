import Link from "next/link";
import { redirect } from "next/navigation";
import { FavoriteButton } from "@/components/favorite-button";
import { MarketplaceImage } from "@/components/marketplace-image";
import { getAccountContext } from "@/lib/account-context";
import { parseAccountFavorites } from "@/lib/favorites";
import { formatPrice } from "@/lib/listings";
import { parsePage, pageHref } from "@/lib/pagination";

export const metadata = { title: "Favoritos" };
export default async function FavoritesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const { supabase } = await getAccountContext();
  const { data, error } = supabase ? await supabase.rpc("get_account_favorites", { p_page: page }) : { data: null, error: true };
  const favorites = !error ? parseAccountFavorites(data) : null;
  if (favorites && page > Math.max(1, Math.ceil(favorites.total / 24))) redirect(pageHref("/mi-cuenta/favoritos", {}, Math.max(1, Math.ceil(favorites.total / 24))));
  return <section className="grid min-w-0 gap-5"><h1 className="text-3xl font-black text-laria-ink">Favoritos</h1><p className="text-sm text-laria-text-soft">Tus publicaciones guardadas. Las bajadas de precio públicas aparecerán en Notificaciones.</p>
    {!favorites ? <p role="alert">No se pudieron cargar tus favoritos. Intenta nuevamente.</p> : !favorites.items.length ? <p>No tienes favoritos todavía. <Link href="/listados" className="font-bold text-laria-blue">Explorar el catálogo</Link></p> : <>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{favorites.items.map((item) => <li key={item.listing_id} className="min-w-0 rounded-lg border border-laria-fog bg-white p-4">
        {item.image_url ? <MarketplaceImage src={item.image_url} alt={item.title ?? "Publicación guardada"} width={480} height={360} sizes="(max-width: 640px) 100vw, 320px" loading="lazy" className="mb-3 aspect-[4/3] w-full rounded-md object-cover" /> : null}
        <h2 className="font-black">{item.availability === "unavailable" ? "Publicación no disponible" : <Link href={`/mi-cuenta/favoritos/${item.listing_id}`} className="hover:text-laria-blue">{item.title}</Link>}</h2>
        <p className="my-3 text-sm">{item.availability === "sold" ? "Vendido" : item.availability === "unavailable" ? "Conservamos tu favorito, pero esta publicación ya no es pública." : formatPrice(item.price_pen!)}</p>
        <FavoriteButton listingId={item.listing_id} initialSaved removableOnly={item.availability !== "approved"} />
      </li>)}</ul>
      <nav aria-label="Paginación de favoritos" className="flex flex-wrap gap-4">{page > 1 ? <Link href={pageHref("/mi-cuenta/favoritos", {}, page - 1)}>Anterior</Link> : null}<span>Página {page}</span>{page * 24 < favorites.total ? <Link href={pageHref("/mi-cuenta/favoritos", {}, page + 1)}>Siguiente</Link> : null}</nav>
    </>}
  </section>;
}
