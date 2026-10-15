"use client";

import { type FormEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { StatusTag } from "@/components/ui/tag";
import { Textarea } from "@/components/ui/textarea";
import {
  PAYMENT_METHOD_HINTS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  paymentMethodNeedsHolder,
  type PaymentMethod,
} from "@/lib/payment-methods";

export type OwnerPaymentMethod = {
  method: PaymentMethod;
  status: string;
  holder_name: string | null;
  provider_label: string | null;
  owner_note: string | null;
  review_reason: string | null;
};

// PAY-1 (design §11.1–11.2): the store declares each method it accepts. Every save goes to Laria's review; only an
// approved method of a verified store is shown to buyers. No numbers, accounts or links are asked for or stored.
export function StorePaymentMethodsForm({ methods, canEdit }: { methods: OwnerPaymentMethod[]; canEdit: boolean }) {
  return (
    <div className="grid gap-4">
      {PAYMENT_METHODS.map((method) => (
        <PaymentMethodCard key={method} method={method} current={methods.find((item) => item.method === method) ?? null} canEdit={canEdit} />
      ))}
    </div>
  );
}

function PaymentMethodCard({ method, current, canEdit }: { method: PaymentMethod; current: OwnerPaymentMethod | null; canEdit: boolean }) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState<"save" | "withdraw" | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const active = current !== null && current.status !== "withdrawn";
  const needsHolder = paymentMethodNeedsHolder(method);

  async function send(action: "save" | "withdraw", form?: HTMLFormElement) {
    if (busy) return;
    setBusy(action);
    setMessage(null);
    const data = form ? new FormData(form) : null;
    const read = (key: string) => (data?.get(key) as string | null)?.trim() || undefined;
    try {
      const response = await fetch("/api/store/payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "save"
            ? { action, method, holderName: read("holderName"), providerLabel: read("providerLabel"), note: read("note") }
            : { action, method },
        ),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        setMessage({ tone: "danger", text: payload?.message ?? "No se pudo guardar. Intenta nuevamente." });
        return;
      }
      setMessage({
        tone: "success",
        text: action === "save" ? "Guardado. Laria lo revisará antes de mostrarlo." : "Ya no se muestra a los compradores.",
      });
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: "No se pudo guardar. Revisa tu conexión e intenta nuevamente." });
    } finally {
      setBusy(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send("save", event.currentTarget);
  }

  return (
    <section aria-labelledby={`${id}-titulo`} className="rounded-panel border border-subtle bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-titulo`} className="t-section text-ink">{PAYMENT_METHOD_LABELS[method]}</h2>
        {current ? <StatusTag domain="payment" status={current.status} /> : null}
      </div>
      <p className="mt-1 t-meta">{PAYMENT_METHOD_HINTS[method]}</p>
      {current?.review_reason && (current.status === "rejected" || current.status === "disabled") ? (
        <p className="mt-2 t-ui font-semibold text-danger">Motivo: {current.review_reason}</p>
      ) : null}

      {canEdit ? (
        <form onSubmit={submit} className="mt-4 grid gap-4">
          {needsHolder ? (
            <Field
              id={`${id}-titular`}
              label="Titular que recibe el pago"
              hint="Persona o empresa, como figura en tu cuenta. Solo lo ve Laria para compararlo con tu razón social."
            >
              <Input name="holderName" required maxLength={140} defaultValue={current?.holder_name ?? ""} autoComplete="organization" />
            </Field>
          ) : null}
          <Field id={`${id}-proveedor`} label="Nombre que verán los compradores" hint="Por ejemplo: Yape, Plin, Izipay o Niubiz." optional>
            <Input name="providerLabel" maxLength={60} defaultValue={current?.provider_label ?? ""} />
          </Field>
          <Field id={`${id}-nota`} label="Nota para Laria" hint="Sin números de teléfono, cuenta o tarjeta, enlaces ni correos." optional>
            <Textarea name="note" maxLength={280} defaultValue={current?.owner_note ?? ""} className="min-h-20" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" loading={busy === "save"} loadingLabel="Guardando">
              {active ? "Guardar cambios" : "Aceptar este medio"}
            </Button>
            {active ? (
              <Button type="button" variant="quiet" loading={busy === "withdraw"} loadingLabel="Guardando" onClick={() => void send("withdraw")}>
                Dejar de aceptarlo
              </Button>
            ) : null}
          </div>
        </form>
      ) : active ? (
        <div className="mt-4">
          <Button type="button" variant="quiet" loading={busy === "withdraw"} loadingLabel="Guardando" onClick={() => void send("withdraw")}>
            Dejar de aceptarlo
          </Button>
        </div>
      ) : null}

      {message ? (
        <Notice tone={message.tone} className="mt-3" role={message.tone === "danger" ? "alert" : "status"}>
          {message.text}
        </Notice>
      ) : null}
    </section>
  );
}
