"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PencilLine, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ErrorSummary } from "@/components/ui/error-summary";
import { Checkbox } from "@/components/ui/field";
import { Notice, NoticeIcon, noticeBodyClassName, noticeClassName } from "@/components/ui/notice";
import { StatusTag, Tag } from "@/components/ui/tag";
import { PUBLISH_CHUNK_ROWS } from "@/lib/store-import/publication";
import type { PublishOutcome, PublishRow, PublishView } from "@/lib/store-import/publication-server";
import type { StatusTone } from "@/lib/ui/status";
import { CompleteRowSheet, type CompleteRowOutcome } from "./complete-row-sheet";

// "Publicar seleccionados" (design §7.7): after the inventory is applied, the owner picks which complete rows become
// publications. The page sends the selection in chunks of 20; each chunk respects the store's allowance, and rows
// beyond it stay unpublished with "Sin cupo de publicaciones".

type ApiResult<T> = { ok: true; body: T } | { ok: false; code: string; message: string };
const NETWORK_MESSAGE = "No pudimos conectar con Laria. Revisa tu conexión y vuelve a intentarlo.";
const ROWS_PAGE = 30;

async function api<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, code: json?.code ?? "IMPORT_FAILED", message: json?.message ?? NETWORK_MESSAGE };
    return { ok: true, body: json as T };
  } catch {
    return { ok: false, code: "NETWORK", message: NETWORK_MESSAGE };
  }
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

const STATES: Record<PublishRow["state"], { label: string; tone: StatusTone }> = {
  ready: { label: "Lista para publicar", tone: "accent" },
  incomplete: { label: "Faltan datos", tone: "warning" },
  published: { label: "Publicada", tone: "accent" },
  linked: { label: "Ya tiene publicación", tone: "line" },
  unavailable: { label: "No disponible", tone: "neutral" },
};

type Filter = "ready" | "incomplete" | "done" | "all";

type Summary = { published: number; review: number; noQuota: number; failed: number };

function summarize(outcomes: PublishOutcome[]): Summary {
  return outcomes.reduce<Summary>((total, item) => {
    if (item.outcome === "published") {
      if (item.listing_status === "pending") total.review += 1;
      else total.published += 1;
    } else if (item.outcome === "no_quota") total.noQuota += 1;
    else if (item.outcome !== "already_published") total.failed += 1;
    return total;
  }, { published: 0, review: 0, noQuota: 0, failed: 0 });
}

