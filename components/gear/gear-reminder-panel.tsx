"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSellingRpc } from "@/components/offers/use-selling-rpc";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { REMINDER_LABELS, formatCalendarDate, reminderKind, todayInLima, type GearItem, type GearReminder } from "@/lib/selling-tools";

// buy-06 "¿Toca cambiar cuerdas?": off until the person turns it on, one per item, stopped with one tap. The reminder
// names nearby stores that said they stock it, never a paid placement.
export function GearReminderPanel({ item, reminder }: { item: GearItem; reminder: GearReminder | null }) {
  const router = useRouter();
  const { run, busy, error } = useSellingRpc();
  const kind = reminderKind(item.instrument_type);
  const today = todayInLima();
  const [editing, setEditing] = useState(false);
  const [months, setMonths] = useState(String(reminder?.every_months ?? (kind ? REMINDER_LABELS[kind].defaultMonths : 3)));
  const [lastChanged, setLastChanged] = useState(reminder?.last_changed_on ?? today);
  const [message, setMessage] = useState("");
  if (!kind) return null;
  const label = REMINDER_LABELS[kind];

  async function save(event: FormEvent) {
    event.preventDefault();
    const due = await run<string>("set_gear_reminder", { p_gear_id: item.id, p_every_months: Number(months), p_last_changed_on: lastChanged },
      "No pudimos guardar el recordatorio. Inténtalo de nuevo.");
    if (!due) return;
    setEditing(false);
    setMessage(`Listo. Te avisamos el ${formatCalendarDate(due)}.`);
    router.refresh();
  }

  async function done() {
    const due = await run<string>("mark_gear_reminder_done", { p_gear_id: item.id }, "No pudimos guardar el cambio. Inténtalo de nuevo.");
    if (!due) return;
    setMessage(`Anotado. El próximo aviso es el ${formatCalendarDate(due)}.`);
    router.refresh();
  }

  async function stop() {
    const stopped = await run<boolean>("stop_gear_reminder", { p_gear_id: item.id }, "No pudimos detener el recordatorio. Inténtalo de nuevo.");
    if (stopped === null) return;
    setMessage("Recordatorio detenido. No te avisaremos más por este equipo.");
    router.refresh();
  }

  return (
    <section aria-labelledby="recordatorio" className="grid gap-3 rounded-panel border border-subtle bg-surface p-5">
      <h2 id="recordatorio" className="t-section text-ink">¿Toca cambiar {label.the}?</h2>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {reminder && !editing ? (
        <>
          <p className="t-body text-ink">
            Te avisamos el <strong>{formatCalendarDate(reminder.next_due_on)}</strong>, cada {reminder.every_months} {reminder.every_months === 1 ? "mes" : "meses"}, con tiendas cercanas que {label.them} tienen.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={done} loading={busy === "mark_gear_reminder_done"} loadingLabel="Guardando">
              Ya {label.them} cambié hoy
            </Button>
            <Button variant="quiet" onClick={() => setEditing(true)}>Cambiar frecuencia</Button>
            <Button variant="quiet" onClick={stop} loading={busy === "stop_gear_reminder"} loadingLabel="Deteniendo">Dejar de recordar</Button>
          </div>
        </>
      ) : (
        <form onSubmit={save} className="grid gap-3">
          {reminder ? null : (
            <p className="t-body text-ink-2">
              Un aviso en Laria y por correo cuando toque cambiar {label.the}. Está apagado hasta que lo actives y lo detienes con un toque.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`recordatorio-cada-${item.id}`} label="Avisarme cada">
              <Select value={months} onChange={(event) => setMonths(event.target.value)}>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>{value === 1 ? "1 mes" : `${value} meses`}</option>
                ))}
              </Select>
            </Field>
            <Field id={`recordatorio-ultimo-${item.id}`} label="Último cambio">
              <Input type="date" value={lastChanged} max={today} onChange={(event) => setLastChanged(event.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" loading={busy === "set_gear_reminder"} loadingLabel="Guardando">
              {reminder ? "Guardar" : "Activar recordatorio"}
            </Button>
            {reminder ? <Button variant="quiet" onClick={() => setEditing(false)}>Cancelar</Button> : null}
          </div>
        </form>
      )}
    </section>
  );
}
