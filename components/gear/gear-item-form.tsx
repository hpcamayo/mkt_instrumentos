"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSellingRpc } from "@/components/offers/use-selling-rpc";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { categoryOptions } from "@/lib/listings";
import { gearTypeOptions, todayInLima, type GearItem } from "@/lib/selling-tools";

type Values = {
  category: string;
  instrument_type: string;
  brand: string;
  model: string;
  serial: string;
  purchased_on: string;
  warranty_until: string;
  note: string;
};

// sell-01: add or edit one item of Mi equipo. Brand and category are enough; the rest helps later (the serial if it is
// ever stolen, the purchase date and the warranty end).
export function GearItemForm({ item }: { item?: GearItem }) {
  const router = useRouter();
  const { run, busy, error } = useSellingRpc();
  const [values, setValues] = useState<Values>({
    category: item?.category ?? "",
    instrument_type: item?.instrument_type ?? "",
    brand: item?.brand ?? "",
    model: item?.model ?? "",
    serial: item?.serial ?? "",
    purchased_on: item?.purchased_on ?? "",
    warranty_until: item?.warranty_until ?? "",
    note: item?.note ?? "",
  });
  const [missing, setMissing] = useState<{ category?: string; brand?: string }>({});
  const [saved, setSaved] = useState(false);
  const types = values.category ? gearTypeOptions(values.category) : [];
  const today = todayInLima();

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => ({ ...current, [key]: value, ...(key === "category" ? { instrument_type: "" } : {}) }));
    setSaved(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problems = {
      category: values.category ? undefined : "Elige una categoría.",
      brand: values.brand.trim() ? undefined : "Escribe la marca.",
    };
    setMissing(problems);
    if (problems.category || problems.brand) return;
    const id = await run<string>("save_gear_item", {
      p_id: item?.id ?? null,
      p_fields: { ...values, instrument_type: values.instrument_type || "other" },
    }, "No pudimos guardar el equipo. Inténtalo de nuevo.");
    if (!id) return;
    if (item) {
      setSaved(true);
      router.refresh();
    } else {
      router.push(`/mi-cuenta/equipo/${id}`);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {saved ? <Notice tone="success">Cambios guardados.</Notice> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field id="equipo-categoria" label="Categoría" error={missing.category}>
          <Select value={values.category} onChange={(event) => set("category", event.target.value)}>
            <option value="">Elige una categoría</option>
            {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </Field>
        <Field id="equipo-tipo" label="Tipo" optional>
          <Select value={values.instrument_type} onChange={(event) => set("instrument_type", event.target.value)} disabled={!values.category}>
            <option value="">{values.category ? "Elige el tipo" : "Primero la categoría"}</option>
            {types.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </Field>
        <Field id="equipo-marca" label="Marca" error={missing.brand}>
          <Input value={values.brand} maxLength={80} autoComplete="off" onChange={(event) => set("brand", event.target.value)} />
        </Field>
        <Field id="equipo-modelo" label="Modelo" optional>
          <Input value={values.model} maxLength={120} autoComplete="off" onChange={(event) => set("model", event.target.value)} />
        </Field>
        <Field id="equipo-serie" label="Número de serie" optional hint="Solo lo ves tú. Sirve si alguna vez necesitas reportarlo como robado.">
          <Input value={values.serial} maxLength={64} autoComplete="off" spellCheck={false} onChange={(event) => set("serial", event.target.value)} />
        </Field>
        <Field id="equipo-compra" label="Fecha de compra" optional>
          <Input type="date" value={values.purchased_on} max={today} onChange={(event) => set("purchased_on", event.target.value)} />
        </Field>
        <Field id="equipo-garantia" label="Garantía hasta" optional hint="La fecha en que termina la garantía de la tienda o la marca.">
          <Input type="date" value={values.warranty_until} min={values.purchased_on || undefined} onChange={(event) => set("warranty_until", event.target.value)} />
        </Field>
      </div>
      <Field id="equipo-nota" label="Nota" optional hint="Accesorios, cambios que le hiciste, dónde lo compraste.">
        <Textarea value={values.note} maxLength={500} onChange={(event) => set("note", event.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={item ? "secondary" : "primary"} loading={busy === "save_gear_item"} loadingLabel="Guardando">
          {item ? "Guardar cambios" : "Agregar a Mi equipo"}
        </Button>
        {item ? null : <Button href="/mi-cuenta/equipo" variant="quiet">Cancelar</Button>}
      </div>
    </form>
  );
}
