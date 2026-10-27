"use client";

import { type FormEvent, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { StatusEntryTag, StatusTag } from "@/components/ui/tag";
import { installmentOfferText, PAYMENT_METHOD_LABELS, readInstallmentOffer, type PaymentMethod } from "@/lib/payment-methods";
import { statusLabel, storeStatusEntry } from "@/lib/ui/status";

export type AdminInstallmentRow = {
  store_id: string;
  max_installments: number;
  cards: string[];
  min_price_pen: number | null;
  status: string;
  owner_note: string | null;
  review_reason: string | null;
  updated_at: string;
  // Bumped on every change; a decision applies to this revision only.
  revision: number;
  store_name: string;
  store_slug: string;
  store_status: string;
  store_is_verified: boolean;
  card_methods: { method: PaymentMethod; status: string; provider_label: string | null }[];
};

type Decision = "approve" | "reject" | "disable";

const DECISION_LABELS: Record<Decision, string> = { approve: "Aprobar", reject: "Rechazar", disable: "Desactivar" };

// store-floor, buy-09: the Admin checks that the store's card provider gives these installments without interest (the
// owner confirmed it) before approving. Buyers see them only while a card method of the store is approved too.
export function AdminInstallmentRow({ row }: { row: AdminInstallmentRow }) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState<Decision | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const decisions: Decision[] = row.status === "pending_review" ? ["approve", "reject"] : row.status === "approved" ? ["disable"] : [];
  const offer = readInstallmentOffer(row);
  const cardMethods = row.card_methods.filter((item) => item.status !== "withdrawn");

  async function decide(decision: Decision, form: HTMLFormElement) {
    if (busy) return;
    const reason = String(new FormData(form).get("reason") ?? "").trim();
    if (reason.length < 3) {
      setMessage({ tone: "danger", text: "Indica el motivo o lo que comprobaste." });
      return;
    }
    setBusy(decision);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/installments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: row.store_id, decision, reason, expectedRevision: row.revision }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        setMessage({ tone: "danger", text: payload?.message ?? "No se pudo guardar la decisión." });
        return;
      }
      setMessage({ tone: "success", text: "Decisión guardada." });
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: "No se pudo guardar la decisión. Revisa tu conexión." });
    } finally {
      setBusy(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const decision = submitter?.value as Decision | undefined;
    if (decision && decisions.includes(decision)) void decide(decision, event.currentTarget);
  }

  return (
    <li className="rounded-panel border border-subtle bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="t-section text-ink">Hasta {row.max_installments} cuotas sin intereses</p>
          <p className="t-ui text-ink-2">
            <Link href={`/tiendas/${row.store_slug}`} className="link font-semibold">{row.store_name}</Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusEntryTag entry={storeStatusEntry(row.store_status, row.store_is_verified)} />
          <StatusTag domain="payment" status={row.status} />
        </div>
      </div>
      {offer ? <p className="mt-2 t-ui text-ink">Los compradores leerán: «{installmentOfferText(offer)}»</p> : null}
      <dl className="mt-3 grid gap-x-6 gap-y-1 t-ui">
        <div>
          <dt className="inline font-semibold text-ink">Medios con tarjeta: </dt>
          <dd className="inline text-ink-2">
            {cardMethods.length
              ? cardMethods.map((item) => `${PAYMENT_METHOD_LABELS[item.method]}${item.provider_label ? ` (${item.provider_label})` : ""}: ${statusLabel("payment", item.status).toLowerCase()}`).join(" · ")
              : "Ninguno. No se mostrarán hasta que la tienda tenga uno aprobado."}
          </dd>
        </div>
        <div><dt className="inline font-semibold text-ink">Sin intereses: </dt><dd className="inline text-ink-2">confirmado por la tienda al enviarlas</dd></div>
        {row.owner_note ? <div><dt className="inline font-semibold text-ink">Nota de la tienda: </dt><dd className="inline text-ink-2">{row.owner_note}</dd></div> : null}
        {row.review_reason ? <div><dt className="inline font-semibold text-ink">Motivo registrado: </dt><dd className="inline text-ink-2">{row.review_reason}</dd></div> : null}
      </dl>
      {decisions.length ? (
        <form onSubmit={submit} className="mt-4 grid gap-3">
          <Field id={`${id}-motivo`} label="Motivo o comprobación" hint="Por ejemplo: su proveedor ofrece estas cuotas sin intereses.">
            <Input name="reason" required minLength={3} maxLength={280} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {decisions.map((decision) => (
              <Button key={decision} type="submit" name="decision" value={decision} variant={decision === "approve" ? "secondary" : "danger"} loading={busy === decision} loadingLabel="Guardando">
                {DECISION_LABELS[decision]}
              </Button>
            ))}
          </div>
        </form>
      ) : null}
      {message ? <Notice tone={message.tone} className="mt-3">{message.text}</Notice> : null}
    </li>
  );
}
