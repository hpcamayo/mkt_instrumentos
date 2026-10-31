import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Tag } from "@/components/ui/tag";
import { getAccountContext } from "@/lib/account-context";
import { getConditionLabel } from "@/lib/listings";
import { formatPrice } from "@/lib/price";
import {
  EMPTY_TRADE_SETTINGS,
  formatLimaDateTime,
  sellingDb,
  storeTradeStatusLabel,
  type StoreInboxItem,
  type StoreTradeSettings,
} from "@/lib/selling-tools";

export const metadata = { title: "Ofertas" };

// sell-02 and run-04: the store's inbox of requests from particulares (docs/feature-ideas/selling-tools.md).
export default async function StoreOffersPage() {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/equipo/ofertas");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const db = sellingDb(supabase);
  const [{ data, error }, { data: settingsRow }] = await Promise.all([
    db.rpc("get_store_trade_inbox"),
    db.from("store_trade_settings").select("store_id,buys_used,buy_categories,consignment,part_payment,consumables,note").eq("store_id", store.id).maybeSingle(),
  ]);
  const items = (Array.isArray(data) ? data : []) as StoreInboxItem[];
  const settings = (settingsRow as StoreTradeSettings | null) ?? { store_id: store.id, ...EMPTY_TRADE_SETTINGS };
  const now = Date.now();
  const waiting = items.filter((item) => item.status === "open" && !item.my_offer && Date.parse(item.offers_until) > now);

  return (
    <section className="grid min-w-0 gap-5">
      <PageHeader
        eyebrow="Mi tienda"
        title="Ofertas"
        meta={<p className="max-w-[68ch]">Particulares que quieren venderte su equipo o dejarlo como parte de pago. Ves el equipo y las fotos; su nombre y WhatsApp aparecen solo si eligen tu oferta.</p>}
        actions={<Button href="/mi-cuenta/tienda/ofertas/ajustes" variant="secondary">Qué recibimos</Button>}
      />
      {error ? <Notice tone="danger" role="alert">No pudimos cargar los pedidos. Intenta nuevamente.</Notice> : null}
      {!settings.buys_used && !settings.part_payment ? (
        <Notice tone="info" title="Todavía no recibes pedidos">
          Activa «Compramos usados» o «Parte de pago» en <Link href="/mi-cuenta/tienda/ofertas/ajustes" className="link">Qué recibimos</Link>.
        </Notice>
      ) : null}
      {!items.length && !error ? (
        <EmptyState
          title="Sin pedidos por ahora"
          description="Cuando un particular de tu región pida ofertas en las categorías que compras, aparecerá aquí y te avisaremos."
        />
      ) : (
        <>
          {waiting.length ? <p className="t-ui font-semibold text-ink">{waiting.length === 1 ? "1 pedido espera tu oferta" : `${waiting.length} pedidos esperan tu oferta`}</p> : null}
          <ul className="grid gap-3">
            {items.map((item) => (
              <li key={item.id}>
                <Link href={`/mi-cuenta/tienda/ofertas/${item.id}`} className="grid gap-1 rounded-panel border border-subtle bg-surface p-4 hover:bg-canvas">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="t-ui font-semibold text-ink">{item.title}</span>
                    <Tag tone={storeTradeStatusLabel(item, now) === "Nuevo" ? "accent" : "neutral"}>{storeTradeStatusLabel(item, now)}</Tag>
                  </span>
                  <span className="t-meta">
                    {item.kind === "part_payment" ? `Parte de pago de “${item.listing?.title ?? "tu publicación"}” · ` : ""}
                    {getConditionLabel(item.condition)} · {[item.city, item.region].filter(Boolean).join(", ")}
                    {item.asking_price_pen ? ` · Espera ${formatPrice(item.asking_price_pen)}` : ""}
                  </span>
                  {item.status === "open" && !item.my_offer && Date.parse(item.offers_until) > now ? (
                    <span className="t-meta">Puedes ofertar hasta el {formatLimaDateTime(item.offers_until)}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
