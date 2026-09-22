import { TransactionCenter } from "@/components/transaction-center";
import { getAccountContext } from "@/lib/account-context";
import { parseTransactionCenter } from "@/lib/transactions";

export const metadata = { title: "Compras" };

export default async function TransactionsPage() {
  const { supabase } = await getAccountContext();
  const { data, error } = supabase
    ? await supabase.rpc("get_transaction_center")
    : { data: null, error: new Error("Supabase unavailable") };
  const items = error ? [] : parseTransactionCenter(data);

  return (
    <section className="grid gap-5">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-laria-blue">Mi cuenta</p>
        <h1 className="mt-1 text-3xl font-black text-laria-ink">Compras</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-laria-text-soft">
          Confirma relaciones originadas en Laria y gestiona reseñas. Laria no confirma pagos, entregas, envíos ni el estado del producto.
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          No pudimos cargar tus transacciones. Intenta nuevamente.
        </p>
      ) : <TransactionCenter items={items} />}
    </section>
  );
}
