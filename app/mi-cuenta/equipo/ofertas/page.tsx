import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Tag } from "@/components/ui/tag";
import { getAccountContext } from "@/lib/account-context";
import { formatPrice } from "@/lib/price";
import { formatLimaDateTime, sellingDb, tradeStatusLabel, type TradeRequestSummary } from "@/lib/selling-tools";

export const metadata = { title: "Ofertas de tiendas" };

// sell-02 and run-04: everything the person asked stores for, newest first.
export default async function MyTradeRequestsPage() {
  const { profile, supabase } = await getAccountContext();
  if (profile?.account_type === "store_owner") redirect("/mi-cuenta/tienda/ofertas");
  const { data, error } = supabase ? await sellingDb(supabase).rpc("get_my_trade_requests") : { data: null, error: true };
  const requests = (Array.isArray(data) ? data : []) as TradeRequestSummary[];
  return (
    <section className="grid min-w-0 gap-5">
      <PageHeader
        eyebrow={<Link href="/mi-cuenta/equipo" className="underline decoration-line-deco underline-offset-[3px]">Mi equipo</Link>}
        title="Ofertas de tiendas"
        meta={<p className="max-w-[68ch]">Si prefieres vender ya, las tiendas verificadas de tu región que compran usados te ofertan en 24 horas. Tú eliges una, o ninguna.</p>}
        actions={<Button href="/mi-cuenta/equipo/ofertas/nueva">Pedir ofertas</Button>}
      />
      {error ? <Notice tone="danger" role="alert">No pudimos cargar tus pedidos. Intenta nuevamente.</Notice> : null}
      {!requests.length && !error ? (
        <EmptyState
          title="Todavía no pediste ofertas"
          description="Describe tu guitarra, bajo, amplificador, pedal o teclado con algunas fotos. Tu nombre y tu WhatsApp solo los ve la tienda que elijas."
          actions={<Button href="/mi-cuenta/equipo/ofertas/nueva">Pedir ofertas</Button>}
        />
      ) : (
        <ul className="grid gap-3">
          {requests.map((request) => (
            <li key={request.id}>
              <Link href={`/mi-cuenta/equipo/ofertas/${request.id}`} className="grid gap-1 rounded-panel border border-subtle bg-surface p-4 hover:bg-canvas">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="t-ui font-semibold text-ink">{request.title}</span>
                  <Tag tone={request.status === "open" ? "accent" : "neutral"}>{tradeStatusLabel(request.status, request.kind)}</Tag>
                </span>
                <span className="t-meta">
                  {request.kind === "part_payment" && request.listing ? `Parte de pago de “${request.listing.title}” · ` : ""}
                  {request.offer_count
                    ? `${request.offer_count} ${request.offer_count === 1 ? "oferta" : "ofertas"}, la mejor ${formatPrice(request.best_offer_pen)}`
                    : request.status === "open" ? `Sin ofertas aún · hasta el ${formatLimaDateTime(request.offers_until)}` : "Sin ofertas"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
