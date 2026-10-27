"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// safe-02 (feature ideas, accounts batch): the serial numbers of a SKU's units, one per line, private to the store.
// Laria compares them with stolen-gear reports; the SKU's listing never shows them.
export function InventorySerials({ itemId, canWrite }: { itemId: string; canWrite: boolean }) {
  const fieldId = useId();
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let active = true;
    void supabase.rpc("get_inventory_item_serials", { p_item_id: itemId }).then(({ data }) => {
      if (!active || !Array.isArray(data)) return;
      const text = data.join("\n");
      setValue(text);
      setSaved(text);
    });
    return () => {
      active = false;
    };
  }, [itemId]);

  async function save() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const serials = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (serials.length > 200) return setMessage({ error: true, text: "Hasta 200 números por SKU." });
    if (serials.some((serial) => serial.replace(/[^0-9A-Za-z]/g, "").length < 4 || serial.length > 60)) {
      return setMessage({ error: true, text: "Cada línea debe tener un número de serie completo (entre 4 y 60 caracteres)." });
    }
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.rpc("set_inventory_item_serials", { p_item_id: itemId, p_serials: serials });
    setBusy(false);
    if (error) return setMessage({ error: true, text: "No pudimos guardar los números de serie. Vuelve a intentarlo." });
    setSaved(value);
    setMessage({ error: false, text: `${data ?? serials.length} ${Number(data ?? serials.length) === 1 ? "número guardado" : "números guardados"}.` });
  }

  return (
    <div className="grid gap-2 border-t border-subtle pt-4">
      <Field id={fieldId} label="Números de serie" optional hint="Uno por línea, uno por unidad. Privados: no aparecen en la publicación. Laria los compara con reportes de equipos robados." error={message?.error ? message.text : undefined}>
        <Textarea value={value} onChange={(event) => setValue(event.target.value)} rows={3} disabled={!canWrite} />
      </Field>
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => void save()} loading={busy} loadingLabel="Guardando…" disabled={value === saved}>Guardar números de serie</Button>
          {message && !message.error ? <p role="status" className="t-meta">{message.text}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
