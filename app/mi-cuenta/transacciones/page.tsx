import { TransactionCenter } from "@/components/transaction-center";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { parseTransactionCenter } from "@/lib/transactions";

export const metadata = { title: "Compras y ventas" };

export default async function TransactionsPage() {
  const { supabase } = await getAccountContext();
  const { data, error } = supabase
    ? await supabase.rpc("get_transaction_center")
    : { data: null, error: new Error("Supabase unavailable") };
  const items = error ? [] : parseTransactionCenter(data);

  return (
    <section className="grid gap-5">
      <PageHeader
        eyebrow="Mi cuenta"
        title="Compras y ventas"
        meta={<p className="max-w-3xl">Confirma relaciones originadas en Laria y gestiona reseñas. Laria no confirma pagos, entregas, envíos ni la condición del instrumento.</p>}
      />
      {error ? (
        <Notice tone="danger" role="alert">No pudimos cargar tus transacciones. Intenta nuevamente.</Notice>
      ) : <TransactionCenter items={items} />}
    </section>
  );
}
