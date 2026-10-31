import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ListingManagementTable,
  type ManagedListing,
} from "@/components/listing-management-table";
import { DraftList } from "@/components/selling/draft-list";
import { BundleOfferSettings } from "@/components/listing-details/bundle-offer-settings";
import { getAccountContext } from "@/lib/account-context";
import { listSellDrafts } from "@/lib/sell-page-data";
import { getAccountAnalytics } from "@/lib/account-analytics";
import { isReservationRunning, readMyListingReservations } from "@/lib/listing-reservations";
import { Button, buttonClasses } from "@/components/ui/button";
import { ChipLink } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import {
  MY_LISTINGS_SORTS,
  MY_LISTINGS_VIEWS,
  firstPhotoUrl,
  loadRevisionStates,
  myListingsHref,
  parseMyListingsQuery,
  selectMyListingsPage,
  type MyListingsQuery,
  type MyListingsView,
} from "@/lib/my-listings";

export const metadata = { title: "Mis publicaciones" };

const BASE = "/mi-cuenta/publicaciones";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// mine-04: the owner's list scales with status tabs and their counts, a title search, an order and pages of 50, all
// in the URL (GET links and a GET form), so it works without JavaScript.
export default async function ParticularListingsPage({ searchParams }: { searchParams?: SearchParams }) {
  const { user, profile, supabase } = await getAccountContext();
  if (profile?.account_type === "store_owner") redirect("/mi-cuenta/tienda/inventario");
  const query = parseMyListingsQuery((await searchParams) ?? {});
  const [{ data: listings }, analytics, reservations] = await Promise.all([
    supabase
      ? supabase
        .from("listings")
        .select("id,title,status,slug,price_pen,created_at,published_at,sold_at,rejection_reason,hidden_source,hidden_reason,paused_until,listing_photos(image_url,sort_order)")
        .eq("owner_user_id", user.id)
        .is("store_id", null)
        .order("created_at", { ascending: false })
        .order("sort_order", { foreignTable: "listing_photos", ascending: true })
        .limit(1, { foreignTable: "listing_photos" })
      : { data: [] },
    getAccountAnalytics(0),
    // talk-06: the reserved listings and the ended periods waiting for "¿Se vendió?".
    supabase ? readMyListingReservations(supabase) : null,
  ]);
  const reservationByListing = new Map((reservations ?? []).map((reservation) => [reservation.listing_id, reservation]));
  const drafts = supabase ? await listSellDrafts(supabase, "listing") : [];
  const analyticsByListing = new Map(analytics?.listings.map((listing) => [listing.id, listing]) ?? []);
  const listingIds = listings?.map((listing) => listing.id) ?? [];
  const revisionByListing = supabase && listingIds.length ? await loadRevisionStates(supabase, listingIds) : new Map();
  const managedListings: ManagedListing[] = (listings ?? []).map(({ listing_photos: photos, ...listing }) => {
    const reservation = reservationByListing.get(listing.id);
    return {
      ...listing,
      photoUrl: firstPhotoUrl(photos),
      analytics: analyticsByListing.get(listing.id),
      revisionStatus: revisionByListing.get(listing.id)?.status ?? null,
      revisionReason: revisionByListing.get(listing.id)?.reason ?? null,
      reservation: reservation ? { until: reservation.reserved_until, ended: !isReservationRunning(reservation), watchers: reservation.watchers } : null,
    };
  });
  const page = selectMyListingsPage(managedListings, query);
  const hasAny = managedListings.length > 0;
  return (
    <section className="rounded-panel border border-subtle bg-white">
      <PageHeader
        className="border-b border-subtle p-5"
        eyebrow="Cuenta Particular"
        title="Mis publicaciones"
        meta={hasAny ? (managedListings.length === 1 ? "1 publicación" : `${managedListings.length} publicaciones`) : undefined}
        actions={<Link href="/mi-cuenta/publicar" className={buttonClasses()}>Publicar instrumento</Link>}
      />
      {drafts.length ? <div className="border-b border-subtle p-5"><DraftList drafts={drafts} href="/mi-cuenta/publicar" /></div> : null}
      {hasAny ? <ListControls query={query} counts={page.counts} /> : null}
      {hasAny && !page.items.length ? (
        <EmptyState
          className="rounded-none border-0"
          title="Ninguna publicación coincide"
          description={query.q ? "Prueba con otra palabra del título o mira todas tus publicaciones." : "No tienes publicaciones en este estado."}
          actions={<Link href={BASE} className={buttonClasses({ variant: "secondary" })}>Ver todas</Link>}
        />
      ) : (
        <ListingManagementTable key={myListingsHref(BASE, query)} listings={page.items} emptyMessage="Aún no tienes publicaciones" canReserve />
      )}
      {page.pageCount > 1 ? <PageLinks query={query} page={page.page} pageCount={page.pageCount} from={page.from} to={page.to} total={page.total} /> : null}
      {/* listing-details batch (buy-01): the Particular's combo discount */}
      {supabase && hasAny ? <div className="border-t border-subtle p-5"><BundleOfferSettings supabase={supabase} userId={user.id} /></div> : null}
      <p className="border-t border-subtle p-5 text-meta leading-6 text-ink-2">{analytics ? "Vistas acumuladas de todo el historial, incluidas las históricas. Contactos por WhatsApp registrados desde el inicio del seguimiento; no equivalen a mensajes ni ventas." : "Las métricas no están disponibles en este momento; no se muestran ceros estimados."} La fecha de publicación corresponde a la primera publicación.</p>
    </section>
  );
}

