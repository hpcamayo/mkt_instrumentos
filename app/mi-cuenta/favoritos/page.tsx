import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CompareFromFavorites } from "@/components/catalog-compare";
import { CreateSearchAlert } from "@/components/create-search-alert";
import { FavoriteButton } from "@/components/favorite-button";
import { FollowedArrivals } from "@/components/following/followed-arrivals";
import { RecentlyViewed } from "@/components/saving/device-favorites";
import { FavoriteNote } from "@/components/saving/favorite-note";
import { SavedCard } from "@/components/saving/saved-card";
import { ShareFavorites } from "@/components/saving/share-favorites";
import { WhatsAppContactLink } from "@/components/whatsapp-contact-link";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { parsePreviousVisit, PREVIOUS_VISIT_COOKIE } from "@/lib/device-saves";
import { favoritePriceDrop, parseAccountFavorites, similarListingsPath } from "@/lib/favorites";
import { parseFollowedArrivals } from "@/lib/follows";
import { categoryOptions } from "@/lib/listings";
import { parsePage, pageHref } from "@/lib/pagination";
import { absoluteUrl } from "@/lib/site";

export const metadata = { title: "Favoritos" };
export default async function FavoritesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const { supabase } = await getAccountContext();
  const [{ data, error }, { data: share }, { data: arrivalRows }] = supabase
    ? await Promise.all([
        supabase.rpc("get_account_favorites", { p_page: page }),
        supabase.from("favorite_shares").select("token").is("revoked_at", null).maybeSingle(),
        supabase.rpc("get_followed_arrivals", { p_limit: 8, p_days: 30 }),
      ])
    : [{ data: null, error: true }, { data: null }, { data: null }];
  const favorites = !error ? parseAccountFavorites(data) : null;
  if (favorites && page > Math.max(1, Math.ceil(favorites.total / 24))) redirect(pageHref("/mi-cuenta/favoritos", {}, Math.max(1, Math.ceil(favorites.total / 24))));

  // save-04: what is new in the categories of these favorites since the previous visit.
  const since = parsePreviousVisit((await cookies()).get(PREVIOUS_VISIT_COOKIE)?.value);
  const categories = [...new Set((favorites?.items ?? []).map((item) => item.category).filter((value): value is string => Boolean(value)))];
  const { data: counts } = supabase && since && categories.length
    ? await supabase.rpc("get_new_listing_counts", { p_since: since.toISOString(), p_categories: categories })
    : { data: null };
  const fresh = Object.entries((counts ?? {}) as Record<string, number>).filter(([, total]) => total > 0);

  return <section className="grid min-w-0 gap-5"><PageHeader title="Favoritos" meta="Tus publicaciones guardadas, en todos tus dispositivos. Te avisamos cuando bajan de precio." />
    {fresh.length ? (
      <div className="flex flex-wrap items-center gap-2" aria-label="Nuevo desde tu última visita">
        <span className="t-ui font-semibold text-ink">Nuevo desde tu última visita:</span>
        {fresh.map(([category, total]) => (
          <Link key={category} href={`/listados?category=${category}&sort=newest`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
            {total} en {categoryOptions.find((option) => option.value === category)?.label ?? category}
          </Link>
        ))}
      </div>
    ) : null}
    {!favorites ? <Notice tone="danger" role="alert">No se pudieron cargar tus favoritos. Intenta nuevamente.</Notice> : !favorites.items.length ? <EmptyState title="No tienes favoritos todavía" description="Toca el corazón de cualquier instrumento para guardarlo aquí." actions={<Link href="/listados" className={buttonClasses({ variant: "secondary" })}>Explorar el catálogo</Link>} /> : <>
      {/* Effortless Laria find batch (FIND 12): compare two or three of the available favorites. */}
      <CompareFromFavorites listings={favorites.items.flatMap((item) => (item.availability === "approved" && item.slug && item.title ? [{ slug: item.slug, title: item.title }] : []))} />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{favorites.items.map((item) => item.availability === "unavailable" ? (
        <SavedCard key={item.listing_id} href={null} title="Publicación no disponible" imageUrl={null} price={null} meta={<p className="t-meta">Conservamos tu favorito, pero esta publicación ya no es pública.</p>}>
          <FavoriteButton listingId={item.listing_id} initialSaved removableOnly />
        </SavedCard>
      ) : (
        <SavedCard key={item.listing_id} href={`/mi-cuenta/favoritos/${item.listing_id}`} title={item.title ?? ""} imageUrl={item.image_url} price={item.price_pen} previousPrice={favoritePriceDrop(item)} sold={item.availability === "sold"}>
          {item.availability === "approved" ? (
            <WhatsAppContactLink href={`/instrumentos/${item.slug}`} listingId={item.listing_id} source="account" className={buttonClasses({ size: "sm" })}>
              <WhatsAppGlyph />
              Contactar por WhatsApp
            </WhatsAppContactLink>
          ) : (
            <>
              <Link href={similarListingsPath(item)} className={buttonClasses({ size: "sm" })}>Ver similares disponibles</Link>
              <CreateSearchAlert variant="button" label="Crear alerta parecida" trackSearch={false} filters={{ ...(item.category ? { category: item.category } : {}), ...(item.instrument_type ? { instrument_type: item.instrument_type } : {}), ...(item.brand ? { brand: item.brand } : {}) }} />
            </>
          )}
          <FavoriteButton listingId={item.listing_id} initialSaved removableOnly={item.availability !== "approved"} />
          <FavoriteNote listingId={item.listing_id} initialNote={item.note ?? null} />
        </SavedCard>
      ))}</ul>
      <nav aria-label="Paginación de favoritos" className="flex flex-wrap gap-4 text-sm">{page > 1 ? <Link href={pageHref("/mi-cuenta/favoritos", {}, page - 1)} className="link font-semibold">Anterior</Link> : null}<span className="text-ink-2">Página {page}</span>{page * 24 < favorites.total ? <Link href={pageHref("/mi-cuenta/favoritos", {}, page + 1)} className="link font-semibold">Siguiente</Link> : null}</nav>
      <ShareFavorites initialUrl={share?.token ? absoluteUrl(`/favoritos/compartida/${share.token}`) : null} />
    </>}
    <FollowedArrivals arrivals={parseFollowedArrivals(arrivalRows)} title="Nuevo de lo que sigues" />
    <RecentlyViewed exclude={(favorites?.items ?? []).map((item) => item.listing_id)} />
  </section>;
}
