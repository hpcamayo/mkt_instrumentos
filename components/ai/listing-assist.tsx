"use client";

import { Check, Sparkles } from "lucide-react";
import { useState } from "react";
import { assistPhoto } from "@/components/ai/assist-photos";
import type { FormPhoto } from "@/components/selling/photo-step";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import {
  LISTING_ASSIST_MAX_PHOTOS,
  applyAllAssist,
  applyAssistField,
  assistRows,
  type AssistField,
  type AssistRow,
  type ListingSuggestion,
} from "@/lib/ai/listing-assist";
import type { SellValues } from "@/lib/sell-draft";

// big-07, "Completar con IA" (docs/ux-effortless/maybes-ai.md): at the top of "Qué es", once there is a photo. Only when
// tapped, up to four photos, shrunk in the browser, go to the server and on to the AI service; what comes back is a
// list of suggestions, each with its own button. "Usar todo" fills only what is empty: replacing what the seller wrote
// takes that row's own button. Nothing about condition or price.

type State =
  | { kind: "idle" }
  | { kind: "working"; step: string }
  | { kind: "ready"; suggestion: ListingSuggestion; note: string }
  | { kind: "error"; message: string };

export function ListingAssist({ photos, source, values, footer, onApply }: {
  photos: FormPhoto[];
  // The form's own copy of a photo (prepared or original); null for a photo restored from a saved draft.
  source: (photo: FormPhoto) => Blob | null;
  values: SellValues;
  footer: string;
  onApply: (next: SellValues) => void;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  if (!photos.length) return null;

  async function start() {
    setState({ kind: "working", step: "Preparando tus fotos…" });
    const encoded: string[] = [];
    for (const photo of photos.slice(0, LISTING_ASSIST_MAX_PHOTOS)) {
      let blob = source(photo);
      if (!blob && /^https?:/.test(photo.url)) {
        blob = await fetch(photo.url).then((response) => (response.ok ? response.blob() : null)).catch(() => null);
      }
      const data = blob ? await assistPhoto(blob) : null;
      if (data) encoded.push(data);
    }
    if (!encoded.length) {
      setState({ kind: "error", message: "No pudimos leer tus fotos todavía. Espera a que terminen de prepararse y vuelve a tocar Completar con IA." });
      return;
    }
    setState({ kind: "working", step: "Mirando tus fotos…" });
    try {
      const response = await fetch("/api/listing-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: encoded }),
      });
      const body = (await response.json().catch(() => null)) as { suggestion?: ListingSuggestion; message?: string } | null;
      if (response.ok && body?.suggestion) setState({ kind: "ready", suggestion: body.suggestion, note: "" });
      else setState({ kind: "error", message: body?.message ?? "No pudimos sugerir datos en este momento. Completa los campos a mano." });
    } catch {
      setState({ kind: "error", message: "No hay conexión. Revisa tu internet y vuelve a intentarlo." });
    }
  }

  function use(field: AssistField) {
    if (state.kind !== "ready") return;
    onApply(applyAssistField(values, state.suggestion, field, footer));
  }

  function useAll() {
    if (state.kind !== "ready") return;
    const { values: next, kept } = applyAllAssist(values, state.suggestion, footer);
    onApply(next);
    setState({
      ...state,
      note: kept.length
        ? `Completamos lo que estaba vacío. No cambiamos lo que ya escribiste (${kept.join(", ")}): usa su botón si prefieres la sugerencia.`
        : "Completamos los campos. Revísalos antes de seguir.",
    });
  }

  const working = state.kind === "working";
  const rows = state.kind === "ready" ? assistRows(state.suggestion, values, footer) : [];
  return (
    <div className="grid gap-3 rounded-panel border border-subtle bg-canvas p-4">
      <div className="grid gap-1.5">
        <Button type="button" variant="secondary" className="w-fit" icon={<Sparkles aria-hidden />} loading={working} loadingLabel={working ? state.step : undefined} onClick={start}>
          {state.kind === "ready" ? "Volver a completar con IA" : "Completar con IA"}
        </Button>
        <p className="t-meta text-ink-2">
          Sugerimos categoría, marca, modelo, título y descripción a partir de tus fotos. Solo al tocar el botón, hasta {LISTING_ASSIST_MAX_PHOTOS} fotos reducidas se envían a un servicio de IA. Revisa cada dato antes de usarlo.
        </p>
      </div>
      {state.kind === "error" ? <Notice tone="danger">{state.message}</Notice> : null}
      {state.kind === "ready" && !state.suggestion.recognized ? (
        <Notice tone="warning">No reconocimos un instrumento ni un equipo de audio en tus fotos. Prueba con una foto de frente y con buena luz, o completa los campos a mano.</Notice>
      ) : null}
      {state.kind === "ready" && rows.length ? (
        <section aria-label="Sugerencias a partir de tus fotos" className="grid gap-2">
          {state.suggestion.confidence === "low" ? (
            <Notice tone="warning" role="note">No estamos seguros de qué es. Revisa cada dato antes de usarlo.</Notice>
          ) : null}
          <ul className="grid">
            {rows.map((row) => <SuggestionRow key={row.field} row={row} details={state.suggestion.details} onUse={() => use(row.field)} />)}
          </ul>
          <div className="flex flex-wrap items-center gap-3 border-t border-subtle pt-3">
            <Button type="button" variant="secondary" size="sm" disabled={!rows.some((row) => row.state === "empty")} onClick={useAll}>Usar todo</Button>
            <Button type="button" variant="quiet" size="sm" onClick={() => setState({ kind: "idle" })}>Descartar sugerencias</Button>
          </div>
          {state.note ? <p role="status" className="t-meta text-ink">{state.note}</p> : null}
        </section>
      ) : null}
    </div>
  );
}

function SuggestionRow({ row, details, onUse }: { row: AssistRow; details: string[]; onUse: () => void }) {
  const action = row.field === "details" ? "Agregar a la descripción" : row.state === "different" ? "Reemplazar" : "Usar";
  return (
    <li className="grid gap-1.5 border-t border-subtle py-3 first:border-t-0 first:pt-0 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-start sm:gap-3">
      <p className="t-meta font-semibold text-ink-2">{row.label}</p>
      <div className="min-w-0">
        {row.field === "details" ? (
          <ul className="grid gap-0.5 t-ui text-ink">{details.map((detail) => <li key={detail}>· {detail}</li>)}</ul>
        ) : (
          <p className="whitespace-pre-line break-words t-ui text-ink">{row.value}</p>
        )}
        {row.state === "different" ? <p className="mt-1 break-words t-meta text-ink-2">Ahora: {row.current}</p> : null}
        {row.field === "description" || row.field === "details" ? <p className="mt-1 t-meta text-ink-2">Va en la descripción, en el paso Estado y precio.</p> : null}
      </div>
      {row.state === "same" ? (
        <p className="inline-flex items-center gap-1 t-meta font-semibold text-ink"><Check className="h-4 w-4" aria-hidden />{row.field === "details" ? "En la descripción" : "Ya está"}</p>
      ) : (
        <Button type="button" variant="secondary" size="sm" className="w-fit" aria-label={`${action}: ${row.label}`} onClick={onUse}>{action}</Button>
      )}
    </li>
  );
}
