import Link from "next/link";
import { redirect } from "next/navigation";
import { TradeRequestForm } from "@/components/offers/trade-request-form";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { GEAR_COLUMNS, sellingDb, type GearItem } from "@/lib/selling-tools";

export const metadata = { title: "Pedir ofertas a tiendas" };

export default async function NewTradeRequestPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { user, profile, supabase } = await getAccountContext();
  if (profile?.account_type === "store_owner") redirect("/mi-cuenta/tienda/ofertas");
  const { data } = supabase ? await sellingDb(supabase).from("gear_items").select(GEAR_COLUMNS).order("created_at", { ascending: false }) : { data: null };
  return (
    <section className="grid min-w-0 gap-5">
      <PageHeader
        eyebrow={<Link href="/mi-cuenta/equipo/ofertas" className="underline decoration-line-deco underline-offset-[3px]">Ofertas de tiendas</Link>}
        title="¿Prefieres vender ya?"
        meta={<p className="max-w-[68ch]">Las tiendas verificadas de tu región que compran usados ven tu pedido durante 24 horas y cada una puede ofertar una vez. Eliges la que quieras, o ninguna, y la llevas a la tienda en 5 días.</p>}
      />
      <TradeRequestForm
        kind="sell"
        userId={user.id}
        gear={(data ?? []) as unknown as GearItem[]}
        initialGearId={typeof params.equipo === "string" ? params.equipo : null}
        defaults={{ city: profile?.city ?? "", region: profile?.region ?? "" }}
      />
    </section>
  );
}
