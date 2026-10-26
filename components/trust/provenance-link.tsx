"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { History } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { readProvenanceOptions, trustErrorMessage, type ProvenanceOptions } from "@/lib/deal-trust";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { statusLabel } from "@/lib/ui/status";

// «Historial en Laria» (safe-11), on the buyer's side of a verified purchase: when they resell the instrument in Laria
// they can link the new publication to this purchase, and the publication then says when it was bought here, how many
// owners it had in Laria and how it was first described. Never who sold it. Only the new owner links, and they can
// undo it until the new publication is sold.
export function ProvenanceLink({ transactionId }: { transactionId: string }) {
  const id = useId();
  const [options, setOptions] = useState<ProvenanceOptions | null>(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data, error } = await (supabase as unknown as SupabaseClient).rpc("get_my_provenance_options", { p_transaction_id: transactionId });
    setOptions(error ? { eligible: false, linked: null, candidates: [] } : readProvenanceOptions(data));
  }, [transactionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function call(fn: "link_listing_provenance" | "unlink_listing_provenance") {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const args = fn === "link_listing_provenance" ? { p_transaction_id: transactionId, p_listing_id: choice } : { p_transaction_id: transactionId };
    const { error } = await (supabase as unknown as SupabaseClient).rpc(fn, args);
    setBusy(false);
    setFailed(Boolean(error));
    if (error) {
      setMessage(trustErrorMessage(error.message));
      return;
    }
    setChoice("");
    setMessage(fn === "link_listing_provenance" ? "Listo. Tu publicación muestra su historial en Laria." : "Quitamos el historial de tu publicación.");
    await load();
  }

  if (!options?.eligible || (!options.linked && options.candidates.length === 0)) return null;
  return (
    <section aria-labelledby={`${id}-titulo`} className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
      <h2 id={`${id}-titulo`} className="flex items-center gap-2 t-section text-ink">
        <History aria-hidden className="h-5 w-5 shrink-0" />
        Historial en Laria
      </h2>
      {options.linked ? (
        <>
          <p className="mt-2 t-ui text-ink">
            <Link href={`/instrumentos/${options.linked.slug}`} className="link font-semibold">{options.linked.title}</Link>{" "}
            muestra que lo compraste en Laria y cuántos dueños tuvo aquí, sin nombrar a nadie.
          </p>
          {options.linked.status !== "sold" ? (
            <Button size="sm" variant="secondary" className="mt-3" loading={busy} onClick={() => void call("unlink_listing_provenance")}>
              Quitar el historial
            </Button>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-2 t-ui text-ink-2">
            ¿Lo vas a vender en Laria? Vincula tu publicación y mostrará que lo compraste aquí, cuántos dueños tuvo en Laria y
            cómo se describió la primera vez. No muestra quién te lo vendió.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field id={`${id}-publicacion`} label="Tu publicación" className="sm:min-w-[280px]">
              <Select value={choice} onChange={(event) => setChoice(event.target.value)}>
                <option value="">Elige una publicación</option>
                {options.candidates.map((candidate) => (
                  <option key={candidate.listingId} value={candidate.listingId}>
                    {candidate.title} ({statusLabel("listing", candidate.status)})
                  </option>
                ))}
              </Select>
            </Field>
            <Button variant="secondary" className="w-fit" disabled={!choice} loading={busy} onClick={() => void call("link_listing_provenance")}>
              Vincular
            </Button>
          </div>
        </>
      )}
      {message ? <p role={failed ? "alert" : "status"} className={failed ? "mt-3 t-meta font-semibold text-danger" : "mt-3 t-meta"}>{message}</p> : null}
    </section>
  );
}
