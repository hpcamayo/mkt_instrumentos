import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { TransactionDetailView } from "@/components/transaction-detail";
import { getAccountContext } from "@/lib/account-context";
import { parseEligibleBuyers, parseTransactionDetail } from "@/lib/transactions";

export const metadata = { title: "Detalle de compra o venta" };

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getAccountContext();
  if (!supabase) notFound();
  // deal-trust (reach-11): a counter purchase first (null for any other id), then the listing transaction.
  const counter = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? await (supabase as unknown as SupabaseClient).rpc("get_counter_transaction_detail", { p_transaction_id: id })
    : null;
  const counterDetail = counter && !counter.error && counter.data ? parseTransactionDetail(counter.data) : null;
  const { data, error } = counterDetail ? { data: null, error: null } : await supabase.rpc("get_transaction_detail", { p_reference_id: id });
  const detail = counterDetail ?? (error ? null : parseTransactionDetail(data));
  if (!detail) notFound();
  const { data: candidateData } = detail.role === "seller" && detail.state !== "verified" && detail.listing_id
    ? await supabase.rpc("get_eligible_transaction_buyers", { p_listing_id: detail.listing_id })
    : { data: [] };
  return <TransactionDetailView detail={detail} candidates={parseEligibleBuyers(candidateData)} />;
}
