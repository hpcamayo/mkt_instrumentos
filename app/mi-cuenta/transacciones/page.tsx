import { TransactionCenter } from "@/components/transaction-center";
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
      <div>
        <p className="t-micro text-ink-2">Mi cuenta</p>
        <h1 className="mt-1 t-page text-ink">Compras y ventas</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-2">
          Confirma relaciones originadas en Laria y gestiona reseñas. Laria no confirma pagos, entregas, envíos ni la condición del instrumento.
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-panel bg-danger-tint p-4 text-sm text-danger">
          No pudimos cargar tus transacciones. Intenta nuevamente.
        </p>
      ) : <TransactionCenter items={items} />}
    </section>
  );
}
