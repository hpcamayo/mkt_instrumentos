"use client";

import { Field, Select } from "@/components/ui/field";

// run-04: the store listing's "Aceptamos tu equipo como parte de pago" choice as a plain controlled field, for the sell
// and edit forms. The form sends it as details.part_payment (true, false or null: follow the store's default), which
// lib/listing-details.ts checks and laria_private.write_listing_part_payment stores.
export function PartPaymentField({ id = "parte-de-pago", value, storeDefault, onChange, hint, disabled = false }: {
  id?: string;
  value: boolean | null;
  storeDefault: boolean;
  onChange: (value: boolean | null) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <Field id={id} label="Aceptamos tu equipo como parte de pago" hint={hint ?? "El comprador te envía fotos de lo que dejaría y tú respondes con un estimado."}>
      <Select
        value={value === null ? "store" : value ? "yes" : "no"}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value === "store" ? null : event.target.value === "yes")}
      >
        <option value="store">Como mi tienda ({storeDefault ? "sí" : "no"})</option>
        <option value="yes">Sí, en esta publicación</option>
        <option value="no">No, en esta publicación</option>
      </Select>
    </Field>
  );
}
