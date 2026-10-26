"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { trustErrorMessage } from "@/lib/deal-trust";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// One press: claim_counter_purchase turns the store's counter sale into the buyer's verified purchase, then the buyer
// lands on its page, with the review form.
export function ClaimCounterPurchase({ token, storeName }: { token: string; storeName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function claim() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { data, error: rpcError } = await (supabase as unknown as SupabaseClient).rpc("claim_counter_purchase", { p_token: token });
    const transactionId = data && typeof data === "object" && typeof (data as { transaction_id?: unknown }).transaction_id === "string"
      ? (data as { transaction_id: string }).transaction_id
      : null;
    if (rpcError || !transactionId) {
      setBusy(false);
      setError(trustErrorMessage(rpcError?.message));
      return;
    }
    router.push(`/mi-cuenta/transacciones/${transactionId}`);
  }
  return (
    <div className="grid gap-2">
      <Button onClick={() => void claim()} loading={busy} loadingLabel="Confirmando…" className="w-fit">Sí, compré en {storeName}</Button>
      {error ? <p role="alert" className="t-ui font-semibold text-danger">{error}</p> : null}
    </div>
  );
}
