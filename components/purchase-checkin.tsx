"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type Checkin = { contacted_at: string; answer: "yes" | "no" | null; seller_decision: string | null; claim_id: string | null; claim_status: string | null };

function readCheckin(value: unknown): Checkin | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.contacted_at !== "string") return null;
  const text = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : null);
  const answer = row.answer === "yes" || row.answer === "no" ? row.answer : null;
  return { contacted_at: row.contacted_at, answer, seller_decision: text("seller_decision"), claim_id: text("claim_id"), claim_status: text("claim_status") };
}

const days = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", timeZone: "America/Lima" });

// big-08 "¿Cómo te fue?": after a signed-in buyer wrote to the seller, the listing asks once whether they bought it.
// "Sí" lets the seller confirm and opens reviews; "No" just stops asking. Anyone else sees nothing.
export function PurchaseCheckin({ listingId }: { listingId: string }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [answered, setAnswered] = useState<"yes" | "no" | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session || !active) return;
      void supabase.rpc("get_purchase_checkin", { p_listing_id: listingId }).then(({ data: value }) => {
        if (active) setCheckin(readCheckin(value));
      });
    });
    return () => { active = false; };
  }, [supabase, listingId]);

  if (answered === "no") return <p role="status" className="rounded-panel bg-canvas p-4 t-ui text-ink-2">Anotado. No volveremos a preguntarte por esta publicación.</p>;
  if (!checkin || checkin.answer === "no") return null;

  async function answer(bought: boolean) {
    if (!supabase || busy) return;
    setBusy(true);
    setError("");
    const { error: failure } = await supabase.rpc("answer_purchase_checkin", { p_listing_id: listingId, p_bought: bought });
    setBusy(false);
    if (failure) return setError("No pudimos guardar tu respuesta. Inténtalo de nuevo.");
    setAnswered(bought ? "yes" : "no");
  }

  if (checkin.claim_status === "confirmed" && checkin.claim_id) {
    return <p className="rounded-panel bg-canvas p-4 t-ui text-ink">Compra reconocida por ambas partes. <Link href={`/mi-cuenta/transacciones/${checkin.claim_id}`} className="link font-semibold">Ver compra y reseña</Link></p>;
  }
  if (checkin.answer === "yes" || answered === "yes") {
    return <p role="status" className="rounded-panel bg-canvas p-4 t-ui text-ink">Gracias. Le pedimos a quien vende que lo confirme; te avisaremos para dejar tu reseña.</p>;
  }

  return (
    <section aria-labelledby="como-te-fue" className="grid gap-3 rounded-panel border border-subtle bg-white p-4">
      <div>
        <h2 id="como-te-fue" className="t-ui font-semibold text-ink">¿Cómo te fue?</h2>
        <p className="mt-1 t-meta">Le escribiste a quien vende el {days.format(new Date(checkin.contacted_at))}. ¿Lo compraste?</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void answer(true)}>Sí, lo compré</Button>
        <Button variant="quiet" size="sm" disabled={busy} onClick={() => void answer(false)}>No lo compré</Button>
      </div>
      {error ? <p role="alert" className="t-meta font-semibold text-danger">{error}</p> : null}
    </section>
  );
}
