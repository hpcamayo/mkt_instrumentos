import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TransactionCenter } from "@/components/transaction-center";
import { AccountTrust } from "@/components/trust/account-trust";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { readMyLevels, readMySellerPage, readTrackRecord } from "@/lib/deal-trust";
import { parseTransactionCenter } from "@/lib/transactions";

export const metadata = { title: "Compras y ventas" };

export default async function TransactionsPage() {
  const { supabase } = await getAccountContext();
  // deal-trust (reach-11): purchases confirmed with a store's counter code join the list, newest first. A failed
  // counter read leaves only those out.
  // «Tu perfil en Laria» (seller page, buyer card, seller level) reads alongside; a failed read hides that card only.
  const untyped = supabase as unknown as SupabaseClient | null;
  const [{ data, error }, counter, sellerPage, trackRecord, levels] = supabase && untyped
    ? await Promise.all([
        supabase.rpc("get_transaction_center"),
        untyped.rpc("get_counter_transaction_center"),
        untyped.rpc("get_my_seller_page"),
        untyped.rpc("get_my_track_record"),
        untyped.rpc("get_my_seller_levels"),
      ])
    : [{ data: null, error: new Error("Supabase unavailable") }, null, null, null, null];
  const counterItems = counter && !counter.error ? parseTransactionCenter(counter.data) : [];
  const items = error ? [] : counterItems.length
    ? [...parseTransactionCenter(data), ...counterItems].sort((a, b) => Date.parse(b.sold_at) - Date.parse(a.sold_at))
    : parseTransactionCenter(data);

  return (
    <section className="grid gap-5">
      <PageHeader
        eyebrow="Mi cuenta"
        title="Compras y ventas"
        meta={<p className="max-w-3xl">Confirma relaciones originadas en Laria y gestiona reseñas. Laria no confirma pagos, entregas, envíos ni la condición del instrumento. {/* store-floor (buy-07) */}<Link href="/mi-cuenta/pruebas" className="link font-semibold">Tus pruebas en tiendas</Link>.</p>}
      />
      {error ? (
        <Notice tone="danger" role="alert">No pudimos cargar tus transacciones. Intenta nuevamente.</Notice>
      ) : <TransactionCenter items={items} />}
      <AccountTrust
        sellerPage={sellerPage && !sellerPage.error ? readMySellerPage(sellerPage.data) : null}
        trackRecord={trackRecord && !trackRecord.error ? readTrackRecord(trackRecord.data) : null}
        levels={levels && !levels.error ? readMyLevels(levels.data) : null}
      />
    </section>
  );
}
