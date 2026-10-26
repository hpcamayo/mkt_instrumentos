"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PageNotice } from "@/components/page-notice";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { formatPhoneForDisplay } from "@/lib/phone";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { dayLabel, limaParts, limaToday, timeLabel } from "@/lib/store-floor/dates";
import {
  REASON_MAX, buyerWhatsAppHref, isOpen, storePlace, storeWhatsAppHref, tryoutCalendarHref, tryoutErrorMessage,
  tryoutStatusLabel, type Tryout,
} from "@/lib/store-floor/tryouts";
import { cn } from "@/lib/utils";

// buy-07: the store's agenda (confirm in one tap, decline or cancel with an optional reason, WhatsApp the buyer with
// the details) and the buyer's list (cancel, WhatsApp the store, add to the calendar).

type Action = { tryout: Tryout; kind: "decline" | "cancel" | "buyer_cancel" } | null;

function client() {
  return getSupabaseBrowserClient() as unknown as SupabaseClient | null;
}

function statusTone(tryout: Tryout): "accent" | "warning" | "neutral" | "line" {
  if (tryout.status === "confirmed") return "accent";
  if (tryout.status === "requested") return "warning";
  return "line";
}

function useTryoutAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  async function run(id: string, call: (supabase: SupabaseClient) => PromiseLike<{ error: { message: string } | null }>, done: string) {
    const supabase = client();
    if (!supabase) return setFeedback({ kind: "error", message: "No pudimos conectar. Intenta nuevamente." }), false;
    setBusy(id);
    setFeedback(null);
    const { error } = await call(supabase);
    setBusy(null);
    if (error) {
      setFeedback({ kind: "error", message: tryoutErrorMessage(error.message) });
      return false;
    }
    setFeedback({ kind: "success", message: done });
    router.refresh();
    return true;
  }
  return { busy, feedback, run };
}

// Days in order with their try-outs: "Hoy", "Mañana", "sábado 14 de diciembre".
function byDay(tryouts: Tryout[]) {
  const today = limaToday();
  const groups: { date: string; label: string; tryouts: Tryout[] }[] = [];
  for (const tryout of tryouts) {
    const { date } = limaParts(tryout.starts_at);
    let group = groups.find((entry) => entry.date === date);
    if (!group) {
      group = { date, label: dayLabel(date, today), tryouts: [] };
      groups.push(group);
    }
    group.tryouts.push(tryout);
  }
  return groups;
}

