"use client";

import { type FormEvent, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { StatusEntryTag, StatusTag } from "@/components/ui/tag";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/payment-methods";
import { storeStatusEntry } from "@/lib/ui/status";

export type AdminPaymentMethodRow = {
  store_id: string;
  method: PaymentMethod;
  status: string;
  holder_name: string | null;
  provider_label: string | null;
  owner_note: string | null;
  review_reason: string | null;
  updated_at: string;
  store_name: string;
  store_slug: string;
  store_status: string;
  store_is_verified: boolean;
  razon_social: string | null;
  ruc: string | null;
};

type Decision = "approve" | "reject" | "disable";

const DECISION_LABELS: Record<Decision, string> = { approve: "Aprobar", reject: "Rechazar", disable: "Desactivar" };

// PAY-1 (design §11.2): the Admin compares the account holder with the verified store's razón social and RUC before
// approving. A decision needs a reason and applies only to the version shown here; every decision is audited.
export function AdminPaymentMethodRow({ row }: { row: AdminPaymentMethodRow }) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState<Decision | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const decisions: Decision[] = row.status === "pending_review" ? ["approve", "reject"] : row.status === "approved" ? ["disable"] : [];

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
      const response = await fetch("/api/admin/payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: row.store_id, method: row.method, decision, reason, expectedUpdatedAt: row.updated_at }),
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
          <p className="t-section text-ink">{PAYMENT_METHOD_LABELS[row.method]}{row.provider_label ? ` · ${row.provider_label}` : ""}</p>
          <p className="t-ui text-ink-2">
            <Link href={`/tiendas/${row.store_slug}`} className="link font-semibold">{row.store_name}</Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusEntryTag entry={storeStatusEntry(row.store_status, row.store_is_verified)} />
          <StatusTag domain="payment" status={row.status} />
        </div>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-1 t-ui sm:grid-cols-2">
        <div><dt className="inline font-semibold text-ink">Titular: </dt><dd className="inline text-ink-2">{row.holder_name ?? "No aplica"}</dd></div>
        <div><dt className="inline font-semibold text-ink">Razón social: </dt><dd className="inline text-ink-2">{row.razon_social ?? "Sin dato"}</dd></div>
        <div><dt className="inline font-semibold text-ink">RUC: </dt><dd className="inline tabular-nums text-ink-2">{row.ruc ?? "Sin dato"}</dd></div>
        {row.owner_note ? <div className="sm:col-span-2"><dt className="inline font-semibold text-ink">Nota de la tienda: </dt><dd className="inline text-ink-2">{row.owner_note}</dd></div> : null}
        {row.review_reason ? <div className="sm:col-span-2"><dt className="inline font-semibold text-ink">Motivo registrado: </dt><dd className="inline text-ink-2">{row.review_reason}</dd></div> : null}
      </dl>
      {decisions.length ? (
        <form onSubmit={submit} className="mt-4 grid gap-3">
          <Field id={`${id}-motivo`} label="Motivo o comprobación" hint="Por ejemplo: el titular coincide con la razón social.">
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
