"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { useSellingRpc } from "@/components/offers/use-selling-rpc";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PriceInput } from "@/components/ui/price-input";
import { Tag } from "@/components/ui/tag";
import { formatPrice, parseWholeSolPrice } from "@/lib/price";
import { formatLimaDateTime, priceStepSchedule, priceStepsStatusLabel, priceStepsSummary, type PriceStepsRule } from "@/lib/selling-tools";

// sell-04 "Bajada automática": a floor and a pace. Each step is an ordinary price change, so people who saved the
// listing hear about it through the usual price-drop alert; nothing here invents urgency for buyers.
export function PriceStepsPanel({ listingId, price, rule, unavailableReason }: {
  listingId: string;
  price: number | null;
  rule: PriceStepsRule | null;
  unavailableReason: string | null;
}) {
  const router = useRouter();
  const { run, busy, error } = useSellingRpc();
  const [editing, setEditing] = useState(!rule || rule.status === "finished");
  const [floor, setFloor] = useState(rule && rule.status !== "finished" ? String(rule.floor_pen) : price ? String(Math.round(price * 0.85)) : "");
  const [percent, setPercent] = useState(String(rule?.step_percent ?? 5));
  const [days, setDays] = useState(String(rule?.interval_days ?? 7));
  const [onlyQuiet, setOnlyQuiet] = useState(rule?.only_without_contacts ?? true);
  const [floorError, setFloorError] = useState("");
  const floorValue = parseWholeSolPrice(floor);
  const schedule = useMemo(() => (price && floorValue && floorValue < price ? priceStepSchedule(price, floorValue, Number(percent), 8) : []), [price, floorValue, percent]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!floorValue || !price || floorValue >= price) return setFloorError("El precio mínimo debe ser menor que el precio actual.");
    setFloorError("");
    const saved = await run("set_listing_price_steps", {
      p_listing_id: listingId, p_floor_pen: floorValue, p_step_percent: Number(percent), p_interval_days: Number(days), p_only_without_contacts: onlyQuiet,
    }, "No pudimos guardar la bajada automática. Inténtalo de nuevo.");
    if (saved) {
      setEditing(false);
      router.refresh();
    }
  }

  async function pause(paused: boolean) {
    if (await run("pause_listing_price_steps", { p_listing_id: listingId, p_paused: paused }, "No pudimos guardar el cambio. Inténtalo de nuevo.")) router.refresh();
  }

  async function remove() {
    if (await run("delete_listing_price_steps", { p_listing_id: listingId }, "No pudimos quitar la bajada automática. Inténtalo de nuevo.") !== null) {
      setEditing(true);
      router.refresh();
    }
  }

  return (
    <section aria-labelledby="bajada-automatica" className="grid gap-3 rounded-panel border border-subtle bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="bajada-automatica" className="t-section text-ink">Bajada automática</h2>
        {rule ? <Tag tone={rule.status === "active" ? "accent" : "neutral"}>{priceStepsStatusLabel(rule)}</Tag> : null}
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {unavailableReason ? <p className="t-ui text-ink-2">{unavailableReason}</p> : rule && !editing ? (
        <>
          <p className="t-body text-ink">{priceStepsSummary(rule)}.</p>
          <p className="t-meta">
            {rule.status === "active" ? `Próxima revisión: ${formatLimaDateTime(rule.next_step_at)}. ` : ""}
            Empezó en {formatPrice(rule.start_price_pen)} · {rule.steps_taken === 1 ? "1 bajada" : `${rule.steps_taken} bajadas`} hasta ahora.
          </p>
          <div className="flex flex-wrap gap-2">
            {rule.status === "active" ? <Button variant="secondary" onClick={() => pause(true)} loading={busy === "pause_listing_price_steps"} loadingLabel="Guardando">Pausar</Button> : null}
            {rule.status === "paused" ? <Button variant="secondary" onClick={() => pause(false)} loading={busy === "pause_listing_price_steps"} loadingLabel="Guardando">Reanudar</Button> : null}
            <Button variant="quiet" onClick={() => setEditing(true)}>Cambiar</Button>
            <Button variant="quiet" onClick={remove} loading={busy === "delete_listing_price_steps"} loadingLabel="Quitando">Quitar</Button>
          </div>
        </>
      ) : (
        <form onSubmit={save} className="grid gap-3">
          <p className="t-ui text-ink-2">
            Baja el precio poco a poco hasta el mínimo que elijas, y se detiene sola al llegar, al venderse o si la pausas. Quienes la guardaron reciben el aviso de baja de precio de siempre.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="bajada-minimo" label="Precio mínimo" error={floorError}>
              <PriceInput value={floor} onValueChange={setFloor} />
            </Field>
            <Field id="bajada-porcentaje" label="Cuánto baja">
              <Select value={percent} onChange={(event) => setPercent(event.target.value)}>
                <option value="5">5% cada vez</option>
                <option value="10">10% cada vez</option>
              </Select>
            </Field>
            <Field id="bajada-cada" label="Cada">
              <Select value={days} onChange={(event) => setDays(event.target.value)}>
                <option value="7">7 días</option>
                <option value="14">14 días</option>
              </Select>
            </Field>
          </div>
          <Checkbox checked={onlyQuiet} onChange={(event) => setOnlyQuiet(event.target.checked)} label="Solo si nadie me escribió desde la última revisión" />
          {schedule.length ? (
            <p className="t-meta">Así iría: {[price, ...schedule].map((value) => formatPrice(value ?? 0)).join(" → ")}{schedule.length === 8 ? " …" : ""}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" loading={busy === "set_listing_price_steps"} loadingLabel="Guardando">{rule && rule.status !== "finished" ? "Guardar cambios" : "Activar bajada automática"}</Button>
            {rule && rule.status !== "finished" ? <Button variant="quiet" onClick={() => setEditing(false)}>Cancelar</Button> : null}
          </div>
        </form>
      )}
    </section>
  );
}
