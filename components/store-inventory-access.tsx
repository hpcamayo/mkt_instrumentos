"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import type { StoreAdminRequest } from "@/lib/store-allowance";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type Rpc = { rpc: (fn: string, args: object) => Promise<{ data: unknown; error: { message?: string } | null }> };

const dateFormat = new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeZone: "America/Lima" });

// stock-21 (Effortless Laria, stores): Admin turns inventory on store by store; a store without it can raise its hand
// here instead of finding a closed door. The request only reaches Admin; nothing changes until Admin turns it on.
export function StoreInventoryAccess({ openRequest }: { openRequest: StoreAdminRequest | null }) {
  const supabase = useMemo(() => getSupabaseBrowserClient() as unknown as Rpc | null, []);
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setError("");
    const { error: requestError } = await supabase.rpc("request_store_admin_help", { p_kind: "inventory_access", p_message: message.trim() || null });
    setBusy(false);
    if (requestError) {
      setError(/^[A-Z_]+: (.+)$/.exec(requestError.message ?? "")?.[1] ?? "No pudimos enviar la solicitud. Inténtalo otra vez.");
      return;
    }
    setAsking(false);
    router.refresh();
  }

  return (
    <section aria-labelledby="inventario-acceso" className="grid gap-3 rounded-panel border border-subtle bg-white p-4">
      <h2 id="inventario-acceso" className="font-semibold text-ink">Lleva tu stock en Laria</h2>
      <p className="max-w-[68ch] t-ui text-ink-2">
        Con Inventario registras tus SKU y su stock, los actualizas desde Excel y cada publicación muestra “Agotado” sola cuando
        se acaba. Laria lo activa tienda por tienda.
      </p>
      {openRequest ? (
        <Notice tone="info" role="status">
          Solicitaste acceso el {dateFormat.format(new Date(openRequest.created_at))}. El equipo de Laria te escribirá al correo de la tienda.
        </Notice>
      ) : asking ? (
        <form onSubmit={submit} className="grid gap-3 sm:max-w-md">
          <Field id="inventario-mensaje" label="¿Cuántos SKU manejas y dónde los llevas hoy? (opcional)" hint="Por ejemplo: unos 300, en un Excel.">
            <Textarea rows={3} maxLength={500} value={message} onChange={(event) => setMessage(event.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={busy} loadingLabel="Enviando…">Enviar solicitud</Button>
            <Button size="sm" variant="quiet" onClick={() => { setAsking(false); setError(""); }}>Cancelar</Button>
          </div>
        </form>
      ) : (
        <Button size="sm" variant="secondary" className="w-fit" onClick={() => setAsking(true)}>Solicitar acceso</Button>
      )}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </section>
  );
}