export function StoreTryoutAgenda({ requested, upcoming, past }: { requested: Tryout[]; upcoming: Tryout[]; past: Tryout[] }) {
  const { busy, feedback, run } = useTryoutAction();
  const [action, setAction] = useState<Action>(null);

  function confirm(tryout: Tryout) {
    void run(tryout.id, (supabase) => supabase.rpc("respond_store_tryout", { p_tryout_id: tryout.id, p_action: "confirm" }),
      `Confirmada. Le avisamos a ${tryout.buyer_name}; puedes escribirle por WhatsApp con los detalles.`);
  }

  return (
    <div className="grid gap-6">
      {feedback ? <PageNotice kind={feedback.kind} message={feedback.message} /> : null}
      <section aria-labelledby="por-confirmar" className="grid gap-3">
        <h2 id="por-confirmar" className="t-section text-ink">Por confirmar{requested.length ? ` (${requested.length})` : ""}</h2>
        {requested.length ? (
          <ul className="grid gap-3">
            {requested.map((tryout) => (
              <StoreTryoutCard key={tryout.id} tryout={tryout} showDay>
                <Button size="sm" loading={busy === tryout.id} loadingLabel="Confirmando…" onClick={() => confirm(tryout)}>Confirmar</Button>
                <Button size="sm" variant="secondary" disabled={busy === tryout.id} onClick={() => setAction({ tryout, kind: "decline" })}>No puedo</Button>
              </StoreTryoutCard>
            ))}
          </ul>
        ) : (
          <p className="t-ui text-ink-2">No tienes solicitudes pendientes.</p>
        )}
      </section>

      <section aria-labelledby="proximas" className="grid gap-3">
        <h2 id="proximas" className="t-section text-ink">Próximas pruebas</h2>
        {upcoming.length ? byDay(upcoming).map((group) => (
          <div key={group.date} className="grid gap-2">
            <h3 className="t-ui font-semibold text-ink first-letter:uppercase">{group.label}</h3>
            <ul className="grid gap-3">
              {group.tryouts.map((tryout) => (
                <StoreTryoutCard key={tryout.id} tryout={tryout}>
                  <Button size="sm" variant="secondary" disabled={busy === tryout.id} onClick={() => setAction({ tryout, kind: "cancel" })}>Cancelar</Button>
                </StoreTryoutCard>
              ))}
            </ul>
          </div>
        )) : <p className="t-ui text-ink-2">No hay pruebas confirmadas por ahora.</p>}
      </section>

      {past.length ? (
        <details className="group rounded-panel border border-subtle bg-white">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 t-ui font-semibold text-ink">Anteriores ({past.length})</summary>
          <ul className="grid gap-3 border-t border-subtle p-4">
            {past.map((tryout) => <StoreTryoutCard key={tryout.id} tryout={tryout} showDay compact />)}
          </ul>
        </details>
      ) : null}

      {action ? (
        <ReasonSheet
          title={action.kind === "decline" ? "No puedes en ese horario" : "Cancelar la prueba"}
          intro={action.kind === "decline"
            ? `Le avisamos a ${action.tryout.buyer_name} que no puedes el ${dayLabel(limaParts(action.tryout.starts_at).date, limaToday(), false)} a las ${timeLabel(action.tryout.starts_at)}. Puede pedir otro horario.`
            : `Le avisamos a ${action.tryout.buyer_name} que cancelaste. Si puedes, propón otro horario por WhatsApp.`}
          submitLabel={action.kind === "decline" ? "Avisar que no puedo" : "Cancelar la prueba"}
          busy={busy === action.tryout.id}
          onClose={() => setAction(null)}
          onSubmit={async (reason) => {
            const ok = await run(action.tryout.id, (supabase) => supabase.rpc("respond_store_tryout", { p_tryout_id: action.tryout.id, p_action: action.kind === "decline" ? "decline" : "cancel", p_reason: reason }),
              action.kind === "decline" ? "Listo. Le avisamos al cliente." : "Prueba cancelada. Le avisamos al cliente.");
            if (ok) setAction(null);
          }}
        />
      ) : null}
    </div>
  );
}

