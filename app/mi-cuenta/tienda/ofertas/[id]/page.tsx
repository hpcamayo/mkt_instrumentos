import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StoreTradeOffer } from "@/components/offers/store-trade-offer";
import { TradePhotos } from "@/components/offers/trade-photos";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { getConditionLabel } from "@/lib/listings";
import { formatPrice } from "@/lib/price";
import { gearKindLabel, sellingDb, type StoreTradeRequest } from "@/lib/selling-tools";

export const metadata = { title: "Pedido de oferta" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StoreTradeRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const { data } = await sellingDb(supabase).rpc("get_store_trade_request", { p_request_id: id });
  const request = data as StoreTradeRequest | null;
  if (!request) notFound();
  return (
    <section className="grid min-w-0 gap-5">
      <PageHeader
        eyebrow={<Link href="/mi-cuenta/tienda/ofertas" className="underline decoration-line-deco underline-offset-[3px]">Ofertas</Link>}
        title={request.title}
        meta={request.kind === "part_payment" && request.listing
          ? <p>Parte de pago de <Link href={`/instrumentos/${request.listing.slug}`} className="link">{request.listing.title}</Link>{request.listing.price_pen ? ` (${formatPrice(request.listing.price_pen)})` : ""}</p>
          : <p>{gearKindLabel(request)}</p>}
      />
      <section aria-labelledby="equipo-ofrecido" className="grid gap-3 rounded-panel border border-subtle bg-surface p-5">
        <h2 id="equipo-ofrecido" className="t-section text-ink">El equipo</h2>
        <p className="t-ui text-ink">
          {getConditionLabel(request.condition)} · {[request.city, request.region].filter(Boolean).join(", ")}
          {request.asking_price_pen ? ` · Espera ${formatPrice(request.asking_price_pen)}` : ""}
        </p>
        <p className="whitespace-pre-line t-body text-ink">{request.description}</p>
        <TradePhotos photos={request.photos} title={request.title} />
      </section>
      <StoreTradeOffer request={request} storeName={store.name} />
    </section>
  );
}