export function ImportPublish({ sessionId }: { sessionId: string }) {
  const [view, setView] = useState<PublishView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [problems, setProblems] = useState<Map<number, string>>(new Map());
  const [filter, setFilter] = useState<Filter>("ready");
  const [limit, setLimit] = useState(ROWS_PAGE);
  const [completing, setCompleting] = useState<PublishRow | null>(null);
  const [completed, setCompleted] = useState<{ tone: "success" | "warning"; text: string } | null>(null);
  const completedRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const result = await api<PublishView>(`/api/store/imports/${sessionId}/publication`);
    if (!result.ok) {
      setError(result.message);
      setAttempt((value) => value + 1);
      return null;
    }
    setView(result.body);
    const ready = new Set(result.body.rows.filter((row) => row.state === "ready").map((row) => row.row_number));
    setSelected((current) => new Set([...current].filter((row) => ready.has(row))));
    return result.body;
  }, [sessionId]);

  useEffect(() => {
    if (completed) completedRef.current?.focus();
  }, [completed]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const rows = view?.rows ?? [];
    return {
      ready: rows.filter((row) => row.state === "ready"),
      incomplete: rows.filter((row) => row.state === "incomplete"),
      done: rows.filter((row) => row.state === "published" || row.state === "linked" || row.state === "unavailable"),
      all: rows,
    };
  }, [view]);

  if (!view) {
    return error ? (
      <ErrorSummary title="No pudimos cargar la publicación" errors={[{ id: "publicar-reintentar", message: error }]} attempt={attempt} />
    ) : <p className="t-body text-ink-2">Cargando…</p>;
  }

  const effective: Filter = groups[filter].length || filter === "all" ? filter : groups.ready.length ? "ready" : "all";
  const list = groups[effective];
  const remaining = view.quota.remaining;
  const over = Math.max(selected.size - remaining, 0);
  const publishing = progress !== null;
  const direct = view.store.status === "active" && view.store.is_verified;

  async function publish() {
    setError(null);
    setSummary(null);
    setCompleted(null);
    const rows = [...selected].sort((a, b) => a - b);
    const outcomes: PublishOutcome[] = [];
    setProgress({ done: 0, total: rows.length });
    for (let start = 0; start < rows.length; start += PUBLISH_CHUNK_ROWS) {
      const chunk = rows.slice(start, start + PUBLISH_CHUNK_ROWS);
      const result = await api<{ outcomes: PublishOutcome[] }>(`/api/store/imports/${sessionId}/publication`, { rows: chunk, rulesAccepted });
      if (!result.ok) {
        setError(result.message);
        setAttempt((value) => value + 1);
        break;
      }
      outcomes.push(...result.body.outcomes);
      setProgress({ done: Math.min(start + chunk.length, rows.length), total: rows.length });
    }
    setProgress(null);
    setProblems(new Map(outcomes.filter((item) => item.message && item.outcome !== "published").map((item) => [item.row_number, item.message!])));
    if (outcomes.length) setSummary(summarize(outcomes));
    setSelected(new Set());
    await load();
  }

  function closeCompleting() {
    const row = completing?.row_number;
    setCompleting(null);
    if (row !== undefined) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-completar="${row}"]`)?.focus());
  }

  // After "Completar datos": the list is read again, and a row that became complete is selected for publishing.
  async function onCompleted(outcome: CompleteRowOutcome) {
    setCompleting(null);
    const next = await load();
    const row = next?.rows.find((item) => item.row_number === outcome.row);
    const photos = outcome.photosAdded ? ` Se ${outcome.photosAdded === 1 ? "agregó 1 foto" : `agregaron ${outcome.photosAdded} fotos`}.` : "";
    const photoProblem = outcome.photoError ? ` ${outcome.photoError}` : "";
    if (row?.state === "ready") {
      if (next?.open) setSelected((current) => new Set([...current, row.row_number]));
      setCompleted({ tone: outcome.photoError ? "warning" : "success", text: `Fila ${outcome.row} lista para publicar: la dejamos seleccionada.${photos}${photoProblem}` });
    } else {
      const still = row?.missing.length ? ` Para publicar todavía falta: ${row.missing.join(", ")}.` : "";
      setCompleted({ tone: "warning", text: `${outcome.savedFields ? `Guardamos los datos de la fila ${outcome.row}.` : `Fila ${outcome.row}.`}${photos}${photoProblem}${still}` });
    }
  }

  function toggle(row: number, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(row);
      else next.delete(row);
      return next;
    });
  }

  return (
    <section className="grid gap-4 rounded-panel border border-subtle p-4" aria-labelledby="publicar-importacion">
      <div className="grid gap-1">
        <h3 id="publicar-importacion" className="t-section">Publicar en Laria</h3>
        <p className="t-body text-ink-2">
          Elige qué SKU se publican. Cada uno necesita nombre, marca, modelo, categoría, tipo de instrumento, condición,
          descripción de 40 caracteres, precio y de 2 a 10 fotos.
        </p>
      </div>

      {!view.open ? <Notice tone="info">{view.closed_reason}</Notice> : null}
      <div><Button size="sm" variant="quiet" disabled={publishing} onClick={() => void load()}>Actualizar lista</Button></div>

      <p className="t-ui">
        Cupo de publicaciones: {view.quota.used} de {view.quota.allowance} en uso. {remaining
          ? `Puedes publicar ${plural(remaining, "SKU más", "SKU más")}.`
          : "No queda cupo: cuando una publicación deje de estar en revisión o publicada, se libera un lugar."}
      </p>
      <p className="t-meta">
        {direct
          ? "Como Tienda verificada, los SKU completos se publican de inmediato."
          : view.store.status === "active"
            ? "Cada publicación entra en revisión de Laria antes de aparecer."
            : "Tu tienda está en revisión: las publicaciones quedan en revisión y no son públicas hasta que Laria apruebe la tienda."}
      </p>

      {summary ? <PublishSummary summary={summary} /> : null}

      {error ? <ErrorSummary title="No pudimos publicar" errors={[{ id: "publicar-acciones", message: error }]} attempt={attempt} /> : null}

      {completed ? (
        <div ref={completedRef} tabIndex={-1} role="status" className="outline-none">
          <Notice tone={completed.tone}>{completed.text}</Notice>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar SKU">
        <Chip selected={effective === "ready"} onClick={() => setFilter("ready")}>Listas ({groups.ready.length})</Chip>
        <Chip selected={effective === "incomplete"} onClick={() => setFilter("incomplete")}>Faltan datos ({groups.incomplete.length})</Chip>
        <Chip selected={effective === "done"} onClick={() => setFilter("done")}>Publicadas o vinculadas ({groups.done.length})</Chip>
        <Chip selected={effective === "all"} onClick={() => setFilter("all")}>Todas ({groups.all.length})</Chip>
      </div>

      {view.open && groups.ready.length ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={publishing}
            onClick={() => setSelected(new Set(groups.ready.map((row) => row.row_number)))}>
            Seleccionar las listas ({groups.ready.length})
          </Button>
          {selected.size ? <Button size="sm" variant="quiet" disabled={publishing} onClick={() => setSelected(new Set())}>Quitar selección</Button> : null}
        </div>
      ) : null}

      {list.length ? (
        <ul className="divide-y divide-subtle rounded-panel border border-subtle">
          {list.slice(0, limit).map((row) => (
            <PublishRowItem key={row.row_number} row={row} selectable={view.open && row.state === "ready" && !publishing}
              selected={selected.has(row.row_number)} problem={problems.get(row.row_number) ?? null}
              onToggle={(on) => toggle(row.row_number, on)}
              onComplete={view.open && row.state === "incomplete" && !publishing ? () => { setCompleted(null); setCompleting(row); } : null} />
          ))}
        </ul>
      ) : <p className="t-body text-ink-2">No hay SKU en este grupo.</p>}
      {list.length > limit ? <div><Button variant="secondary" onClick={() => setLimit((value) => value + ROWS_PAGE)}>Ver más SKU</Button></div> : null}

      {completing ? (
        <CompleteRowSheet sessionId={sessionId} row={completing.row_number} itemId={completing.item_id}
          onClose={closeCompleting} onSaved={(outcome) => void onCompleted(outcome)} />
      ) : null}

      {view.open && groups.ready.length ? (
        <div className="grid gap-3 border-t border-subtle pt-4">
          {over ? (
            <Notice tone="warning">
              Elegiste {plural(selected.size, "SKU", "SKU")} y quedan {remaining} lugares en tu cupo: {plural(over, "SKU quedará", "SKU quedarán")} sin publicar.
            </Notice>
          ) : null}
          <Checkbox checked={rulesAccepted} onChange={(event) => setRulesAccepted(event.target.checked)} disabled={publishing}
            label={<span>Acepto los <a href="/terminos" target="_blank" rel="noopener" className="link font-semibold">términos y reglas del marketplace</a>, confirmo que estos equipos no están entre los <a href="/articulos-prohibidos" target="_blank" rel="noopener" className="link font-semibold">artículos prohibidos</a> y que la información y las fotos son reales. Laria no procesa pagos, no gestiona envíos ni garantiza transacciones.</span>} />
          <div className="flex flex-wrap items-center gap-3">
            <Button icon={<Send aria-hidden />} disabled={!selected.size || !rulesAccepted || publishing}
              loading={publishing} loadingLabel={progress ? `Publicando ${progress.done} de ${progress.total}…` : "Publicando…"}
              onClick={() => void publish()}>
              {selected.size ? `Publicar seleccionados (${selected.size})` : "Publicar seleccionados"}
            </Button>
            <Link href="/mi-cuenta/tienda/inventario" className="link t-ui font-semibold">Ver en Inventario</Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PublishRowItem({ row, selectable, selected, problem, onToggle, onComplete }: {
  row: PublishRow;
  selectable: boolean;
  selected: boolean;
  problem: string | null;
  onToggle: (on: boolean) => void;
  onComplete: (() => void) | null;
}) {
  const state = STATES[row.state];
  const label = `${row.sku ? `${row.sku} · ` : ""}${row.name}`;
  const note = problem ?? (row.last_attempt?.message && row.state === "ready" ? row.last_attempt.message : null);
  return (
    <li className="grid gap-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {selectable ? (
          <Checkbox checked={selected} onChange={(event) => onToggle(event.target.checked)} label={<span className="font-semibold break-words">{label}</span>}
            description={`Fila ${row.row_number} · ${row.price ? `S/ ${row.price.toLocaleString("es-PE")}` : "sin precio"} · ${plural(row.photo_count, "foto", "fotos")} · ${row.available} disponibles`} />
        ) : (
          <div className="grid min-w-0 gap-1">
            <p className="t-body font-semibold break-words">{label}</p>
            <p className="t-meta">Fila {row.row_number} · {plural(row.photo_count, "foto", "fotos")}</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {row.listing ? <StatusTag domain="listing" status={row.listing.status} /> : <Tag tone={state.tone}>{state.label}</Tag>}
          {onComplete ? (
            <Button size="sm" variant="secondary" icon={<PencilLine aria-hidden />} data-completar={row.row_number} onClick={onComplete}
              aria-label={`Completar datos de la fila ${row.row_number}`}>
              Completar datos
            </Button>
          ) : null}
        </div>
      </div>
      {row.state === "incomplete" && row.missing.length ? <p className="t-ui text-ink-2">Para publicar falta: {row.missing.join(", ")}.</p> : null}
      {row.state === "unavailable" ? <p className="t-ui text-ink-2">El SKU está archivado o ya no está en tu inventario.</p> : null}
      {note ? <p className="t-ui text-danger">{note}</p> : null}
      {row.warnings.length ? <p className="t-meta">{row.warnings.join(" ")}</p> : null}
      {row.listing?.status === "approved" ? (
        <p className="t-ui"><Link href={`/instrumentos/${row.listing.slug}`} className="link font-semibold">Ver publicación</Link></p>
      ) : null}
    </li>
  );
}

// The outcome of "Publicar seleccionados" (review fix B2): a larger notice that takes focus and scrolls into view, since
// the button that started it sits at the end of a long list.
function PublishSummary({ summary }: { summary: Summary }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.focus({ preventScroll: true });
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }, [summary]);
  const pending = summary.failed + summary.noQuota;
  const tone = pending ? "warning" : "success";
  const title = pending
    ? "Publicación terminada con SKU pendientes"
    : summary.review && !summary.published
      ? "Tus SKU quedaron en revisión"
      : "Se publicaron los SKU seleccionados";
  return (
    <div ref={ref} tabIndex={-1} role="status" className={noticeClassName(tone, "gap-4 p-5 sm:p-6 [&>svg]:h-7 [&>svg]:w-7")}>
      <NoticeIcon tone={tone} />
      <div className={noticeBodyClassName}>
        <p className="t-section">{title}</p>
        <ul className="mt-2 grid list-disc gap-1 pl-5 t-body">
          {summary.published ? <li>{plural(summary.published, "SKU publicado", "SKU publicados")}: ya se ven en Laria.</li> : null}
          {summary.review ? <li>{plural(summary.review, "SKU quedó en revisión", "SKU quedaron en revisión")}: aparecen cuando Laria los aprueba.</li> : null}
          {summary.noQuota ? <li>{plural(summary.noQuota, "SKU quedó sin publicar", "SKU quedaron sin publicar")} por falta de cupo.</li> : null}
          {summary.failed ? <li>{plural(summary.failed, "SKU no se pudo publicar", "SKU no se pudieron publicar")}; el motivo está en cada fila.</li> : null}
        </ul>
      </div>
    </div>
  );
}
