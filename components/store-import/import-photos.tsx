"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ImageUp, RotateCcw, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ErrorSummary } from "@/components/ui/error-summary";
import { Field, FileInput, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Tag } from "@/components/ui/tag";
import {
  PHOTO_MAX_FILE_BYTES,
  PHOTO_MAX_FILES,
  PHOTO_SLOT_BATCH,
  SKIP_LABELS,
  baseName,
  isManifestName,
  parseManifest,
  photoEntryProblem,
  photoTypeFromName,
  readPhotoArchive,
  type ArchiveSkip,
  type ManifestEntry,
  type PhotoMimeType,
} from "@/lib/store-import/photo-files";
import { PHOTO_ISSUE_LABELS, PHOTO_REJECT_LABELS, PHOTO_ROW_STATES, PHOTO_SOURCE_LABELS } from "@/lib/store-import/photo-labels";
import type { PhotoAsset, PhotoRow, PhotoView } from "@/lib/store-import/photos-server";
import { cn } from "@/lib/utils";
import { sendPhotoBatch, type PendingPhoto } from "./photo-upload";

// The Fotos step of the import wizard (design §8, §13.4). Photos are read in this browser, one at a time (a ZIP is
// opened here, never on the server), re-encoded to JPEG when the browser can (drops location data, ≤ 2400 px), and
// sent to the paths the server issues. The server checks each one and places it by SKU__NN name, the Foto(s) column
// or a manifest; ambiguous cases are left for the merchant, never guessed.

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

type Progress = { sent: number; total: number | null; phase: string };

// ------------------------------------------------------------------ the step

