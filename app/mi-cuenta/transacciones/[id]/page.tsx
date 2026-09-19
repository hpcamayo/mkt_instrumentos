import { notFound } from "next/navigation";
import { TransactionDetailView } from "@/components/transaction-detail";
import { getAccountContext } from "@/lib/account-context";
import { parseEligibleBuyers, parseTransactionDetail } from "@/lib/transactions";

export const metadata = { title: "Detalle de compra o venta" };

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getAccountContext();
  if (!supabase) notFound();
  const { data, error } = await supabase.rpc("get_transaction_detail", { p_reference_id: id });
  const detail = error ? null : parseTransactionDetail(data);
  if (!detail) notFound();
  const { data: candidateData } = detail.role === "seller" && detail.state !== "verified"
    ? await supabase.rpc("get_eligible_transaction_buyers", { p_listing_id: detail.listing_id })
    : { data: [] };
  return <TransactionDetailView detail={detail} candidates={parseEligibleBuyers(candidateData)} />;
}
