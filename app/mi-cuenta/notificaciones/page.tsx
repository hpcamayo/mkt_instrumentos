import Link from "next/link";
import { NotificationsList } from "@/components/notifications-list";
import { PushSettings } from "@/components/push-settings";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { parsePublicListingCards } from "@/lib/favorites";
import { parsePage } from "@/lib/pagination";

export const metadata = { title: "Notificaciones" };

const PAGE_SIZE = 50;
const LISTING_EVENTS = new Set(["listing_price_drop", "listing_alert_match"]);

// save-10: pages instead of a 100-item cap, "Marcar todo como leído", and the listing's name on price drops and
// alert matches (read from the public listing, so older notices get it too).
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = parsePage((await searchParams).page);
  const { supabase } = await getAccountContext();
  const from = (page - 1) * PAGE_SIZE;
  const { data, count } = supabase
    ? await supabase
        .from("notifications")
        .select("id,event_type,message,listing_id,store_id,claim_id,transaction_id,review_id,created_at,read_at,old_price_pen,new_price_pen", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
    : { data: [], count: 0 };
  const rows = data ?? [];
  const listingIds = [...new Set(rows.filter((row) => row.listing_id && LISTING_EVENTS.has(row.event_type)).map((row) => row.listing_id as string))];
  const cards = supabase && listingIds.length
    ? parsePublicListingCards((await supabase.rpc("get_public_listing_cards", { p_ids: listingIds, p_slugs: [] })).data)
    : [];
  const listings = Object.fromEntries(cards.map((card) => [card.id, { title: card.title, slug: card.slug }]));
  const total = count ?? rows.length;
  const hasUnread = rows.some((row) => !row.read_at);

  return (
    <section className="grid gap-5">
      <PageHeader
        eyebrow="Mi cuenta"
        title="Notificaciones"
        meta={<p className="max-w-[68ch]">Decisiones de moderación, cambios de tu tienda o publicaciones, bajas de precio de tus favoritos y coincidencias de tus alertas.</p>}
      />
      <PushSettings />
      <NotificationsList notifications={rows} listings={listings} hasUnread={hasUnread} />
      {total > PAGE_SIZE ? (
        <nav aria-label="Paginación de notificaciones" className="flex flex-wrap gap-4 text-sm">
          {page > 1 ? <Link href={page === 2 ? "/mi-cuenta/notificaciones" : `/mi-cuenta/notificaciones?page=${page - 1}`} className="link font-semibold">Más recientes</Link> : null}
          <span className="text-ink-2">Página {page} de {Math.ceil(total / PAGE_SIZE)}</span>
          {page * PAGE_SIZE < total ? <Link href={`/mi-cuenta/notificaciones?page=${page + 1}`} className="link font-semibold">Anteriores</Link> : null}
        </nav>
      ) : null}
    </section>
  );
}
