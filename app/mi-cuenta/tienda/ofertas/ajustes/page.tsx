import Link from "next/link";
import { redirect } from "next/navigation";
import { StoreTradeSettingsForm } from "@/components/offers/store-trade-settings-form";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { EMPTY_TRADE_SETTINGS, sellingDb, type StoreTradeSettings } from "@/lib/selling-tools";

export const metadata = { title: "Qué recibimos" };

export default async function StoreTradeSettingsPage() {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const { data } = await sellingDb(supabase).from("store_trade_settings")
    .select("buys_used,buy_categories,consignment,part_payment,consumables,note").eq("store_id", store.id).maybeSingle();
  const settings = (data as Omit<StoreTradeSettings, "store_id"> | null) ?? EMPTY_TRADE_SETTINGS;
  return (
    <section className="grid min-w-0 gap-5">
      <PageHeader
        eyebrow={<Link href="/mi-cuenta/tienda/ofertas" className="underline decoration-line-deco underline-offset-[3px]">Ofertas</Link>}
        title="Qué recibimos"
        meta={<p className="max-w-[68ch]">Lo que tu tienda recibe de particulares. Todo está apagado hasta que lo actives, y lo apagas cuando quieras.</p>}
      />
      <StoreTradeSettingsForm settings={settings} verified={store.status === "active" && store.is_verified === true} />
    </section>
  );
}
