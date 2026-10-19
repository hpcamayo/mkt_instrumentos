"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertCircle, AlertTriangle, Download, Info, RotateCcw, Upload } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ErrorSummary } from "@/components/ui/error-summary";
import { Checkbox, Field, FileInput, Radio, Select } from "@/components/ui/field";
import { Notice, NoticeIcon, noticeClassName } from "@/components/ui/notice";
import { Tag } from "@/components/ui/tag";
import { ImportPhotos } from "@/components/store-import/import-photos";
import { ImportPublish } from "@/components/store-import/import-publish";
import { IMPORT_FILE_ACCEPT, importFileFormat, importFileProblem, uploadImportFile } from "@/components/store-import/import-start";
import { importCategoryChips, importStatus } from "@/lib/store-import/labels";
import {
  EXPORTED_AT_FIELD,
  IMPORT_ATTRIBUTE_FIELDS,
  IMPORT_FIELDS,
  IMPORT_UPDATE_SCOPES,
  impliedUpdateScope,
  mappingProblems,
  type ImportMapping,
  type ImportUpdateScope,
} from "@/lib/store-import/mapping";
import { ACTION_LABELS, describeChanges, resultLabel } from "@/lib/store-import/report";
import type { ImportSession, RowFilter, StepNext } from "@/lib/store-import/server";
import type { ImportCell, ImportIssue } from "@/lib/store-import/types";
import type { StatusTone } from "@/lib/ui/status";
import { cn } from "@/lib/utils";

// The wizard's steps (design §13.4). "Fotos" (STORE-3a) sits between Revisar and Confirmar; the step loop and the
// server do not change.
export const IMPORT_WIZARD_STEPS = [
  { key: "upload", label: "Subir archivo" },
  { key: "mapping", label: "Columnas" },
  { key: "review", label: "Revisar" },
  { key: "photos", label: "Fotos" },
  { key: "confirm", label: "Confirmar" },
  { key: "result", label: "Resultado" },
] as const;

type StepKey = (typeof IMPORT_WIZARD_STEPS)[number]["key"];

type StagedRow = {
  row_number: number;
  parsed: { sku?: string | null; product_name?: string | null } | null;
  issues: ImportIssue[];
  sku_normalized: string | null;
  planned_action: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  owner_decision: "include" | "exclude";
  commit_status: string;
  commit_message: string | null;
};

type ApiResult<T> = { ok: true; body: T } | { ok: false; code: string; message: string };

const NETWORK_MESSAGE = "No pudimos conectar con Laria. Revisa tu conexión y vuelve a intentarlo.";

async function api<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, code: body?.code ?? "IMPORT_FAILED", message: body?.message ?? NETWORK_MESSAGE };
    return { ok: true, body: body as T };
  } catch {
    return { ok: false, code: "NETWORK", message: NETWORK_MESSAGE };
  }
}

type ReadyView = "mapping" | "review" | "photos" | "confirm";

function stepFor(status: string, reviewing: ReadyView): StepKey {
  switch (status) {
    case "awaiting_upload":
    case "parsing":
      return "upload";
    case "mapping_required":
      return "mapping";
    case "validating":
      return "review";
    case "ready":
      return reviewing;
    case "committing":
      return "confirm";
    default:
      return "result";
  }
}

const ACTION_TONES: Record<string, StatusTone> = {
  create: "accent",
  update: "accent",
  adopt_listing: "accent",
  unchanged: "line",
  error: "danger",
};

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

// ------------------------------------------------------------------ the wizard

