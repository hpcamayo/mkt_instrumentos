"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSellingRpc } from "@/components/offers/use-selling-rpc";
import { Field, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

// run-04: one store listing's choice about "Aceptamos tu equipo como parte de pago". It saves on its own, so it can sit
// on the selling tools page or inside the listing edit form.
export function PartPaymentToggle({ listingId, value, storeDefault }: { listingId: string; value: boolean | null; storeDefault: boolean }) {
  const router = useRouter();
  const { run, busy, error } = useSellingRpc();
  const [choice, setChoice] = useState(value === null ? "store" : value ? "yes" : "no");
  const [saved, setSaved] = useState(false);

  async function change(next: string) {
    setChoice(next);
    setSaved(false);
    const result = await run("set_listing_part_payment", { p_listing_id: listingId, p_value: next === "store" ? null : next === "yes" },
      "No pudimos guardar el cambio. Inténtalo de nuevo.");
    if (result !== null) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <div className="grid gap-2">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field id={`parte-de-pago-${listingId}`} label="Aceptamos tu equipo como parte de pago" hint={saved ? "Guardado." : "El comprador te envía fotos de lo que dejaría y tú respondes con un estimado."}>
        <Select value={choice} disabled={busy !== null} onChange={(event) => change(event.target.value)}>
          <option value="store">Como mi tienda ({storeDefault ? "sí" : "no"})</option>
          <option value="yes">Sí, en esta publicación</option>
          <option value="no">No, en esta publicación</option>
        </Select>
      </Field>
    </div>
  );
}
