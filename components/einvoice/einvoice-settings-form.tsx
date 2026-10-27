"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Radio } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { receiptAction } from "@/lib/einvoice/client";

// run-03: the store connects its own Nubefact account (RUTA and TOKEN from Nubefact → API - Integración). Laria
// checks them with Nubefact before saving and keeps the token encrypted; it is never shown again, only its last four
// characters.

export type EinvoiceSettings = {
  connected: boolean;
  api_url?: string;
  token_hint?: string;
  boleta_series?: string;
  factura_series?: string;
  next_boleta_number?: number;
  next_factura_number?: number;
  igv_affectation?: "gravado" | "exonerado" | "inafecto";
  email_customer?: boolean;
  checked_at?: string | null;
};

export function EinvoiceSettingsForm({ settings }: { settings: EinvoiceSettings }) {
  const id = useId();
  const router = useRouter();
  const [confirm, dialog] = useConfirm();
  const [apiUrl, setApiUrl] = useState(settings.api_url ?? "");
  const [token, setToken] = useState("");
  const [boleta, setBoleta] = useState(settings.boleta_series ?? "B001");
  const [factura, setFactura] = useState(settings.factura_series ?? "F001");
  const [nextBoleta, setNextBoleta] = useState(String(settings.next_boleta_number ?? 1));
  const [nextFactura, setNextFactura] = useState(String(settings.next_factura_number ?? 1));
  const [igv, setIgv] = useState(settings.igv_affectation ?? "gravado");
  const [email, setEmail] = useState(settings.email_customer ?? true);
  const [busy, setBusy] = useState<"save" | "test" | "off" | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    const fields: Record<string, unknown> = {
      boleta_series: boleta, factura_series: factura, igv_affectation: igv, email_customer: email,
      next_boleta_number: Number.parseInt(nextBoleta, 10), next_factura_number: Number.parseInt(nextFactura, 10),
    };
    if (token.trim() || apiUrl.trim() !== (settings.api_url ?? "")) {
      fields.api_url = apiUrl;
      if (token.trim()) fields.token = token;
    }
    setBusy("save");
    setFeedback(null);
    const result = await receiptAction({ action: "settings", fields });
    setBusy(null);
    if (!result.ok) {
      setFeedback({ kind: "error", message: result.message });
      return;
    }
    setToken("");
    setFeedback({ kind: "success", message: settings.connected ? "Guardamos los cambios." : "Listo: tu cuenta de Nubefact está conectada. Ya puedes emitir desde el Mostrador." });
    router.refresh();
  }

  async function test() {
    setBusy("test");
    setFeedback(null);
    const result = await receiptAction({ action: "test" });
    setBusy(null);
    setFeedback(result.ok ? { kind: "success", message: "La conexión con Nubefact funciona." } : { kind: "error", message: result.message });
    if (result.ok) router.refresh();
  }

  async function disconnect() {
    const yes = await confirm({
      title: "¿Desconectar Nubefact?",
      body: "Borramos el token de Laria. Tus comprobantes emitidos siguen en Comprobantes y en tu cuenta de Nubefact.",
      confirmLabel: "Desconectar",
      tone: "danger",
    });
    if (!yes) return;
    setBusy("off");
    const result = await receiptAction({ action: "disconnect" });
    setBusy(null);
    if (!result.ok) setFeedback({ kind: "error", message: result.message });
    else router.refresh();
  }

  return (
    <form onSubmit={save} className="grid gap-4 rounded-panel border border-subtle bg-white p-4 md:p-5" noValidate>
      {dialog}
      <h2 className="t-section text-ink">{settings.connected ? "Conexión con Nubefact" : "Conecta tu cuenta de Nubefact"}</h2>
      {settings.connected ? null : (
        <p className="t-body text-ink-2 max-w-[68ch]">
          En tu cuenta de Nubefact, abre API - Integración y copia la RUTA y el TOKEN. La cuenta, sus series y su costo son de tu tienda; Laria solo le envía las ventas que registras en el Mostrador.
        </p>
      )}
      {feedback ? <Notice tone={feedback.kind === "success" ? "success" : "danger"} role={feedback.kind === "success" ? "status" : "alert"}>{feedback.message}</Notice> : null}
      <Field id={`${id}-ruta`} label="RUTA" hint="Empieza con https://api.nubefact.com/api/v1/">
        <Input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} autoComplete="off" spellCheck={false} />
      </Field>
      <Field id={`${id}-token`} label="TOKEN" optional={settings.connected} hint={settings.connected ? `Guardado (termina en ${settings.token_hint}). Pega uno nuevo solo para cambiarlo.` : "Lo guardamos cifrado y no se vuelve a mostrar."}>
        <Input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" spellCheck={false} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-serie-b`} label="Serie de boletas" hint="Como en Nubefact, por ejemplo B001.">
          <Input value={boleta} maxLength={4} onChange={(event) => setBoleta(event.target.value.toUpperCase())} />
        </Field>
        <Field id={`${id}-numero-b`} label="Siguiente número de boleta">
          <Input inputMode="numeric" value={nextBoleta} onChange={(event) => setNextBoleta(event.target.value)} />
        </Field>
        <Field id={`${id}-serie-f`} label="Serie de facturas" hint="Por ejemplo F001.">
          <Input value={factura} maxLength={4} onChange={(event) => setFactura(event.target.value.toUpperCase())} />
        </Field>
        <Field id={`${id}-numero-f`} label="Siguiente número de factura">
          <Input inputMode="numeric" value={nextFactura} onChange={(event) => setNextFactura(event.target.value)} />
        </Field>
      </div>
      <p className="t-meta">Usa una serie solo para Laria, o el número que sigue en Nubefact, para que dos sistemas no usen el mismo número.</p>
      <fieldset className="grid gap-2">
        <legend className="mb-1 t-ui font-semibold text-ink">IGV de tus ventas</legend>
        <Radio name={`${id}-igv`} checked={igv === "gravado"} onChange={() => setIgv("gravado")} label="Gravadas con IGV (18 %)" description="Lo usual. Tus precios ya incluyen el IGV." />
        <Radio name={`${id}-igv`} checked={igv === "exonerado"} onChange={() => setIgv("exonerado")} label="Exoneradas" description="Por ejemplo, ventas en la Amazonía." />
        <Radio name={`${id}-igv`} checked={igv === "inafecto"} onChange={() => setIgv("inafecto")} label="Inafectas" />
      </fieldset>
      <Checkbox checked={email} onChange={(event) => setEmail(event.target.checked)} label="Que Nubefact envíe el PDF al correo del cliente cuando lo escribas" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy === "save"} loadingLabel="Comprobando con Nubefact…">{settings.connected ? "Guardar cambios" : "Conectar"}</Button>
        {settings.connected ? <Button variant="secondary" loading={busy === "test"} loadingLabel="Probando…" onClick={test}>Probar conexión</Button> : null}
        {settings.connected ? <Button variant="quiet" loading={busy === "off"} loadingLabel="Desconectando…" onClick={disconnect}>Desconectar</Button> : null}
      </div>
    </form>
  );
}
