"use client";

import { type FormEvent, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { DEALER_STATUS_LABELS, formatDealerDate, type DealerAuthorization } from "@/lib/dealers";

type Decision = "approve" | "reject" | "revoke";
const DECISION_LABELS: Record<Decision, string> = { approve: "Aprobar", reject: "No aprobar", revoke: "Retirar marca" };

// reach-04 (docs/feature-ideas/store-reach.md): Admin opens the document, compares it with the store (name, razón social,
// RUC) and decides. A rejection or a revocation needs a reason the store will read; approval can set the end date the
// document states. A decision applies only to the revision shown; every decision is audited.
export function AdminDealerRow({ row }: { row: DealerAuthorization }) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState<Decision | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const decisions: Decision[] = row.status === "pending" ? ["approve", "reject"] : row.status === "approved" ? ["revoke"] : [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const decision = submitter?.value as Decision | undefined;
    if (!decision || !decisions.includes(decision) || busy) return;
    const data = new FormData(event.currentTarget);
    const reason = String(data.get("reason") ?? "").trim();
    if (decision !== "approve" && reason.length < 3) return setMessage({ tone: "danger", text: "Escribe el motivo; la tienda lo verá." });
    setBusy(decision);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/dealers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          decision,
          reason: reason || undefined,
          expectedRevision: row.revision,
          validUntil: decision === "approve" ? String(data.get("validUntil") ?? "") || null : undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) return setMessage({ tone: "danger", text: payload?.message ?? "No se pudo guardar la decisión." });
      setMessage({ tone: "success", text: "Decisión guardada." });
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: "No se pudo guardar la decisión. Revisa tu conexión." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="rounded-panel border border-subtle bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="t-section text-ink">{row.brand}</p>
          {row.store ? <p className="t-ui text-ink-2"><Link href={`/tiendas/${row.store.slug}`} className="link font-semibold">{row.store.name}</Link></p> : null}
        </div>
        <p className="t-ui font-semibold text-ink">{DEALER_STATUS_LABELS[row.status]}</p>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-1 t-ui sm:grid-cols-2">
        <div><dt className="inline font-semibold text-ink">RUC: </dt><dd className="inline tabular-nums text-ink-2">{row.store?.ruc ?? "Sin dato"}</dd></div>
        <div><dt className="inline font-semibold text-ink">Tienda verificada: </dt><dd className="inline text-ink-2">{row.store?.verified ? "Sí" : "No"}</dd></div>
        <div><dt className="inline font-semibold text-ink">Vigencia indicada: </dt><dd className="inline text-ink-2">{row.validUntil ? formatDealerDate(row.validUntil) : "Sin fecha"}</dd></div>
        <div><dt className="inline font-semibold text-ink">Documento: </dt><dd className="inline text-ink-2"><a href={`/api/admin/dealers/${row.id}/document`} className="link font-semibold" rel="noreferrer">{row.documentName}</a></dd></div>
        {row.ownerNote ? <div className="sm:col-span-2"><dt className="inline font-semibold text-ink">Nota de la tienda: </dt><dd className="inline text-ink-2">{row.ownerNote}</dd></div> : null}
        {row.reviewReason ? <div className="sm:col-span-2"><dt className="inline font-semibold text-ink">Motivo registrado: </dt><dd className="inline text-ink-2">{row.reviewReason}</dd></div> : null}
      </dl>
      {decisions.length ? (
        <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`${id}-motivo`} label={row.status === "pending" ? "Motivo o comprobación" : "Motivo"} hint="Obligatorio para no aprobar o retirar; la tienda lo verá.">
              <Input name="reason" maxLength={500} />
            </Field>
            {row.status === "pending" ? (
              <Field id={`${id}-vigencia`} label="Vigente hasta" optional hint="La fecha que indica el documento, si tiene.">
                <Input name="validUntil" type="date" defaultValue={row.validUntil ?? undefined} />
              </Field>
            ) : null}
          </div>
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
