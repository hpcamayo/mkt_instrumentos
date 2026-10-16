"use client";

import { type FormEvent, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input, Radio, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import { StatusTag } from "@/components/ui/tag";
import { Textarea } from "@/components/ui/textarea";
import {
  PAYMENT_METHOD_HINTS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PAYMENT_PROVIDER_OPTIONS,
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

// PAY-1 (design §11.1–11.2) in Pagos (review fix B6): the methods the store added, each with its review state, and
// "Agregar medio de pago" for the rest. Every save goes to Laria's review; only an approved method of a verified store
// is shown to buyers. No numbers, accounts or links are asked for or stored.

const STATUS_NOTES: Record<string, string> = {
  pending_review: "Laria lo está revisando. Los compradores todavía no lo ven.",
  approved: "Los compradores lo ven en tu tienda y en tus publicaciones con unidades disponibles.",
  rejected: "Laria no lo aprobó. Corrige los datos y envíalo otra vez.",
  disabled: "Laria lo desactivó. Si cambias los datos, vuelve a revisión.",
};

type Editing = { mode: "add" } | { mode: "edit"; method: PaymentMethod };

export function StorePaymentMethods({ methods, canEdit }: { methods: OwnerPaymentMethod[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState<PaymentMethod | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const messageRef = useRef<HTMLDivElement>(null);
  const added = PAYMENT_METHODS.flatMap((method) => {
    const row = methods.find((item) => item.method === method);
    return row && row.status !== "withdrawn" ? [row] : [];
  });
  const available = PAYMENT_METHODS.filter((method) => !added.some((row) => row.method === method));

  function show(next: { tone: "success" | "danger"; text: string }) {
    setMessage(next);
    requestAnimationFrame(() => messageRef.current?.focus());
  }

  async function withdraw(row: OwnerPaymentMethod) {
    const ok = await confirm({
      title: `¿Dejar de aceptar ${PAYMENT_METHOD_LABELS[row.method]}?`,
      body: "Los compradores dejan de verlo de inmediato. Si lo agregas otra vez, Laria lo revisa de nuevo.",
      confirmLabel: "Dejar de aceptarlo",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(row.method);
    const result = await savePaymentMethod({ action: "withdraw", method: row.method });
    setBusy(null);
    show(result.ok ? { tone: "success", text: `${PAYMENT_METHOD_LABELS[row.method]}: ya no se muestra a los compradores.` } : { tone: "danger", text: result.message });
    if (result.ok) router.refresh();
  }

  function closeSheet() {
    const current = editing;
    setEditing(null);
    requestAnimationFrame(() => {
      const target = current?.mode === "edit" ? document.querySelector<HTMLElement>(`[data-editar-medio="${current.method}"]`) : document.querySelector<HTMLElement>("[data-agregar-medio]");
      target?.focus();
    });
  }

  return (
    <section aria-labelledby="medios-titulo" className="grid gap-4 rounded-panel border border-subtle bg-white p-5 sm:p-6">
      {confirmDialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="medios-titulo" className="t-section text-ink">Medios de pago</h2>
          <p className="max-w-[60ch] t-body text-ink-2">Los que aceptas en tu tienda. Laria revisa cada uno antes de mostrarlo, y otra vez cada vez que lo cambias.</p>
        </div>
        {canEdit && available.length ? (
          <Button data-agregar-medio="" icon={<Plus aria-hidden />} onClick={() => { setMessage(null); setEditing({ mode: "add" }); }}>
            Agregar medio de pago
          </Button>
        ) : null}
      </div>

      {message ? (
        <div ref={messageRef} tabIndex={-1} className="outline-none" role={message.tone === "danger" ? "alert" : "status"}>
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      ) : null}

      {added.length ? (
        <ul className="grid gap-3">
          {added.map((row) => (
            <li key={row.method} className="grid gap-2 rounded-panel border border-subtle p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="t-body font-semibold text-ink">{PAYMENT_METHOD_LABELS[row.method]}</h3>
                <StatusTag domain="payment" status={row.status} />
              </div>
              <dl className="grid gap-1 t-ui text-ink-2 sm:grid-cols-[max-content_1fr] sm:gap-x-4">
                {row.provider_label ? <><dt className="font-semibold text-ink">Proveedor</dt><dd>{row.provider_label}</dd></> : null}
                {row.holder_name ? <><dt className="font-semibold text-ink">Titular</dt><dd className="break-words">{row.holder_name} <span className="t-meta">(solo lo ven tú y el equipo autorizado de Laria)</span></dd></> : null}
              </dl>
              {STATUS_NOTES[row.status] ? <p className="t-meta">{STATUS_NOTES[row.status]}</p> : null}
              {row.review_reason && (row.status === "rejected" || row.status === "disabled") ? (
                <p className="t-ui font-semibold text-danger">Motivo: {row.review_reason}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {canEdit ? (
                  <Button size="sm" variant="secondary" data-editar-medio={row.method} disabled={busy !== null}
                    onClick={() => { setMessage(null); setEditing({ mode: "edit", method: row.method }); }}
                    aria-label={`Editar ${PAYMENT_METHOD_LABELS[row.method]}`}>
                    Editar
                  </Button>
                ) : null}
                <Button size="sm" variant="quiet" loading={busy === row.method} loadingLabel="Guardando" disabled={busy !== null && busy !== row.method}
                  onClick={() => void withdraw(row)} aria-label={`Dejar de aceptar ${PAYMENT_METHOD_LABELS[row.method]}`}>
                  Dejar de aceptarlo
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-body text-ink-2">
          {canEdit ? "Todavía no agregaste medios de pago. Agrega los que aceptas para que tus publicaciones muestren «Solicitar compra»." : "Todavía no agregaste medios de pago."}
        </p>
      )}
      {canEdit && !available.length ? <p className="t-meta">Ya agregaste todos los medios disponibles.</p> : null}

      {editing ? (
        <PaymentMethodSheet
          editing={editing}
          available={available}
          current={editing.mode === "edit" ? added.find((row) => row.method === editing.method) ?? null : null}
          onClose={closeSheet}
          onSaved={(method, status) => {
            setEditing(null);
            // Saving the same values changes nothing in the database, so an approved method stays approved.
            show({ tone: "success", text: status === "approved"
              ? `${PAYMENT_METHOD_LABELS[method]}: no hubo cambios; sigue aprobado.`
              : `${PAYMENT_METHOD_LABELS[method]}: enviado a revisión. Laria lo revisa antes de mostrarlo.` });
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

async function savePaymentMethod(body: Record<string, unknown>): Promise<{ ok: true; status: string | null } | { ok: false; message: string }> {
  try {
    const response = await fetch("/api/store/payment-methods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) return { ok: false, message: payload?.message ?? "No se pudo guardar. Intenta nuevamente." };
    return { ok: true, status: typeof payload.method?.status === "string" ? payload.method.status : null };
  } catch {
    return { ok: false, message: "No se pudo guardar. Revisa tu conexión e intenta nuevamente." };
  }
}

// One sheet for both: choose a method (adding) or keep it (editing), then its details.
function PaymentMethodSheet({ editing, available, current, onClose, onSaved }: {
  editing: Editing;
  available: PaymentMethod[];
  current: OwnerPaymentMethod | null;
  onClose: () => void;
  onSaved: (method: PaymentMethod, status: string | null) => void;
}) {
  const id = useId();
  const formId = `${id}-medio`;
  const [method, setMethod] = useState<PaymentMethod | null>(editing.mode === "edit" ? editing.method : available.length === 1 ? available[0] : null);
  const [errors, setErrors] = useState<{ method?: string; holder?: string }>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const providers = method ? PAYMENT_PROVIDER_OPTIONS[method] : [];
  const needsHolder = method ? paymentMethodNeedsHolder(method) : false;
  const title = editing.mode === "edit" ? `Editar ${PAYMENT_METHOD_LABELS[editing.method]}` : "Agregar medio de pago";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const read = (key: string) => (data.get(key) as string | null)?.trim() || undefined;
    const found: { method?: string; holder?: string } = {};
    if (!method) found.method = "Elige el medio de pago.";
    if (method && needsHolder && !read("holderName")) found.holder = "Indica el titular que recibe el pago.";
    setErrors(found);
    setFailure("");
    if (found.method) {
      document.querySelector<HTMLInputElement>(`#${CSS.escape(formId)} input[name="method"]`)?.focus();
      return;
    }
    if (found.holder) {
      document.getElementById(`${id}-titular`)?.focus();
      return;
    }
    setBusy(true);
    const result = await savePaymentMethod({
      action: "save",
      method,
      holderName: needsHolder ? read("holderName") : undefined,
      providerLabel: providers.length ? read("providerLabel") : undefined,
      note: read("note"),
    });
    setBusy(false);
    if (!result.ok) {
      setFailure(result.message);
      return;
    }
    onSaved(method!, result.status);
  }

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
      <Button type="submit" form={formId} loading={busy} loadingLabel="Enviando…">Enviar a revisión</Button>
    </div>
  );

  return (
    <Sheet title={title} closeLabel="Cerrar sin guardar" onDismiss={() => { if (!busy) onClose(); }} layout="responsive" footer={footer}>
      <form id={formId} onSubmit={submit} className="grid gap-4 pt-4" noValidate>
        {editing.mode === "add" ? (
          <fieldset className="grid gap-0.5" aria-describedby={errors.method ? `${id}-metodo-error` : undefined}>
            <legend className="t-ui font-semibold text-ink">Medio de pago</legend>
            {errors.method ? <p id={`${id}-metodo-error`} className="t-ui font-semibold text-danger">{errors.method}</p> : null}
            {available.map((option) => (
              <Radio key={option} name="method" value={option} checked={method === option} onChange={() => setMethod(option)}
                label={PAYMENT_METHOD_LABELS[option]} description={PAYMENT_METHOD_HINTS[option]} />
            ))}
          </fieldset>
        ) : (
          <p className="t-body text-ink-2">{PAYMENT_METHOD_HINTS[editing.method]} Al guardar, vuelve a revisión de Laria{current?.status === "approved" ? " y deja de mostrarse hasta que lo aprueben" : ""}.</p>
        )}

        {method ? (
          <>
            {needsHolder ? (
              <Field
                id={`${id}-titular`}
                label="Titular que recibe el pago"
                hint="Persona o empresa, como figura en tu cuenta. Solo lo ven tú y el equipo autorizado de Laria, que lo compara con tu razón social."
                error={errors.holder}
              >
                <Input key={method} name="holderName" required maxLength={140} defaultValue={current?.holder_name ?? ""} autoComplete="organization" />
              </Field>
            ) : null}
            {providers.length ? (
              <Field id={`${id}-proveedor`} label="Proveedor que verán los compradores" optional>
                <Select key={method} name="providerLabel" defaultValue={current?.provider_label && providers.includes(current.provider_label) ? current.provider_label : ""}>
                  <option value="">Sin proveedor</option>
                  {providers.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
                </Select>
              </Field>
            ) : null}
            <Field id={`${id}-nota`} label="Nota para Laria" hint="Sin números de teléfono, cuenta o tarjeta, enlaces ni correos." optional>
              <Textarea key={method} name="note" maxLength={280} defaultValue={current?.owner_note ?? ""} className="min-h-20" />
            </Field>
          </>
        ) : null}

        {failure ? <Notice tone="danger" role="alert">{failure}</Notice> : null}
      </form>
    </Sheet>
  );
}
