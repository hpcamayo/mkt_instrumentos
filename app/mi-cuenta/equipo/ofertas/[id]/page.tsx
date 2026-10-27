import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TradeRequestView } from "@/components/offers/trade-request-view";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { sellingDb, type MyTradeRequest } from "@/lib/selling-tools";

export const metadata = { title: "Pedido de ofertas" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TradeRequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { profile, supabase } = await getAccountContext();
  if (profile?.account_type === "store_owner") redirect("/mi-cuenta/tienda/ofertas");
  const { data } = supabase ? await sellingDb(supabase).rpc("get_my_trade_request", { p_request_id: id }) : { data: null };
  const request = data as MyTradeRequest | null;
  if (!request) notFound();
  return (
    <section className="grid min-w-0 gap-5">
      <PageHeader
        eyebrow={<Link href="/mi-cuenta/equipo/ofertas" className="underline decoration-line-deco underline-offset-[3px]">Ofertas de tiendas</Link>}
        title={request.title}
        meta={request.kind === "part_payment" && request.listing
          ? <p>Parte de pago de <Link href={`/instrumentos/${request.listing.slug}`} className="link">{request.listing.title}</Link></p>
          : null}
      />
      <TradeRequestView request={request} profilePhone={profile?.phone ?? null} justSent={query.enviado === "1"} />
    </section>
  );
}