export function ImportWizard({ initialSession, initialNext }: { initialSession: ImportSession; initialNext: StepNext }) {
  const [session, setSession] = useState(initialSession);
  const [next, setNext] = useState<StepNext>(initialNext);
  const [error, setError] = useState<string | null>(null);
  const [errorAttempt, setErrorAttempt] = useState(0);
  const [tick, setTick] = useState(0);
  // An awaiting_upload session is checked once (the start page normally uploaded the file); if the file is not there,
  // the page asks for it.
  const [checkUpload, setCheckUpload] = useState(true);
  const [reviewing, setReviewing] = useState<ReadyView>("review");
  const [confirm, confirmDialog] = useConfirm();

  const apply = useCallback((result: { session: ImportSession | null; next: StepNext }) => {
    if (result.session) setSession(result.session);
    setNext(result.next);
  }, []);

  const fail = useCallback((message: string) => {
    setError(message);
    setErrorAttempt((value) => value + 1);
  }, []);

  const reload = useCallback(async () => {
    const result = await api<{ session: ImportSession; next: StepNext }>(`/api/store/imports/${session.id}`);
    if (result.ok) apply(result.body);
  }, [apply, session.id]);

  // The step loop (design §7.1): while the page is open it asks the server for one bounded unit after another. Closing
  // the page stops it at the last checkpoint; opening it again picks up from there.
  const running = !error && (next === "continue" || next === "busy" || (next === "upload" && checkUpload));
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await api<{ session: ImportSession | null; next: StepNext }>(`/api/store/imports/${session.id}/step`, { method: "POST", body: {} });
      if (cancelled) return;
      if (!result.ok) {
        fail(result.message);
        return;
      }
      if (result.body.next === "upload") setCheckUpload(false);
      apply(result.body);
      setTick((value) => value + 1);
    }, next === "busy" ? 3000 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [running, next, tick, session.id, apply, fail]);

  async function act(body: Record<string, unknown>) {
    setError(null);
    const result = await api<{ session: ImportSession | null; next: StepNext }>(`/api/store/imports/${session.id}`, { method: "POST", body });
    if (!result.ok) {
      fail(result.message);
      if (result.code === "IMPORT_VERSION_CONFLICT" || result.code === "IMPORT_SESSION_CLOSED") await reload();
      return false;
    }
    apply(result.body);
    return true;
  }

  async function cancel() {
    const ok = await confirm({
      title: "¿Cancelar esta importación?",
      body: "No se aplicará ningún cambio del archivo. Podrás empezar otra importación.",
      confirmLabel: "Cancelar importación",
      cancelLabel: "Seguir importando",
      tone: "danger",
    });
    if (ok) await act({ action: "cancel" });
  }

  const step = stepFor(session.status, reviewing);
  const status = importStatus(session.status);
  const open = !session.closed_at;
  const working = running && next !== "upload";

  return (
    <div className="grid gap-6">
      {confirmDialog}
      <StepList current={step} />
      <div className="flex flex-wrap items-center gap-2 t-ui">
        <span className="font-semibold break-all">{session.file_name}</span>
        <Tag tone={status.tone}>{status.label}</Tag>
      </div>

      {error ? (
        <div className="grid gap-3">
          <ErrorSummary title="No pudimos continuar" errors={[{ id: "importacion-acciones", message: error }]} attempt={errorAttempt} />
          <div id="importacion-acciones" tabIndex={-1} className="flex flex-wrap gap-3">
            <Button variant="secondary" icon={<RotateCcw aria-hidden />} onClick={() => { setError(null); void reload(); }}>Reintentar</Button>
          </div>
        </div>
      ) : null}

      {working ? <ProgressPanel session={session} busy={next === "busy"} /> : null}

      {step === "upload" && next === "upload" && !checkUpload ? (
        <UploadAgain session={session} onUploaded={() => { setError(null); setCheckUpload(true); }} onError={fail} />
      ) : null}

      {step === "result" && session.status === "failed" ? (
        <Notice tone="danger" title="No pudimos leer el archivo">
          <p>{session.error_message ?? "Revisa el archivo y vuelve a intentarlo."}</p>
          <p className="mt-3"><Link href="/mi-cuenta/tienda/inventario/importar">Subir otro archivo</Link></p>
        </Notice>
      ) : null}

      {step === "mapping" && !working ? (
        <MappingStep
          session={session}
          onSubmit={async (mapping, saveDefault, updateScope) => {
            const ok = await act({ action: "mapping", mapping, saveDefault, updateScope, staleStock: "keep", version: session.version });
            if (ok) setReviewing("review");
            return ok;
          }}
          onCancel={session.status === "ready" ? () => setReviewing("review") : undefined}
        />
      ) : null}

      {session.status === "ready" && !working && reviewing === "review" ? (
        <ReviewStep
          session={session}
          onDecision={async (rows, decision) => act({ action: "decision", rows, decision, version: session.version })}
          onStaleStock={async (staleStock) => act({
            action: "mapping", mapping: session.column_mapping ?? {}, updateScope: session.options?.update_scope ?? "both",
            staleStock, version: session.version,
          })}
          onBack={() => setReviewing("mapping")}
          onContinue={() => { setReviewing("photos"); window.scrollTo({ top: 0 }); }}
        />
      ) : null}

      {session.status === "ready" && !working && reviewing === "photos" ? (
        <ImportPhotos
          sessionId={session.id}
          onBack={() => setReviewing("review")}
          onContinue={() => { setReviewing("confirm"); window.scrollTo({ top: 0 }); void reload(); }}
        />
      ) : null}

      {session.status === "ready" && !working && reviewing === "confirm" ? (
        <ConfirmStep
          session={session}
          scope={session.options?.update_scope ?? "both"}
          onBack={() => setReviewing("photos")}
          onConfirm={() => act({ action: "confirm", version: session.version })}
        />
      ) : null}

      {step === "result" && session.status !== "failed" ? (
        <ResultStep session={session} onReopen={async () => { setReviewing("review"); await act({ action: "reopen", version: session.version }); }} />
      ) : null}

      {open && session.status !== "committing" ? (
        <div className="border-t border-subtle pt-4">
          <Button variant="quiet" onClick={() => void cancel()}>Cancelar importación</Button>
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function StepList({ current }: { current: StepKey }) {
  const index = IMPORT_WIZARD_STEPS.findIndex((step) => step.key === current);
  return (
    <nav aria-label="Pasos de la importación">
      <ol className="flex flex-wrap gap-x-4 gap-y-2 t-ui">
        {IMPORT_WIZARD_STEPS.map((step, position) => (
          <li key={step.key} aria-current={position === index ? "step" : undefined}
            className={cn("flex items-center gap-2", position === index ? "font-semibold text-ink" : position < index ? "text-ink" : "text-ink-2")}>
            <span aria-hidden className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold",
              position === index ? "bg-ink text-surface" : position < index ? "bg-accent-tint text-ink" : "bg-subtle text-ink-2")}>
              {position + 1}
            </span>
            {step.label}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ProgressPanel({ session, busy }: { session: ImportSession; busy: boolean }) {
  const counts = session.counts ?? {};
  let label = "Preparando la importación…";
  let done: number | null = null;
  let total: number | null = null;
  if (session.status === "parsing" || session.status === "awaiting_upload") {
    label = session.parse_cursor ? `Leyendo el archivo: ${plural(session.parse_cursor, "fila leída", "filas leídas")}…` : "Leyendo el archivo…";
  } else if (session.status === "validating") {
    total = counts.total ?? 0;
    done = total - (counts.pending_plan ?? total);
    label = `Revisando filas: ${done} de ${total}`;
  } else if (session.status === "committing") {
    done = (counts.applied ?? 0) + (counts.conflict ?? 0) + (counts.failed ?? 0);
    total = done + (counts.to_apply ?? 0);
    label = `Aplicando cambios: ${done} de ${total}`;
  }
  const percent = total ? Math.round(((done ?? 0) / total) * 100) : null;
  return (
    <div className="grid gap-3 rounded-panel border border-subtle p-4" aria-live="polite">
      <p className="t-body font-semibold" id="importacion-progreso">{busy ? "La importación se está procesando en otra pestaña…" : label}</p>
      <div
        role="progressbar"
        aria-labelledby="importacion-progreso"
        aria-valuemin={percent === null ? undefined : 0}
        aria-valuemax={percent === null ? undefined : 100}
        aria-valuenow={percent ?? undefined}
        className="h-2 overflow-hidden rounded-full bg-subtle"
      >
        <div className={cn("h-full bg-ink transition-[width]", percent === null && "w-full bg-line-strong")} style={percent === null ? undefined : { width: `${Math.max(percent, 3)}%` }} />
      </div>
      <p className="t-meta">Puedes cerrar esta página; la importación continúa cuando vuelvas.</p>
    </div>
  );
}

function UploadAgain({ session, onUploaded, onError }: { session: ImportSession; onUploaded: () => void; onError: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const issue = importFileProblem(file) ?? (file && importFileFormat(file) !== session.file_format
      ? `Esta importación espera un archivo .${session.file_format}.` : null);
    setProblem(issue);
    if (issue || !file) return;
    setBusy(true);
    const uploadError = await uploadImportFile(session.file_path, file);
    setBusy(false);
    if (uploadError) onError(uploadError);
    else onUploaded();
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 rounded-panel border border-subtle p-4">
      <Notice tone="warning" title="El archivo no llegó">
        <p>La subida no terminó. Elige el mismo archivo para continuar.</p>
      </Notice>
      <Field id="archivo-reintento" label={`Archivo (.${session.file_format})`} error={problem ?? undefined}>
        <FileInput accept={IMPORT_FILE_ACCEPT} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setProblem(null); }} />
      </Field>
      <div>
        <Button type="submit" icon={<Upload aria-hidden />} loading={busy} loadingLabel="Subiendo archivo…">Subir archivo</Button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ Columnas

function MappingStep({ session, onSubmit, onCancel }: {
  session: ImportSession;
  onSubmit: (mapping: ImportMapping, saveDefault: boolean, scope: ImportUpdateScope) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const headers = useMemo(() => session.headers ?? [], [session.headers]);
  const [byColumn, setByColumn] = useState<string[]>(() => {
    const initial = session.column_mapping ?? session.proposed_mapping ?? {};
    const columns = headers.map(() => "");
    for (const [field, column] of Object.entries(initial)) if (column < columns.length) columns[column] = field;
    return columns;
  });
  const [samples, setSamples] = useState<ImportCell[][]>([]);
  const [saveDefault, setSaveDefault] = useState(true);
  // fix-04: asked once the mapping leaves a choice (a stock and a price column); a revisited mapping keeps the answer.
  const [scopeChoice, setScopeChoice] = useState<ImportUpdateScope | null>(session.column_mapping ? session.options?.update_scope ?? null : null);
  const scopeName = useId();
  const [attempt, setAttempt] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api<{ rows: { raw: ImportCell[] }[] }>(`/api/store/imports/${session.id}/rows?sample=1`).then((result) => {
      if (!cancelled && result.ok) setSamples(result.body.rows.map((row) => row.raw));
    });
    return () => { cancelled = true; };
  }, [session.id]);

  const mapping = useMemo(() => {
    const result: ImportMapping = {};
    byColumn.forEach((field, column) => { if (field) result[field] = column; });
    return result;
  }, [byColumn]);
  const implied = impliedUpdateScope(mapping);
  const scope = implied ?? scopeChoice;
  const problems = mappingProblems(mapping, headers.length, scope);

  function choose(column: number, field: string) {
    // A field goes to one column only: picking it here frees it elsewhere.
    setByColumn((current) => current.map((value, index) => (index === column ? field : value === field && field ? "" : value)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (problems.length) {
      setShowErrors(true);
      setAttempt((value) => value + 1);
      return;
    }
    setBusy(true);
    await onSubmit(mapping, saveDefault, scope ?? "both");
    setBusy(false);
  }

  const used = new Set(byColumn.filter(Boolean));
  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <div className="grid gap-2">
        <h2 className="t-section">¿Qué dato tiene cada columna?</h2>
        <p className="t-body text-ink-2">
          Propusimos una opción para cada columna según su encabezado. Corrige lo que haga falta. Se necesita la columna de SKU o de
          nombre, y la de stock o la de precio; las columnas sin elegir no se importan.
        </p>
      </div>
      {session.file_warnings?.length ? (
        <Notice tone="info" title="Sobre el archivo">
          <ul className="grid gap-1">{session.file_warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </Notice>
      ) : null}
      <ErrorSummary
        title="Revisa las columnas"
        errors={showErrors ? problems.map((problem) => ({
          id: problem.field === "scope" ? `${scopeName}-0` : problem.field ? `columna-campo-${problem.field}` : "columna-0",
          message: problem.message,
        })) : []}
        attempt={attempt}
      />
      {implied ? null : (
        <fieldset className="grid gap-1 rounded-panel border border-subtle p-4">
          <legend className="px-1 t-ui font-semibold text-ink">¿Qué actualiza este archivo en los SKU que ya tienes?</legend>
          <p className="t-meta">Los SKU nuevos se crean con el stock y el precio del archivo. Nombre, variante y los demás datos se actualizan en los tres casos.</p>
          {IMPORT_UPDATE_SCOPES.map((option, index) => (
            <Radio
              key={option.value}
              id={`${scopeName}-${index}`}
              name={scopeName}
              value={option.value}
              checked={scopeChoice === option.value}
              onChange={() => setScopeChoice(option.value)}
              label={option.label}
              description={option.hint}
            />
          ))}
          {mapping.exported_at !== undefined ? (
            <p className="t-meta">
              Es una exportación de Laria: si registraste ventas o ajustes después de exportarla, se mantiene el stock de hoy de esos SKU.
            </p>
          ) : null}
        </fieldset>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {headers.map((header, column) => {
          const example = samples.map((row) => row[column]?.v ?? "").find((value) => value.trim());
          const field = byColumn[column];
          // ErrorSummary links point at the column that should hold a missing field: the first unassigned one.
          const anchorFor = problems.find((problem) => problem.field && !used.has(problem.field) && column === byColumn.findIndex((value) => !value));
          return (
            <li key={column} className="rounded-panel border border-subtle p-3">
              <Field
                id={anchorFor?.field ? `columna-campo-${anchorFor.field}` : `columna-${column}`}
                label={<span className="break-words">{header}</span>}
                hint={example ? `Ejemplo: ${example.slice(0, 60)}` : "Sin datos en las primeras filas"}
              >
                <Select value={field} onChange={(event) => choose(column, event.target.value)}>
                  <option value="">No importar</option>
                  <optgroup label="Datos del SKU">
                    {[...IMPORT_FIELDS, EXPORTED_AT_FIELD].map((option) => (
                      <option key={option.key} value={option.key}>{option.label}{used.has(option.key) && option.key !== field ? " (en otra columna)" : ""}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Atributos">
                    {IMPORT_ATTRIBUTE_FIELDS.map((option) => (
                      <option key={option.key} value={option.key}>{option.label}{used.has(option.key) && option.key !== field ? " (en otra columna)" : ""}</option>
                    ))}
                  </optgroup>
                </Select>
              </Field>
            </li>
          );
        })}
      </ul>
      <Checkbox
        checked={saveDefault}
        onChange={(event) => setSaveDefault(event.target.checked)}
        label="Recordar estas columnas para la próxima importación"
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={busy} loadingLabel="Guardando…">Revisar filas</Button>
        {onCancel ? <Button variant="secondary" onClick={onCancel}>Volver sin cambiar</Button> : null}
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ Revisar

const REVIEW_FILTERS: { key: RowFilter; label: string; count: (counts: Record<string, number>) => number }[] = [
  { key: "all", label: "Todas", count: (counts) => counts.total ?? 0 },
  { key: "create", label: "Nuevos SKU", count: (counts) => counts.create ?? 0 },
  { key: "update", label: "Actualizar", count: (counts) => counts.update ?? 0 },
  { key: "adopt_listing", label: "Vincular publicación", count: (counts) => counts.adopt_listing ?? 0 },
  { key: "error", label: "Con errores", count: (counts) => counts.error ?? 0 },
  { key: "warning", label: "Con advertencias", count: (counts) => counts.warnings ?? 0 },
  { key: "unchanged", label: "Sin cambios", count: (counts) => counts.unchanged ?? 0 },
  { key: "excluded", label: "Excluidas", count: (counts) => counts.excluded ?? 0 },
  { key: "since_export", label: "Con ventas después de exportar", count: (counts) => counts.since_export ?? 0 },
];

// fix-04: a re-imported export whose SKU had sales or adjustments after it was made. Today's stock is kept unless the
// store says it counted again; either way the choice re-reads the file with the same columns.
function SinceExportNotice({ counts, staleStock, onShow, onChoose }: {
  counts: Record<string, number>;
  staleStock: "keep" | "apply";
  onShow: () => void;
  onChoose: (choice: "keep" | "apply") => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const total = counts.since_export ?? 0;
  const choose = async (choice: "keep" | "apply") => {
    setBusy(true);
    await onChoose(choice);
    setBusy(false);
  };
  const keeping = staleStock === "keep";
  return (
    <div className={cn(noticeClassName(keeping ? "info" : "warning"), "grid gap-3")} role="status">
      <div className="flex items-start gap-2">
        <NoticeIcon tone={keeping ? "info" : "warning"} />
        <div className="grid gap-1">
          <p className="t-body font-semibold text-ink">
            {keeping
              ? `${plural(total, "SKU tuvo", "SKU tuvieron")} ventas o ajustes después de que exportaste el archivo`
              : `Usarás el stock del archivo en ${plural(total, "SKU", "SKU")} con ventas o ajustes posteriores`}
          </p>
          <p className="t-ui text-ink">
            {keeping
              ? "Mantuvimos su stock de hoy para no deshacer esas ventas. Si volviste a contar esos SKU, usa el stock del archivo."
              : "El stock del archivo reemplazará al de hoy aunque hubo ventas o ajustes después de exportarlo."}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onShow}>Ver esos SKU</Button>
        <Button size="sm" variant="quiet" loading={busy} loadingLabel="Revisando otra vez…" onClick={() => void choose(keeping ? "apply" : "keep")}>
          {keeping ? "Usar el stock del archivo" : "Mantener el stock de hoy"}
        </Button>
      </div>
    </div>
  );
}

function ReviewStep({ session, onDecision, onStaleStock, onBack, onContinue }: {
  session: ImportSession;
  onDecision: (rows: number[] | null, decision: "include" | "exclude") => Promise<boolean>;
  onStaleStock: (choice: "keep" | "apply") => Promise<boolean>;
  onBack: () => void;
  onContinue: () => void;
}) {
  const counts = session.counts ?? {};
  const [filter, setFilter] = useState<RowFilter>(counts.error ? "error" : "all");
  const toApply = (counts.create ?? 0) + (counts.update ?? 0) + (counts.adopt_listing ?? 0);
  // Reopened after a partial apply: the columns are locked (the database refuses IMPORT_MAPPING_LOCKED).
  const applied = counts.applied ?? 0;
  // Large files are long: the step's actions sit above the rows as well as after them (review fix B3).
  const actions = (
    <div className="flex flex-wrap gap-3">
      <Button onClick={onContinue} disabled={toApply === 0}>Continuar</Button>
      {applied ? null : <Button variant="secondary" onClick={onBack}>Cambiar columnas</Button>}
    </div>
  );
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <h2 className="t-section">Revisa los cambios</h2>
        <p className="t-body text-ink-2">
          {applied
            ? `${plural(applied, "fila ya se aplicó", "filas ya se aplicaron")}. Las que faltan se calcularon otra vez con los valores actuales; las filas con errores no se importan.`
            : "Todavía no se aplicó nada. Las filas con errores no se importan; corrige el archivo y súbelo otra vez, o continúa sin ellas."}
        </p>
      </div>
      {(counts.total ?? 0) > 10 ? actions : null}
      <Tiles items={[
        ["Nuevos SKU", counts.create ?? 0],
        ["Actualizar", counts.update ?? 0],
        ["Vincular publicación", counts.adopt_listing ?? 0],
        ["Sin cambios", counts.unchanged ?? 0],
        ["Con errores", counts.error ?? 0],
        ["Excluidas", counts.excluded ?? 0],
      ]} />
      {counts.since_export && !applied ? (
        <SinceExportNotice
          counts={counts}
          staleStock={session.options?.stale_stock ?? "keep"}
          onShow={() => setFilter("since_export")}
          onChoose={onStaleStock}
        />
      ) : null}
      {counts.publication_incomplete ? (
        <Notice tone="info" title={`${plural(counts.publication_incomplete, "SKU necesita", "SKU necesitan")} más datos para publicarse`}>
          <p>Se importan igual. Para publicarlos faltan datos como precio, condición, categoría, descripción o fotos.</p>
        </Notice>
      ) : null}
      <RowsList sessionId={session.id} filter={filter} onFilter={setFilter} counts={counts} editable onDecision={onDecision} version={session.version} />
      {actions}
      {toApply === 0 ? <p className="t-meta">No hay filas para aplicar. Revisa los errores o incluye filas excluidas.</p> : null}
    </div>
  );
}

function Tiles({ items }: { items: [string, number][] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-panel border border-subtle p-3">
          <dt className="t-meta">{label}</dt>
          <dd className="t-section tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function IssueLine({ issue }: { issue: ImportIssue }) {
  const icon = issue.severity === "error" ? <AlertCircle aria-hidden /> : issue.severity === "warning" ? <AlertTriangle aria-hidden /> : <Info aria-hidden />;
  return (
    <li className={cn("flex items-start gap-1.5 t-ui [&>svg]:mt-0.5 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0",
      issue.severity === "error" ? "font-semibold text-danger" : issue.severity === "warning" ? "text-ink" : "text-ink-2")}>
      {icon}
      <span>{issue.severity === "error" ? "Error: " : issue.severity === "warning" ? "Advertencia: " : ""}{issue.message}</span>
    </li>
  );
}

function RowsList({ sessionId, filter, onFilter, counts, editable, onDecision, version, filters = REVIEW_FILTERS }: {
  sessionId: string;
  filter: RowFilter;
  onFilter: (filter: RowFilter) => void;
  counts: Record<string, number>;
  editable: boolean;
  onDecision?: (rows: number[] | null, decision: "include" | "exclude") => Promise<boolean>;
  version: number;
  filters?: typeof REVIEW_FILTERS;
}) {
  const [rows, setRows] = useState<StagedRow[]>([]);
  const [nextAfter, setNextAfter] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingRow, setPendingRow] = useState<number | null>(null);
  const [category, setCategory] = useState("");
  const categoriesId = useId();
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const request = useRef(0);

  // Category chips (review fix B3): which categories the file has, counted once per session version.
  useEffect(() => {
    let cancelled = false;
    void api<{ categories: Record<string, number> }>(`/api/store/imports/${sessionId}/rows?categories=1`).then((result) => {
      if (!cancelled && result.ok) setCategoryCounts(result.body.categories);
    });
    return () => { cancelled = true; };
  }, [sessionId, version]);
  const categoryChips = importCategoryChips(categoryCounts);

  const load = useCallback(async (after: number) => {
    const id = ++request.current;
    setLoading(true);
    const categoryParam = category ? `&category=${encodeURIComponent(category)}` : "";
    const result = await api<{ rows: StagedRow[]; nextAfter: number | null }>(`/api/store/imports/${sessionId}/rows?filter=${filter}${categoryParam}&after=${after}&limit=50`);
    if (id !== request.current) return;
    setLoading(false);
    if (!result.ok) {
      setLoadError(result.message);
      return;
    }
    setLoadError(null);
    setRows((current) => (after ? [...current, ...result.body.rows] : result.body.rows));
    setNextAfter(result.body.nextAfter);
  }, [sessionId, filter, category]);

  // Reload from the top when the filter changes or a decision changed the session.
  useEffect(() => { void load(0); }, [load, version]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar filas">
        {filters.filter((option) => option.key === "all" || option.count(counts) > 0).map((option) => (
          <Chip key={option.key} selected={filter === option.key} onClick={() => onFilter(option.key)}>
            {option.label} ({option.count(counts)})
          </Chip>
        ))}
      </div>
      {categoryChips.length ? (
        <div className="grid gap-2">
          <p className="t-ui font-semibold text-ink" id={categoriesId}>Categoría</p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby={categoriesId}>
            <Chip selected={!category} onClick={() => setCategory("")}>Todas las categorías</Chip>
            {categoryChips.map((chip) => (
              <Chip key={chip.value} selected={category === chip.value} onClick={() => setCategory(category === chip.value ? "" : chip.value)}>
                {chip.label} ({chip.count})
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
      {editable && onDecision && (counts.excluded ?? 0) > 0 ? (
        <div><Button size="sm" variant="secondary" onClick={() => void onDecision(null, "include")}>Incluir todas las filas excluidas</Button></div>
      ) : null}
      <ul className="divide-y divide-subtle rounded-panel border border-subtle" aria-busy={loading || undefined}>
        {rows.map((row) => {
          const actionable = row.planned_action === "create" || row.planned_action === "update" || row.planned_action === "adopt_listing";
          const changes = describeChanges(row.changes);
          const result = resultLabel(row);
          return (
            <li key={row.row_number} className="grid gap-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="t-meta">Fila {row.row_number}</p>
                  <p className="t-body font-semibold break-words">{row.parsed?.product_name || row.parsed?.sku || row.sku_normalized || "Sin nombre"}</p>
                  {row.parsed?.sku || row.sku_normalized ? <p className="t-ui text-ink-2 break-all">SKU {row.parsed?.sku ?? row.sku_normalized}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.planned_action ? <Tag tone={ACTION_TONES[row.planned_action] ?? "neutral"}>{ACTION_LABELS[row.planned_action] ?? row.planned_action}</Tag> : null}
                  {!editable && actionable ? <Tag tone={row.commit_status === "applied" ? "accent" : row.commit_status === "pending" ? "line" : "danger"}>{result}</Tag> : null}
                  {editable && row.owner_decision === "exclude" && actionable ? <Tag tone="line">Excluida</Tag> : null}
                </div>
              </div>
              {changes.length ? <ul className="grid gap-0.5 t-ui text-ink">{changes.map((change) => <li key={change}>{change}</li>)}</ul> : null}
              {row.commit_message ? <p className="t-ui font-semibold text-danger">{row.commit_message}</p> : null}
              {row.issues.length ? <ul className="grid gap-1">{row.issues.map((issue, index) => <IssueLine key={`${issue.code}-${index}`} issue={issue} />)}</ul> : null}
              {editable && actionable && onDecision ? (
                <Checkbox
                  checked={row.owner_decision === "include"}
                  disabled={pendingRow === row.row_number}
                  onChange={async (event) => {
                    setPendingRow(row.row_number);
                    await onDecision([row.row_number], event.target.checked ? "include" : "exclude");
                    setPendingRow(null);
                  }}
                  label="Incluir esta fila"
                />
              ) : null}
            </li>
          );
        })}
        {!rows.length && !loading ? <li className="p-4 t-body text-ink-2">No hay filas en este filtro.</li> : null}
      </ul>
      {nextAfter !== null ? (
        <div><Button variant="secondary" loading={loading} loadingLabel="Cargando…" onClick={() => void load(nextAfter)}>Ver más filas</Button></div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ Confirmar

const SCOPE_CONFIRM: Record<ImportUpdateScope, string> = {
  prices: "Este archivo cambia precios y datos: el stock de tus SKU no cambia. Los SKU nuevos se crean con el stock del archivo.",
  stock: "El stock del archivo reemplaza al actual; los precios de tus SKU no cambian.",
  both: "El stock del archivo reemplaza al actual.",
};

function ConfirmStep({ session, scope, onBack, onConfirm }: { session: ImportSession; scope: ImportUpdateScope; onBack: () => void; onConfirm: () => Promise<boolean> }) {
  const counts = session.counts ?? {};
  const [busy, setBusy] = useState(false);
  const lines = [
    counts.create ? `Se crearán ${plural(counts.create, "SKU nuevo", "SKU nuevos")}.` : null,
    counts.update ? `Se actualizarán ${plural(counts.update, "SKU", "SKU")}.` : null,
    counts.adopt_listing ? `Se vincularán ${plural(counts.adopt_listing, "publicación", "publicaciones")} a su SKU.` : null,
    counts.stock_changes ? `Cambia el stock de ${plural(counts.stock_changes, "SKU", "SKU")}; cada cambio queda en el historial como ajuste por importación.` : null,
    counts.since_export_kept ? `Se mantiene el stock de hoy en ${plural(counts.since_export_kept, "SKU", "SKU")} con ventas o ajustes posteriores a la exportación.` : null,
    counts.error ? `${plural(counts.error, "fila con errores no se aplicará", "filas con errores no se aplicarán")}.` : null,
    counts.excluded ? `${plural(counts.excluded, "fila excluida no se aplicará", "filas excluidas no se aplicarán")}.` : null,
    session.photo_counts?.rows_ready ? `${plural(session.photo_counts.rows_ready, "SKU tiene", "SKU tienen")} sus fotos listas para publicarse.` : null,
  ].filter(Boolean) as string[];
  return (
    <div className="grid gap-5">
      <h2 className="t-section">Confirma la importación</h2>
      <ul className="grid list-disc gap-2 pl-5 t-body">{lines.map((line) => <li key={line}>{line}</li>)}</ul>
      <Notice tone="info">
        <p>
          {SCOPE_CONFIRM[scope]} Si registras una venta mientras se aplica, esa fila queda en conflicto y podrás revisarla con el
          valor nuevo; nunca se pisa una venta.
        </p>
      </Notice>
      <div className="flex flex-wrap gap-3">
        <Button loading={busy} loadingLabel="Aplicando…" onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}>
          Confirmar importación
        </Button>
        <Button variant="secondary" onClick={onBack}>Volver a revisar</Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Resultado

const RESULT_FILTERS: typeof REVIEW_FILTERS = [
  { key: "all", label: "Todas", count: (counts) => counts.total ?? 0 },
  { key: "applied", label: "Aplicadas", count: (counts) => counts.applied ?? 0 },
  { key: "conflict", label: "Con conflicto", count: (counts) => counts.conflict ?? 0 },
  { key: "failed", label: "No se pudieron aplicar", count: (counts) => counts.failed ?? 0 },
  { key: "error", label: "Con errores", count: (counts) => counts.error ?? 0 },
];

function ResultStep({ session, onReopen }: { session: ImportSession; onReopen: () => Promise<void> }) {
  const counts = session.result_summary ?? session.counts ?? {};
  const retryable = (counts.conflict ?? 0) + (counts.failed ?? 0);
  const [filter, setFilter] = useState<RowFilter>(retryable ? (counts.conflict ? "conflict" : "failed") : "all");
  const [busy, setBusy] = useState(false);
  const title = session.status === "committed"
    ? "Importación aplicada"
    : session.status === "partially_committed"
      ? "Importación aplicada en parte"
      : session.status === "cancelled" ? "Importación cancelada" : "Importación vencida";
  return (
    <div className="grid gap-5">
      <h2 className="t-section">{title}</h2>
      {session.status === "expired" ? <p className="t-body text-ink-2">Pasaron 7 días sin actividad y la importación se cerró sin aplicar cambios pendientes.</p> : null}
      <Tiles items={[
        ["Aplicadas", counts.applied ?? 0],
        ["Con conflicto", counts.conflict ?? 0],
        ["No se pudieron aplicar", counts.failed ?? 0],
        ["Con errores", counts.error ?? 0],
        ["Excluidas", counts.excluded ?? 0],
        ["Sin cambios", counts.unchanged ?? 0],
      ]} />
      {retryable && session.status === "partially_committed" ? (
        <Notice tone="warning" title={`${plural(retryable, "fila no se aplicó", "filas no se aplicaron")}`}>
          <p>
            El SKU cambió mientras se importaba (por ejemplo, registraste una venta) o no se pudo modificar. Revísalas: se
            calculan otra vez con los valores actuales antes de aplicarlas.
          </p>
          <p className="mt-3">
            <Button size="sm" variant="secondary" loading={busy} loadingLabel="Preparando…"
              onClick={async () => { setBusy(true); await onReopen(); setBusy(false); }}>
              Revisar filas no aplicadas
            </Button>
          </p>
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <a href={`/api/store/imports/${session.id}/report`} className={buttonClasses({ variant: "secondary" })}><Download aria-hidden />Descargar informe (CSV)</a>
        <Link href="/mi-cuenta/tienda/inventario" className={buttonClasses()}>Ir al inventario</Link>
      </div>
      {session.status === "committed" || session.status === "partially_committed" ? <ResultPhotos session={session} /> : null}
      {session.status === "committed" || session.status === "partially_committed" ? <ImportPublish sessionId={session.id} /> : null}
      {session.status === "committed" || session.status === "partially_committed" ? (
        <RowsList sessionId={session.id} filter={filter} onFilter={setFilter} counts={counts} editable={false} version={session.version} filters={RESULT_FILTERS} />
      ) : null}
      <p className="t-ui"><Link href="/mi-cuenta/tienda/inventario/importar" className="link font-semibold">Nueva importación</Link></p>
    </div>
  );
}

// After the commit the photos can still be added or corrected until the import's staged rows are cleaned up (30 days),
// so publication (STORE-3b) can use them.
function ResultPhotos({ session }: { session: ImportSession }) {
  const [open, setOpen] = useState(false);
  const ready = session.photo_counts?.rows_ready ?? 0;
  return (
    <div className="grid gap-4 rounded-panel border border-subtle p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="t-body">
          {ready ? `${plural(ready, "SKU tiene", "SKU tienen")} sus fotos listas.` : "Todavía no hay SKU con fotos listas."}
        </p>
        <Button size="sm" variant="secondary" onClick={() => setOpen((value) => !value)}>{open ? "Ocultar fotos" : "Revisar fotos"}</Button>
      </div>
      {open ? <ImportPhotos sessionId={session.id} /> : null}
    </div>
  );
}