function ListControls({ query, counts }: { query: MyListingsQuery; counts: Record<MyListingsView, number> }) {
  // Tabs without listings are left out, except "Todas" and the one in the URL.
  const views = MY_LISTINGS_VIEWS.filter((view) => view.key === "todas" || view.key === query.vista || counts[view.key] > 0);
  return (
    <div className="grid gap-4 border-b border-subtle p-4 md:p-5">
      <nav aria-label="Publicaciones por estado">
        <ul className="flex flex-wrap gap-2">
          {views.map((view) => (
            <li key={view.key}>
              <ChipLink href={myListingsHref(BASE, { ...query, vista: view.key, pagina: 1 })} selected={view.key === query.vista} current="page">
                {view.label} · {counts[view.key]}
              </ChipLink>
            </li>
          ))}
        </ul>
      </nav>
      <form action={BASE} method="get" role="search" aria-label="Buscar en mis publicaciones" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] sm:items-end">
        {query.vista !== "todas" ? <input type="hidden" name="vista" value={query.vista} /> : null}
        <Field id="publicaciones-buscar" label="Buscar por título">
          <Input type="search" name="q" defaultValue={query.q} maxLength={80} autoComplete="off" />
        </Field>
        <Field id="publicaciones-orden" label="Ordenar por">
          <Select name="orden" defaultValue={query.orden}>
            {MY_LISTINGS_SORTS.map((sort) => <option key={sort.key} value={sort.key}>{sort.label}</option>)}
          </Select>
        </Field>
        <Button type="submit" variant="secondary">Buscar</Button>
      </form>
      {query.q ? (
        <p className="t-meta">
          Resultados para “{query.q}”.{" "}
          <Link href={myListingsHref(BASE, { ...query, q: "", pagina: 1 })} className="link font-semibold">Quitar búsqueda</Link>
        </p>
      ) : null}
    </div>
  );
}

function PageLinks({ query, page, pageCount, from, to, total }: { query: MyListingsQuery; page: number; pageCount: number; from: number; to: number; total: number }) {
  return (
    <nav aria-label="Páginas de mis publicaciones" className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle p-4 md:px-5">
      <p className="t-meta">Mostrando {from}–{to} de {total}</p>
      <div className="flex gap-2">
        {page > 1 ? <Link href={myListingsHref(BASE, { ...query, pagina: page - 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>Anterior</Link> : null}
        <span className="inline-flex h-9 items-center t-ui">Página {page} de {pageCount}</span>
        {page < pageCount ? <Link href={myListingsHref(BASE, { ...query, pagina: page + 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>Siguiente</Link> : null}
      </div>
    </nav>
  );
}
