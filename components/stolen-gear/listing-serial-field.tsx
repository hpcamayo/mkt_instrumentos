"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// safe-02 (feature ideas, accounts batch): a listing's private serial number, optional. Saved on its own (it is not part
// of the listing's form or its review), never shown on a public page, and compared with stolen-gear reports. By listing
// id (edit form) or by slug (the "published" screen right after the sell form).
export function ListingSerialField({ listingId, listingSlug }: { listingId?: string; listingSlug?: string }) {
  const fieldId = useId();
  const [id, setId] = useState<string | null>(listingId ?? null);
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let active = true;
    (async () => {
      let resolved = listingId ?? null;
      if (!resolved && listingSlug) {
        const { data } = await supabase.from("listings").select("id").eq("slug", listingSlug).maybeSingle();
        resolved = data?.id ?? null;
      }
      if (!active || !resolved) return;
      setId(resolved);
      const { data } = await supabase.rpc("get_listing_serial", { p_listing_id: resolved });
      if (active && typeof data === "string") {
        setValue(data);
        setSaved(data);
      }
    })();
    return () => {
      active = false;
    };
  }, [listingId, listingSlug]);

  async function save() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !id) return;
    const serial = value.trim();
    if (serial && serial.replace(/[^0-9A-Za-z]/g, "").length < 4) return setMessage({ error: true, text: "Escribe el número completo (al menos 4 letras o números)." });
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc("set_listing_serial", { p_listing_id: id, p_serial: serial || null });
    setBusy(false);
    if (error) return setMessage({ error: true, text: "No pudimos guardar el número de serie. Vuelve a intentarlo." });
    setSaved(serial);
    setMessage({ error: false, text: serial ? "Número de serie guardado. Solo tú lo ves." : "Número de serie quitado." });
  }

  if (!id) return null;
  return (
    <div className="grid gap-2">
      <Field
        id={fieldId}
        label="Número de serie"
        optional
        hint="Privado: no aparece en la publicación. Laria lo compara con reportes de equipos robados para cuidar a quien compra."
        error={message?.error ? message.text : undefined}
      >
        <Input value={value} onChange={(event) => setValue(event.target.value)} maxLength={60} autoComplete="off" autoCapitalize="characters" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => void save()} loading={busy} loadingLabel="Guardando…" disabled={value.trim() === saved}>
          Guardar número de serie
        </Button>
        {message && !message.error ? <p role="status" className="t-meta">{message.text}</p> : null}
      </div>
    </div>
  );
}
