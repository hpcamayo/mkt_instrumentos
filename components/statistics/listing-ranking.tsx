import Link from "next/link";
import { listingEditHref, type ListingStatistics, type ListingStatisticsRow } from "@/lib/account-analytics";

const numbers = new Intl.NumberFormat("es-PE");

export function countLabel(value: number, [one, many]: readonly [string, string]) {
  return `${numbers.format(value)} ${value === 1 ? one : many}`;
}

// Sold and archived listings cannot be edited; their row opens the public page instead.
export function listingRowHref(listing: Pick<ListingStatisticsRow, "id" | "status" | "slug">) {
  if (!["sold", "archived"].includes(listing.status)) return listingEditHref(listing.id);
  return listing.slug ? `/instrumentos/${listing.slug}` : null;
}

// One top-5 ranking ("Lo más visto", "Lo más consultado"…). Each row is the listing's title, linked, and its number.
export function ListingRanking({ title, rows, metric, unit, empty }: {
  title: string;
  rows: ListingStatisticsRow[];
  metric: "views" | "contacts" | "purchase_requests";
  unit: readonly [string, string];
  empty: string;
}) {
  return (
    <section className="rounded-panel border border-subtle bg-surface p-4" aria-label={title}>
      <h3 className="t-ui font-semibold text-ink">{title}</h3>
      {rows.length ? (
        <ol className="mt-2 divide-y divide-subtle">
          {rows.map((listing, index) => {
            const href = listingRowHref(listing);
            return (
              <li key={listing.id} className="flex min-h-11 items-center gap-3 py-2">
                <span className="w-5 shrink-0 t-meta tabular-nums text-ink-2" aria-hidden>{index + 1}</span>
                <span className="min-w-0 flex-1 truncate t-ui">
                  {href ? <Link href={href} className="link">{listing.title}</Link> : listing.title}
                </span>
                <span className="shrink-0 t-ui font-semibold tabular-nums text-ink">{countLabel(listing[metric], unit)}</span>
              </li>
            );
          })}
        </ol>
      ) : <p className="mt-2 t-meta text-ink-2">{empty}</p>}
    </section>
  );
}

// Approved listings that got WhatsApp contacts in the last 30 days and are still published.
export function ContactsWithoutSale({ data, purchaseRequests = false }: { data: ListingStatistics["contacts_without_sale"]; purchaseRequests?: boolean }) {
  return (
    <section aria-labelledby="contactos-sin-venta" className="rounded-panel border border-subtle bg-surface p-4">
      <h2 id="contactos-sin-venta" className="t-section text-ink">Contactos sin venta en 30 días</h2>
      {data.count ? (
        <>
          <p className="mt-1 t-ui text-ink-2">
            {data.count === 1
              ? `1 publicación recibió ${countLabel(data.contacts, ["contacto", "contactos"])} por WhatsApp y sigue publicada.`
              : `${numbers.format(data.count)} publicaciones recibieron ${countLabel(data.contacts, ["contacto", "contactos"])} por WhatsApp y siguen publicadas.`}
            {" "}Si ya vendiste alguna, márcala como vendida; si no, revisa el precio o confirma que sigue disponible.
            {purchaseRequests ? " Aquí cuentan todas las aperturas de WhatsApp, también las solicitudes de compra." : null}
          </p>
          <ul className="mt-2 divide-y divide-subtle">
            {data.items.map((item) => (
              <li key={item.id} className="flex min-h-11 items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate t-ui"><Link href={listingEditHref(item.id)} className="link">{item.title}</Link></span>
                <span className="shrink-0 t-ui font-semibold tabular-nums text-ink">{countLabel(item.contacts, ["contacto", "contactos"])}</span>
              </li>
            ))}
          </ul>
        </>
      ) : <p className="mt-1 t-ui text-ink-2">Ninguna publicación activa tiene contactos sin vender en los últimos 30 días.</p>}
    </section>
  );
}