export function ImportPhotos({ sessionId, onBack, onContinue, continueLabel = "Continuar" }: {
  sessionId: string;
  onBack?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
}) {
  const [view, setView] = useState<PhotoView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [errorAttempt, setErrorAttempt] = useState(0);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [skipped, setSkipped] = useState<ArchiveSkip[]>([]);
  const [busyAsset, setBusyAsset] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(async () => {
    const result = await api<PhotoView>(`/api/store/imports/${sessionId}/photos`);
    if (!result.ok) {
      setLoadError(result.message);
      return;
    }
    setLoadError(null);
    setView(result.body);
  }, [sessionId]);

  useEffect(() => { void load(); }, [load]);

  const fail = useCallback((message: string) => {
    setActionError(message);
    setErrorAttempt((value) => value + 1);
  }, []);

  async function act(body: Record<string, unknown>, assetId?: string) {
    setActionError(null);
    setBusyAsset(assetId ?? "all");
    const result = await api(`/api/store/imports/${sessionId}/photos`, body);
    setBusyAsset(null);
    if (!result.ok) fail(result.message);
    await load();
    return result.ok;
  }

  const sendBatch = (batch: PendingPhoto[], manifest: Map<string, ManifestEntry>) => sendPhotoBatch(sessionId, batch, manifest);

  async function upload(files: File[]) {
    setActionError(null);
    setSkipped([]);
    const notes: ArchiveSkip[] = [];
    const manifest = new Map<string, ManifestEntry>();
    const archives: File[] = [];
    const photos: File[] = [];
    for (const file of files) {
      if (/\.zip$/i.test(file.name)) archives.push(file);
      else if (isManifestName(file.name)) {
        if (file.size > 1024 * 1024) notes.push({ name: file.name, reason: "too_large" });
        else {
          const parsed = parseManifest(await file.text());
          parsed.entries.forEach((entry, name) => manifest.set(name, entry));
        }
      } else {
        const problem = photoEntryProblem(file.name);
        if (problem === "directory" || problem === "hidden") continue;
        if (problem) notes.push({ name: baseName(file.name), reason: problem });
        else if (file.size > PHOTO_MAX_FILE_BYTES) notes.push({ name: baseName(file.name), reason: "too_large" });
        else photos.push(file);
      }
    }

    let remaining = PHOTO_MAX_FILES - (view?.counts.total ?? 0);
    let sent = 0;
    const totalKnown = archives.length ? null : photos.length;
    let batch: PendingPhoto[] = [];
    const flush = async () => {
      if (!batch.length) return;
      const current = batch;
      batch = [];
      setProgress({ sent, total: totalKnown, phase: "Subiendo y revisando fotos…" });
      await sendBatch(current, manifest);
      sent += current.length;
      setProgress({ sent, total: totalKnown, phase: "Subiendo y revisando fotos…" });
    };

    setProgress({ sent: 0, total: totalKnown, phase: "Preparando fotos…" });
    try {
      for (const file of photos) {
        if (remaining <= 0) {
          notes.push({ name: baseName(file.name), reason: "over_limit" });
          continue;
        }
        remaining -= 1;
        batch.push({ name: baseName(file.name), type: (photoTypeFromName(file.name) ?? file.type) as PhotoMimeType, data: file });
        if (batch.length >= PHOTO_SLOT_BATCH) await flush();
      }
      for (const archive of archives) {
        const result = await readPhotoArchive(archive.stream(), {
          remaining,
          onPhoto: async (photo) => {
            remaining -= 1;
            batch.push({ name: photo.name, type: photo.type, data: new Blob([photo.data as BlobPart], { type: photo.type }) });
            if (batch.length >= PHOTO_SLOT_BATCH) await flush();
          },
        });
        notes.push(...result.skipped);
        if (result.invalid) notes.push({ name: archive.name, reason: "unreadable" });
      }
      await flush();
    } catch (error) {
      fail(error instanceof Error && error.message ? error.message : NETWORK_MESSAGE);
    } finally {
      setProgress(null);
      setSkipped(notes);
      await load();
    }
  }

  if (!view) {
    return loadError ? (
      <Notice tone="danger" title="No pudimos cargar las fotos">
        <p>{loadError}</p>
        <p className="mt-3"><Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button></p>
      </Notice>
    ) : <p className="t-body text-ink-2" aria-live="polite">Cargando fotos…</p>;
  }

  return (
    <div className="grid gap-6">
      {confirmDialog}
      <div className="grid gap-2">
        <h2 className="t-section">Fotos</h2>
        <p className="t-body text-ink-2">
          Opcional. Cada SKU necesita de 2 a 10 fotos para publicarse; el inventario se importa igual sin ellas.
        </p>
      </div>
      {onContinue && view.rows.length > 10 ? (
        <div className="flex flex-wrap gap-3">
          <Button onClick={onContinue} disabled={Boolean(progress)}>{continueLabel}</Button>
        </div>
      ) : null}
      <ErrorSummary title="No pudimos completar la acción" errors={actionError ? [{ id: "fotos-subir", message: actionError }] : []} attempt={errorAttempt} />

      {view.accepting ? <UploadForm busy={Boolean(progress)} onUpload={upload} /> : (
        <Notice tone="info"><p>Esta importación ya no acepta cambios de fotos.</p></Notice>
      )}
      {progress ? <UploadProgress progress={progress} /> : null}
      {skipped.length ? <SkippedList items={skipped} /> : null}

      <Summary view={view} />
      <RowsWithPhotos
        sessionId={sessionId}
        view={view}
        disabled={!view.accepting || Boolean(progress)}
        busyAsset={busyAsset}
        onPlace={(asset, row) => act({ action: "place", assetId: asset.id, row }, asset.id)}
        onOrder={(row, assetIds) => act({ action: "order", row, assetIds }, assetIds[0])}
      />
      <SetAside
        sessionId={sessionId}
        view={view}
        disabled={!view.accepting || Boolean(progress)}
        busyAsset={busyAsset}
        onPlace={(asset, row) => act({ action: "place", assetId: asset.id, row }, asset.id)}
      />
      <Rejected assets={view.assets} />

      <div className="flex flex-wrap gap-3">
        {onContinue ? <Button onClick={onContinue} disabled={Boolean(progress)}>{continueLabel}</Button> : null}
        {onBack ? <Button variant="secondary" onClick={onBack} disabled={Boolean(progress)}>Volver a revisar</Button> : null}
        {view.accepting && view.assets.some((asset) => asset.placement === "manual") ? (
          <Button
            variant="quiet"
            icon={<RotateCcw aria-hidden />}
            disabled={Boolean(progress) || busyAsset !== null}
            onClick={async () => {
              const ok = await confirm({
                title: "¿Asignar todo de nuevo?",
                body: "Se deshacen tus cambios manuales y las fotos se asignan otra vez según su nombre, la columna Foto(s) y la lista de fotos.",
                confirmLabel: "Asignar de nuevo",
                cancelLabel: "Mantener mis cambios",
              });
              if (ok) await act({ action: "reset" });
            }}
          >
            Asignar de nuevo automáticamente
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function UploadForm({ busy, onUpload }: { busy: boolean; onUpload: (files: File[]) => Promise<void> }) {
  const [files, setFiles] = useState<File[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!files.length) {
      setProblem("Elige fotos, un archivo ZIP o ambos.");
      return;
    }
    setProblem(null);
    await onUpload(files);
    setFiles([]);
    (event.target as HTMLFormElement).reset();
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 rounded-panel border border-subtle p-4">
      <Field
        id="fotos-subir"
        label="Fotos o archivo ZIP"
        hint="JPG, PNG o WebP de hasta 5 MB cada una; hasta 600 por importación. Puedes elegir varias fotos a la vez, un ZIP, y una lista de fotos (.csv)."
        error={problem ?? undefined}
      >
        <FileInput
          multiple
          accept=".jpg,.jpeg,.png,.webp,.zip,.csv,image/jpeg,image/png,image/webp,application/zip,text/csv"
          onChange={(event) => { setFiles(Array.from(event.target.files ?? [])); setProblem(null); }}
        />
      </Field>
      <details className="t-ui text-ink-2">
        <summary className="cursor-pointer font-semibold text-ink">Cómo se asignan las fotos a cada SKU</summary>
        <ul className="mt-2 grid list-disc gap-1 pl-5">
          <li>Por nombre: el SKU, dos guiones bajos y el número de foto. Ejemplo: <span className="font-semibold">DS1-004__01.jpg</span>, <span className="font-semibold">DS1-004__02.jpg</span>.</li>
          <li>Por la columna Foto(s) del archivo: los nombres de las fotos separados por punto y coma, en el orden en que se muestran.</li>
          <li>Por una lista de fotos (.csv) con tres columnas: archivo;SKU;orden.</li>
          <li>Si dos fotos piden el mismo lugar, ese SKU queda por revisar. Nunca adivinamos por la imagen.</li>
        </ul>
      </details>
      <div>
        <Button type="submit" variant="secondary" icon={<ImageUp aria-hidden />} loading={busy} loadingLabel="Subiendo fotos…">Subir fotos</Button>
      </div>
    </form>
  );
}

function UploadProgress({ progress }: { progress: Progress }) {
  const percent = progress.total ? Math.round((progress.sent / progress.total) * 100) : null;
  return (
    <div className="grid gap-3 rounded-panel border border-subtle p-4" aria-live="polite">
      <p className="t-body font-semibold" id="fotos-progreso">
        {progress.phase} {progress.total ? `${progress.sent} de ${progress.total}` : plural(progress.sent, "foto enviada", "fotos enviadas")}
      </p>
      <div
        role="progressbar"
        aria-labelledby="fotos-progreso"
        aria-valuemin={percent === null ? undefined : 0}
        aria-valuemax={percent === null ? undefined : 100}
        aria-valuenow={percent ?? undefined}
        className="h-2 overflow-hidden rounded-full bg-subtle"
      >
        <div className={cn("h-full bg-ink transition-[width]", percent === null && "w-full bg-line-strong")} style={percent === null ? undefined : { width: `${Math.max(percent, 3)}%` }} />
      </div>
      <p className="t-meta">No cierres esta página hasta que termine. Lo que ya se subió se conserva.</p>
    </div>
  );
}

function SkippedList({ items }: { items: ArchiveSkip[] }) {
  return (
    <Notice tone="warning" title={plural(items.length, "archivo no se subió", "archivos no se subieron")}>
      <ul className="grid gap-1">
        {items.slice(0, 20).map((item, index) => (
          <li key={`${item.name}-${index}`} className="break-all"><span className="font-semibold">{item.name}</span>: {SKIP_LABELS[item.reason]}</li>
        ))}
        {items.length > 20 ? <li>y {items.length - 20} más.</li> : null}
      </ul>
    </Notice>
  );
}

function Summary({ view }: { view: PhotoView }) {
  const counts = view.counts;
  const review = (counts.rows_blocked ?? 0) + (counts.rows_too_many ?? 0) + (counts.rows_too_few ?? 0);
  const items: [string, number][] = [
    ["Fotos válidas", counts.validated ?? 0],
    ["SKU con fotos listas", counts.rows_ready ?? 0],
    ["SKU por revisar", review],
    ["Fotos sin asignar", counts.set_aside ?? 0],
    ["Fotos rechazadas", counts.rejected ?? 0],
  ];
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

function rowLabel(row: PhotoRow) {
  return [row.sku ? `SKU ${row.sku}` : `Fila ${row.row_number}`, row.name].filter(Boolean).join(" · ");
}

function Thumb({ sessionId, asset, className }: { sessionId: string; asset: PhotoAsset; className?: string }) {
  return (
    <Image
      src={`/api/store/imports/${sessionId}/photos/${asset.id}`}
      alt={asset.original_name}
      width={160}
      height={160}
      unoptimized
      className={cn("aspect-square w-full rounded-control border border-subtle bg-subtle object-cover", className)}
    />
  );
}

// One "move to" panel at a time: a select of every row would be too heavy on each card.
function MovePanel({ rows, current, onMove, onCancel, busy }: {
  rows: PhotoRow[];
  current: number | null;
  onMove: (row: number) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const options = useMemo(() => rows.filter((row) => row.row_number !== current && row.photo_count < 10), [rows, current]);
  const [target, setTarget] = useState<string>("");
  return (
    <div className="grid gap-2 rounded-control border border-line-strong bg-surface p-3">
      <Field id="fotos-mover" label="Mover a">
        <Select value={target} onChange={(event) => setTarget(event.target.value)}>
          <option value="">Elige un SKU</option>
          {options.map((row) => <option key={row.row_number} value={row.row_number}>{rowLabel(row)}</option>)}
        </Select>
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={!target} loading={busy} loadingLabel="Moviendo…" onClick={() => onMove(Number(target))}>Mover</Button>
        <Button size="sm" variant="quiet" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

type RowFilter = "review" | "ready" | "all";

function RowsWithPhotos({ sessionId, view, disabled, busyAsset, onPlace, onOrder }: {
  sessionId: string;
  view: PhotoView;
  disabled: boolean;
  busyAsset: string | null;
  onPlace: (asset: PhotoAsset, row: number | null) => Promise<boolean>;
  onOrder: (row: number, assetIds: string[]) => Promise<boolean>;
}) {
  const [filter, setFilter] = useState<RowFilter>("review");
  const [limit, setLimit] = useState(ROWS_PAGE);
  const [moving, setMoving] = useState<string | null>(null);
  const byRow = useMemo(() => {
    const map = new Map<number, PhotoAsset[]>();
    for (const asset of view.assets) {
      if (asset.row_number === null) continue;
      map.set(asset.row_number, [...(map.get(asset.row_number) ?? []), asset]);
    }
    map.forEach((assets) => assets.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
    return map;
  }, [view.assets]);
  const shown = view.rows.filter((row) => row.photo_count > 0 || (row.photo_state && row.photo_state !== "none"));
  const review = shown.filter((row) => row.photo_state !== "ready");
  const ready = shown.filter((row) => row.photo_state === "ready");
  const active = filter === "all" ? shown : filter === "ready" ? ready : review;
  const effective = active.length || filter !== "review" ? filter : "all";
  const list = effective === "all" ? shown : effective === "ready" ? ready : review;
  const withoutPhotos = view.rows.filter((row) => row.photo_count === 0 && row.planned_action !== "error").length;

  if (!shown.length) {
    return withoutPhotos ? <p className="t-body text-ink-2">Todavía no hay fotos asignadas a ningún SKU.</p> : null;
  }

  return (
    <section className="grid gap-3" aria-labelledby="fotos-por-sku">
      <h3 id="fotos-por-sku" className="t-body font-semibold">Fotos por SKU</h3>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar SKU">
        {review.length ? <Chip selected={effective === "review"} onClick={() => setFilter("review")}>Por revisar ({review.length})</Chip> : null}
        <Chip selected={effective === "ready"} onClick={() => setFilter("ready")}>Listas ({ready.length})</Chip>
        <Chip selected={effective === "all"} onClick={() => setFilter("all")}>Todas ({shown.length})</Chip>
      </div>
      {withoutPhotos ? <p className="t-meta">{plural(withoutPhotos, "SKU no tiene", "SKU no tienen")} fotos; se importan igual, pero no se pueden publicar.</p> : null}
      <ul className="divide-y divide-subtle rounded-panel border border-subtle">
        {list.slice(0, limit).map((row) => {
          const assets = byRow.get(row.row_number) ?? [];
          const state = PHOTO_ROW_STATES[row.photo_state ?? "none"] ?? PHOTO_ROW_STATES.none;
          const claimants = view.assets.filter((asset) => asset.row_number === null && asset.target_row_number === row.row_number
            && (asset.match_issue === "duplicate_sequence" || asset.match_issue === "over_limit"));
          return (
            <li key={row.row_number} className="grid gap-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="t-body min-w-0 font-semibold break-words">{rowLabel(row)}</p>
                <Tag tone={state.tone}>{state.label}</Tag>
              </div>
              {claimants.length ? (
                <p className="t-ui text-danger">
                  {row.photo_state === "too_many"
                    ? `${plural(claimants.length, "foto más quedó", "fotos más quedaron")} fuera (están en Fotos sin asignar). Quita alguna de este SKU o marca las que sobran con No usar.`
                    : `${plural(claimants.length, "foto pide", "fotos piden")} el mismo número. En Fotos sin asignar, asigna la que va y marca la otra con No usar.`}
                </p>
              ) : null}
              {assets.length ? (
                <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                  {assets.map((asset, index) => (
                    <li key={asset.id} className="grid content-start gap-2">
                      <div className="relative">
                        <Thumb sessionId={sessionId} asset={asset} />
                        <span className="absolute left-1 top-1 rounded-control bg-ink px-1.5 text-[12px] font-semibold text-surface">{index + 1}</span>
                      </div>
                      <p className="t-meta break-all">{asset.original_name}</p>
                      {!disabled ? (
                        <div className="flex flex-wrap gap-1">
                          <IconButton size="sm" label={`Mover ${asset.original_name} antes`} icon={<ArrowLeft aria-hidden />} disabled={index === 0 || busyAsset !== null}
                            onClick={() => void onOrder(row.row_number, swap(assets.map((a) => a.id), index, index - 1))} />
                          <IconButton size="sm" label={`Mover ${asset.original_name} después`} icon={<ArrowRight aria-hidden />} disabled={index === assets.length - 1 || busyAsset !== null}
                            onClick={() => void onOrder(row.row_number, swap(assets.map((a) => a.id), index, index + 1))} />
                          <IconButton size="sm" label={`Quitar ${asset.original_name}`} icon={<X aria-hidden />} disabled={busyAsset !== null}
                            onClick={() => void onPlace(asset, null)} />
                          <Button size="sm" variant="quiet" disabled={busyAsset !== null} onClick={() => setMoving(moving === asset.id ? null : asset.id)}>Cambiar de SKU</Button>
                        </div>
                      ) : null}
                      {moving === asset.id ? (
                        <MovePanel rows={view.rows} current={row.row_number} busy={busyAsset === asset.id}
                          onCancel={() => setMoving(null)}
                          onMove={async (target) => { if (await onPlace(asset, target)) setMoving(null); }} />
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ul>
      {list.length > limit ? <div><Button variant="secondary" onClick={() => setLimit((value) => value + ROWS_PAGE)}>Ver más SKU</Button></div> : null}
    </section>
  );
}

function swap(ids: string[], from: number, to: number) {
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

function SetAside({ sessionId, view, disabled, busyAsset, onPlace }: {
  sessionId: string;
  view: PhotoView;
  disabled: boolean;
  busyAsset: string | null;
  onPlace: (asset: PhotoAsset, row: number | null) => Promise<boolean>;
}) {
  const [moving, setMoving] = useState<string | null>(null);
  const [limit, setLimit] = useState(24);
  const assets = view.assets.filter((asset) => asset.status === "validated" && asset.row_number === null);
  if (!assets.length) return null;
  return (
    <section className="grid gap-3" aria-labelledby="fotos-sin-asignar">
      <h3 id="fotos-sin-asignar" className="t-body font-semibold">Fotos sin asignar ({assets.length})</h3>
      <p className="t-ui text-ink-2">No se usan en ninguna publicación hasta que las asignes a un SKU.</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {assets.slice(0, limit).map((asset) => (
          <li key={asset.id} className="grid content-start gap-2">
            <Thumb sessionId={sessionId} asset={asset} />
            <p className="t-meta break-all">{asset.original_name}</p>
            <p className="t-ui text-ink">{PHOTO_ISSUE_LABELS[asset.match_issue ?? ""] ?? "Sin asignar"}</p>
            {asset.match_note === "explicit_over_filename" ? <p className="t-meta">{PHOTO_SOURCE_LABELS.column}</p> : null}
            {!disabled ? (
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="secondary" disabled={busyAsset !== null} onClick={() => setMoving(moving === asset.id ? null : asset.id)}>Asignar a un SKU</Button>
                {asset.match_issue !== "removed" ? (
                  <Button size="sm" variant="quiet" disabled={busyAsset !== null} onClick={() => void onPlace(asset, null)}>No usar</Button>
                ) : null}
              </div>
            ) : null}
            {moving === asset.id ? (
              <MovePanel rows={view.rows} current={null} busy={busyAsset === asset.id}
                onCancel={() => setMoving(null)}
                onMove={async (target) => { if (await onPlace(asset, target)) setMoving(null); }} />
            ) : null}
          </li>
        ))}
      </ul>
      {assets.length > limit ? <div><Button variant="secondary" onClick={() => setLimit((value) => value + 24)}>Ver más fotos</Button></div> : null}
    </section>
  );
}

function Rejected({ assets }: { assets: PhotoAsset[] }) {
  const rejected = assets.filter((asset) => asset.status === "rejected");
  const waiting = assets.filter((asset) => asset.status === "awaiting_upload");
  if (!rejected.length && !waiting.length) return null;
  return (
    <section className="grid gap-3" aria-labelledby="fotos-rechazadas">
      <h3 id="fotos-rechazadas" className="t-body font-semibold">Fotos que no se pudieron usar</h3>
      <ul className="grid gap-1 t-ui">
        {rejected.slice(0, 50).map((asset) => (
          <li key={asset.id} className="break-all"><span className="font-semibold">{asset.original_name}</span>: {PHOTO_REJECT_LABELS[asset.reject_code ?? ""] ?? PHOTO_REJECT_LABELS.PHOTO_INVALID}</li>
        ))}
        {waiting.length ? <li>{plural(waiting.length, "foto no terminó", "fotos no terminaron")} de subirse. Vuelve a elegirlas para subirlas otra vez.</li> : null}
      </ul>
    </section>
  );
}
