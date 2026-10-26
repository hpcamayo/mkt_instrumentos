"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PartPaymentField } from "@/components/offers/part-payment-field";
import { useSellingRpc } from "@/components/offers/use-selling-rpc";
import { Notice } from "@/components/ui/notice";

// run-04: one store listing's choice about "Aceptamos tu equipo como parte de pago", saved as soon as it changes (the
// selling tools page). Forms use PartPaymentField and send it with the listing's details instead.
export function PartPaymentToggle({ listingId, value, storeDefault }: { listingId: string; value: boolean | null; storeDefault: boolean }) {
  const router = useRouter();
  const { run, busy, error } = useSellingRpc();
  const [choice, setChoice] = useState(value);
  const [saved, setSaved] = useState(false);

  async function change(next: boolean | null) {
    setChoice(next);
    setSaved(false);
    const result = await run("set_listing_part_payment", { p_listing_id: listingId, p_value: next }, "No pudimos guardar el cambio. Inténtalo de nuevo.");
    if (result !== null) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <div className="grid gap-2">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <PartPaymentField id={`parte-de-pago-${listingId}`} value={choice} storeDefault={storeDefault} onChange={change} disabled={busy !== null} hint={saved ? "Guardado." : undefined} />
    </div>
  );
}
