import Link from "next/link";
import { redirect } from "next/navigation";
import { FavoriteButton } from "@/components/favorite-button";
import { MarketplaceImage } from "@/components/marketplace-image";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { StatusTag } from "@/components/ui/tag";
import { getAccountContext } from "@/lib/account-context";
import { parseAccountFavorites } from "@/lib/favorites";
import { parsePage, pageHref } from "@/lib/pagination";

export const metadata = { title: "Favoritos" };
export default async function FavoritesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const { supabase } = await getAccountContext();
  const { data, error } = supabase ? await supabase.rpc("get_account_favorites", { p_page: page }) : { data: null, error: true };
  const favorites = !error ? parseAccountFavorites(data) : null;
  if (favorites && page > Math.max(1, Math.ceil(favorites.total / 24))) redirect(pageHref("/mi-cuenta/favoritos", {}, Math.max(1, Math.ceil(favorites.total / 24))));
  return <section className="grid min-w-0 gap-5"><PageHeader title="Favoritos" meta="Tus publicaciones guardadas. Las bajadas de precio públicas aparecerán en Notificaciones." />
    {!favorites ? <Notice tone="danger" role="alert">No se pudieron cargar tus favoritos. Intenta nuevamente.</Notice> : !favorites.items.length ? <EmptyState title="No tienes favoritos todavía" actions={<Link href="/listados" className={buttonClasses({ variant: "secondary" })}>Explorar el catálogo</Link>} /> : <>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{favorites.items.map((item) => <li key={item.listing_id} className="min-w-0 rounded-panel border border-subtle bg-white p-4">
        {item.image_url ? <MarketplaceImage src={item.image_url} alt={item.title ?? "Publicación guardada"} width={480} height={360} sizes="(max-width: 640px) 100vw, 320px" loading="lazy" className="mb-3 aspect-[4/3] w-full rounded-control object-cover" /> : null}
        <h2 className="font-semibold">{item.availability === "unavailable" ? "Publicación no disponible" : <Link href={`/mi-cuenta/favoritos/${item.listing_id}`} className="hover:text-ink hover:underline hover:decoration-accent hover:decoration-2">{item.title}</Link>}</h2>
        <div className="my-3 text-sm">{item.availability === "sold" ? <StatusTag domain="listing" status="sold" /> : item.availability === "unavailable" ? <p>Conservamos tu favorito, pero esta publicación ya no es pública.</p> : <Price value={item.price_pen!} />}</div>
        <FavoriteButton listingId={item.listing_id} initialSaved removableOnly={item.availability !== "approved"} />
      </li>)}</ul>
      <nav aria-label="Paginación de favoritos" className="flex flex-wrap gap-4 text-sm">{page > 1 ? <Link href={pageHref("/mi-cuenta/favoritos", {}, page - 1)} className="link font-semibold">Anterior</Link> : null}<span className="text-ink-2">Página {page}</span>{page * 24 < favorites.total ? <Link href={pageHref("/mi-cuenta/favoritos", {}, page + 1)} className="link font-semibold">Siguiente</Link> : null}</nav>
    </>}
  </section>;
}
