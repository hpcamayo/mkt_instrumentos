"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { inventoryAction, parseWholeNumber } from "@/lib/inventory-client";
import type { InventoryPreferences } from "@/lib/store-inventory";

// Effortless Laria, inventory batch, stock-06: the store's default low-stock threshold (new SKU start with it, and it
// can fill the SKU that have none) and the optional daily summary in Notificaciones. Both are off until the owner
// turns them on.
export function InventorySettingsButton({ preferences }: { preferences: InventoryPreferences | null }) {
  const router = useRouter();
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const formId = "ajustes-inventario";

  function close() {
    setOpen(false);
    setError("");
    opener.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = String(form.get("threshold") ?? "").trim();
    const threshold = raw === "" ? null : parseWholeNumber(raw);
    if (raw !== "" && (threshold === null || threshold < 0 || threshold > 100000)) return setError("Ingresa un número entero entre 0 y 100 000, o déjalo vacío.");
    setBusy(true);
    const result = await inventoryAction<{ applied?: number }>({
      action: "preferences",
      fields: { default_low_stock_threshold: threshold, daily_stock_summary: form.get("summary") === "on" },
      apply_to_unset: threshold !== null && form.get("apply") === "on",
    });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    const applied = result.data?.applied ?? 0;
    setSaved(applied ? `Ajustes guardados. Aviso agregado a ${applied} SKU.` : "Ajustes guardados.");
    close();
    router.refresh();
  }

  return (
    <>
      <button ref={opener} type="button" className="link font-semibold" aria-haspopup="dialog" onClick={() => { setSaved(""); setOpen(true); }}>Ajustes de stock</button>
      <span className="t-meta" role="status">{saved}</span>
      {open ? (
        <Sheet
          title="Ajustes de stock"
          closeLabel="Cerrar sin guardar"
          onDismiss={close}
          layout="responsive"
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={close}>Cancelar</Button>
              <Button type="submit" form={formId} loading={busy} loadingLabel="Guardando…">Guardar ajustes</Button>
            </div>
          }
        >
          <form id={formId} className="grid gap-4 pt-4" onSubmit={submit} noValidate>
            <Field id={`${formId}-umbral`} label="Aviso de stock bajo por defecto" optional hint="Los SKU nuevos empiezan con este aviso. Vacío: sin aviso." error={error}>
              <Input name="threshold" defaultValue={preferences?.default_low_stock_threshold ?? ""} inputMode="numeric" pattern="[0-9]*" autoComplete="off" />
            </Field>
            <Checkbox name="apply" label="Usarlo también en los SKU que hoy no tienen aviso" description="Los SKU con un aviso propio no cambian." />
            <Checkbox
              name="summary"
              defaultChecked={preferences?.daily_stock_summary ?? false}
              label="Resumen diario en Notificaciones"
              description="A las 8 p. m., solo los días con algo que contar: “Stock bajo: 6 · Agotados hoy: 2”. No se envía por correo."
            />
          </form>
        </Sheet>
      ) : null}
    </>
  );
}