function StoreTryoutCard({ tryout, showDay = false, compact = false, children }: { tryout: Tryout; showDay?: boolean; compact?: boolean; children?: React.ReactNode }) {
  const { date } = limaParts(tryout.starts_at);
  const open = isOpen(tryout);
  return (
    <li className={cn("grid gap-2 rounded-panel border border-subtle bg-white p-4", compact && "p-3")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="t-ui font-semibold text-ink">
          <span className={showDay ? "first-letter:uppercase inline-block" : undefined}>{showDay ? `${dayLabel(date)}, ` : ""}{timeLabel(tryout.starts_at)}</span>
          {" · "}{tryout.buyer_name}
        </p>
        <Tag tone={statusTone(tryout)}>{tryoutStatusLabel(tryout, "store")}</Tag>
      </div>
      <p className="t-ui text-ink">
        {tryout.listing_slug ? <Link href={`/instrumentos/${tryout.listing_slug}`} className="link">{tryout.listing_title}</Link> : tryout.listing_title}
      </p>
      {tryout.buyer_note ? <p className="t-ui text-ink-2">“{tryout.buyer_note}”</p> : null}
      {tryout.store_reason ? <p className="t-meta">Motivo: {tryout.store_reason}</p> : null}
      {!compact ? (
        <div className="flex flex-wrap items-center gap-2">
          {children}
          {open ? (
            <a href={storeWhatsAppHref(tryout)} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "quiet", size: "sm" })}>
              <MessageCircle aria-hidden />WhatsApp {formatPhoneForDisplay(tryout.buyer_phone)}
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function ReasonSheet({ title, intro, submitLabel, busy, onClose, onSubmit }: { title: string; intro: string; submitLabel: string; busy: boolean; onClose: () => void; onSubmit: (reason: string | null) => void }) {
  const formId = "prueba-motivo";
  return (
    <Sheet
      title={title}
      closeLabel="Cerrar sin cambiar"
      onDismiss={onClose}
      layout="responsive"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Volver</Button>
          <Button type="submit" form={formId} loading={busy} loadingLabel="Guardando…">{submitLabel}</Button>
        </div>
      }
    >
      <form
        id={formId}
        className="grid gap-4 pt-4"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
          onSubmit(reason || null);
        }}
      >
        <p className="t-ui text-ink">{intro}</p>
        <Field id={`${formId}-texto`} label="Motivo" optional hint="Lo ve quien pidió la prueba.">
          <Input name="reason" maxLength={REASON_MAX} />
        </Field>
      </form>
    </Sheet>
  );
}

// The buyer's try-outs (Mi cuenta > Pruebas).
export function BuyerTryoutList({ upcoming, past, siteUrl }: { upcoming: Tryout[]; past: Tryout[]; siteUrl: string }) {
  const { busy, feedback, run } = useTryoutAction();
  const [cancelling, setCancelling] = useState<Tryout | null>(null);
  return (
    <div className="grid gap-6">
      {feedback ? <PageNotice kind={feedback.kind} message={feedback.message} /> : null}
      {upcoming.length ? (
        <ul className="grid gap-3">
          {upcoming.map((tryout) => {
            const whatsapp = buyerWhatsAppHref(tryout);
            const place = storePlace(tryout.store);
            return (
              <li key={tryout.id} className="grid gap-2 rounded-panel border border-subtle bg-white p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="t-ui font-semibold text-ink first-letter:uppercase">{dayLabel(limaParts(tryout.starts_at).date)}, {timeLabel(tryout.starts_at)}</p>
                  <Tag tone={statusTone(tryout)}>{tryoutStatusLabel(tryout, "buyer")}</Tag>
                </div>
                <p className="t-ui text-ink">
                  {tryout.listing_slug ? <Link href={`/instrumentos/${tryout.listing_slug}`} className="link">{tryout.listing_title}</Link> : tryout.listing_title}
                  {" en "}{tryout.store ? <Link href={`/tiendas/${tryout.store.slug}`} className="link">{tryout.store.name}</Link> : "la tienda"}
                </p>
                {place ? <p className="t-meta">{place}</p> : null}
                {tryout.status === "requested" ? <p className="t-meta">Esperando que la tienda confirme. Te avisamos.</p> : null}
                <div className="flex flex-wrap items-center gap-2">
                  {tryout.status === "confirmed" ? (
                    <a href={tryoutCalendarHref(tryout, siteUrl)} download="prueba-laria.ics" className={buttonClasses({ variant: "secondary", size: "sm" })}>Agregar al calendario</a>
                  ) : null}
                  {whatsapp ? (
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "quiet", size: "sm" })}>
                      <MessageCircle aria-hidden />Coordinar por WhatsApp
                    </a>
                  ) : null}
                  <Button size="sm" variant="quiet" disabled={busy === tryout.id} onClick={() => setCancelling(tryout)}>Cancelar</Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {past.length ? (
        <section aria-labelledby="pruebas-anteriores" className="grid gap-3">
          <h2 id="pruebas-anteriores" className="t-section text-ink">Anteriores</h2>
          <ul className="divide-y divide-subtle rounded-panel border border-subtle bg-white">
            {past.map((tryout) => (
              <li key={tryout.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                <span className="min-w-0 t-ui text-ink">
                  <span className="first-letter:uppercase inline-block">{dayLabel(limaParts(tryout.starts_at).date, limaToday(), false)}</span> · {tryout.listing_title}
                  {tryout.store_reason ? <span className="block t-meta">Motivo de la tienda: {tryout.store_reason}</span> : null}
                </span>
                <Tag tone={statusTone(tryout)}>{tryoutStatusLabel(tryout, "buyer")}</Tag>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {cancelling ? (
        <Sheet
          title="Cancelar la prueba"
          closeLabel="Cerrar sin cancelar"
          onDismiss={() => setCancelling(null)}
          layout="responsive"
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setCancelling(null)}>Volver</Button>
              <Button
                variant="danger"
                loading={busy === cancelling.id}
                loadingLabel="Cancelando…"
                onClick={async () => {
                  const ok = await run(cancelling.id, (supabase) => supabase.rpc("cancel_my_tryout", { p_tryout_id: cancelling.id }), "Prueba cancelada. Le avisamos a la tienda.");
                  if (ok) setCancelling(null);
                }}
              >
                Cancelar la prueba
              </Button>
            </div>
          }
        >
          <p className="pt-4 t-ui text-ink">Le avisamos a {cancelling.store?.name ?? "la tienda"} que no vas el {dayLabel(limaParts(cancelling.starts_at).date, limaToday(), false)} a las {timeLabel(cancelling.starts_at)}.</p>
        </Sheet>
      ) : null}
    </div>
  );
}
