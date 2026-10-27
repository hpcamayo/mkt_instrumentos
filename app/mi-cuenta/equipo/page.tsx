import Link from "next/link";
import { redirect } from "next/navigation";
import { ConsignmentOwnerActions } from "@/components/offers/consignment-owner-actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { Tag } from "@/components/ui/tag";
import { getAccountContext } from "@/lib/account-context";
import {
  GEAR_COLUMNS,
  REMINDER_LABELS,
  consignmentStatusLabel,
  formatCalendarDate,
  gearKindLabel,
  sellingDb,
  todayInLima,
  warrantyStatus,
  type GearItem,
  type GearReminder,
  type MyConsignment,
  type TradeRequestSummary,
} from "@/lib/selling-tools";

export const metadata = { title: "Mi equipo" };

// sell-01 "Mi equipo" (docs/feature-ideas/selling-tools.md): a Particular's private list of their gear. Purchases
// confirmed in Laria appear on their own; the rest is typed by brand and model. Estimated values wait for the catalog.
export default async function GearPage() {
  const { profile, supabase } = await getAccountContext();
  if (profile?.account_type === "store_owner") redirect("/mi-cuenta/tienda/ofertas");
  const db = supabase ? sellingDb(supabase) : null;
  const [itemsResult, remindersResult, consignmentsResult, requestsResult] = supabase && db
    ? await Promise.all([
        sellingDb(supabase).from("gear_items").select(GEAR_COLUMNS).order("created_at", { ascending: false }),
        sellingDb(supabase).from("gear_reminders").select("gear_item_id,kind,every_months,last_changed_on,next_due_on"),
        db.rpc("get_my_consignments"),
        db.rpc("get_my_trade_requests"),
      ])
    : [{ data: null, error: true }, { data: null }, { data: null }, { data: null }];
  const items = (itemsResult.data ?? []) as unknown as GearItem[];
  const reminders = new Map(((remindersResult.data ?? []) as unknown as GearReminder[]).map((row) => [row.gear_item_id, row]));
  const consignments = (Array.isArray(consignmentsResult.data) ? consignmentsResult.data : []) as MyConsignment[];
  const requests = (Array.isArray(requestsResult.data) ? requestsResult.data : []) as TradeRequestSummary[];
  const openRequests = requests.filter((request) => request.status === "open" || request.status === "accepted");
  const today = todayInLima();

  return (
    <section className="grid min-w-0 gap-6">
      <PageHeader
        eyebrow="Mi cuenta"
        title="Mi equipo"
        meta={<p className="max-w-[68ch]">Lo que tienes, en un solo lugar: número de serie, garantía y un botón para venderlo cuando quieras. Solo lo ves tú.</p>}
        actions={<Button href="/mi-cuenta/equipo/nuevo">Agregar equipo</Button>}
      />
      {itemsResult.error ? <Notice tone="danger" role="alert">No pudimos cargar tu equipo. Intenta nuevamente.</Notice> : null}

      {requests.length ? (
        <Link href="/mi-cuenta/equipo/ofertas" className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-panel border border-subtle bg-surface p-4 hover:bg-canvas">
          <span className="t-ui font-semibold text-ink">Ofertas de tiendas</span>
          <span className="t-meta">
            {openRequests.length ? `${openRequests.length} ${openRequests.length === 1 ? "pedido abierto" : "pedidos abiertos"}` : "Ver tus pedidos anteriores"}
          </span>
        </Link>
      ) : null}

      {!items.length && !itemsResult.error ? (
        <EmptyState
          title="Todavía no agregaste equipos"
          description="Las compras que confirmes en Laria aparecen aquí solas. También puedes agregar lo que ya tienes, con su número de serie y garantía."
          actions={<Button href="/mi-cuenta/equipo/nuevo">Agregar equipo</Button>}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" aria-label="Tus equipos">
          {items.map((item) => {
            const warranty = warrantyStatus(item.warranty_until, today);
            const reminder = reminders.get(item.id);
            return (
              <li key={item.id} className="grid gap-2 rounded-panel border border-subtle bg-surface p-4">
                <Link href={`/mi-cuenta/equipo/${item.id}`} className="t-section text-ink underline decoration-line-deco underline-offset-[3px] hover:decoration-ink">
                  {item.title}
                </Link>
                <p className="t-meta">
                  {gearKindLabel(item)}
                  {item.purchased_on ? ` · Comprado el ${formatCalendarDate(item.purchased_on)}` : ""}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {item.source === "purchase" ? <Tag tone="accent">Compra confirmada en Laria</Tag> : null}
                  {warranty ? <Tag tone={warranty.tone === "warning" ? "warning" : "neutral"}>{warranty.label}</Tag> : null}
                  {reminder ? <Tag tone="line">{REMINDER_LABELS[reminder.kind].noun}: {formatCalendarDate(reminder.next_due_on)}</Tag> : null}
                  {item.sale_listing_id ? <Tag tone="line">Venta iniciada</Tag> : null}
                  {item.serial ? null : <Tag tone="line">Sin número de serie</Tag>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {consignments.length ? (
        <section aria-labelledby="consignaciones" className="grid gap-3">
          <h2 id="consignaciones" className="t-section text-ink">En consignación</h2>
          <p className="max-w-[68ch] t-ui text-ink-2">Equipos tuyos que una tienda publica por ti. La comisión y el pago los acuerdas con la tienda; Laria solo te muestra cómo va.</p>
          <ul className="grid gap-3">
            {consignments.map((row) => (
              <li key={row.id} className="grid gap-3 rounded-panel border border-subtle bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/instrumentos/${row.listing.slug}`} className="t-ui font-semibold text-ink underline decoration-line-deco underline-offset-[3px]">
                      {row.listing.title}
                    </Link>
                    <p className="t-meta">En {row.store.name}{row.store.city ? `, ${row.store.city}` : ""}</p>
                  </div>
                  <Tag tone={row.status === "active" ? "accent" : "neutral"}>{consignmentStatusLabel(row.status)}</Tag>
                </div>
                <Price value={row.listing.price_pen} size="inline" />
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-control bg-canvas p-2"><dt className="t-meta">Visitas</dt><dd className="t-ui font-semibold tabular-nums">{row.views}</dd></div>
                  <div className="rounded-control bg-canvas p-2"><dt className="t-meta">Contactos</dt><dd className="t-ui font-semibold tabular-nums">{row.contacts}</dd></div>
                  <div className="rounded-control bg-canvas p-2"><dt className="t-meta">Guardados</dt><dd className="t-ui font-semibold tabular-nums">{row.saves}</dd></div>
                </dl>
                {row.status === "active" ? <ConsignmentOwnerActions consignmentId={row.id} storeName={row.store.name} storePhone={row.store.whatsapp_phone} listingTitle={row.listing.title} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
