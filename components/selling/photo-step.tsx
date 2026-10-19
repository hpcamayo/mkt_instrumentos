"use client";

import Image from "next/image";
import { Camera, Check, GripVertical, ImagePlus, Loader2, RotateCcw, Star } from "lucide-react";
import { useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from "react";
import { PHOTO_ACCEPT } from "@/components/selling/prepare-photo";
import { buttonClasses } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { MAX_LISTING_PHOTOS, MIN_LISTING_PHOTOS } from "@/lib/listing-submission";
import type { Shot } from "@/lib/sell-guidance";
import { cn } from "@/lib/utils";

// Step 1 of the sell form (big-06, POST 03–06): photos first, on phones from the camera. Each photo shrinks and
// uploads as soon as it is added while the seller goes on; the shot list says which photos buyers need; tiles reorder
// by dragging the handle or with the buttons, any photo can become the main one, and any photo can be removed (the
// two-photo minimum is checked when publishing, not by disabling Quitar).

export type FormPhoto = {
  key: string;
  slot: number;
  url: string;
  path?: string;
  status: "preparing" | "uploading" | "done" | "error";
  progress: number;
  shot?: string;
  dark?: boolean;
  error?: string;
};

type Props = {
  id: string;
  photos: FormPhoto[];
  shots: Shot[];
  error?: string;
  hint?: string;
  disabled?: boolean;
  onAdd: (files: File[], shot?: string) => void;
  onReplace: (index: number, file: File) => void;
  onRemove: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onRetry: (index: number) => void;
};

export function PhotoStep({ id, photos, shots, error, hint, disabled, onAdd, onReplace, onRemove, onMove, onRetry }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const shotInput = useRef<HTMLInputElement>(null);
  const pendingShot = useRef<string | undefined>(undefined);
  const taken = new Set(photos.map((photo) => photo.shot).filter(Boolean));
  const room = MAX_LISTING_PHOTOS - photos.length;

  function pick(event: ChangeEvent<HTMLInputElement>, shot?: string) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length) onAdd(files, shot);
  }

  function takeShot(shot: Shot) {
    pendingShot.current = shot.id;
    shotInput.current?.click();
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length && !disabled) onAdd(files);
  }

  // Reorder by dragging a tile's handle: the tile under the pointer takes its place as it moves. Works with mouse,
  // pen and touch (pointer events); Anterior/Siguiente and "Usar como principal" do the same with one press.
  function startDrag(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(index);
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    if (dragging === null) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-photo-index]");
    const over = target ? Number(target.dataset.photoIndex) : null;
    if (over !== null && over !== dragging) {
      onMove(dragging, over);
      setDragging(over);
    }
  }
  function endDrag() {
    setDragging(null);
  }

  return (
    <div className="grid min-w-0 gap-4">
      <div>
        <p className="t-ui font-semibold text-ink">Fotos que los compradores buscan</p>
        <p className="t-meta">Toca una para tomarla o elegirla. Entre {MIN_LISTING_PHOTOS} y {MAX_LISTING_PHOTOS} fotos; la primera es la principal.</p>
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Lista de fotos sugeridas">
          {shots.map((shot) => {
            const done = taken.has(shot.id);
            return (
              <li key={shot.id}>
                <button
                  type="button"
                  disabled={disabled || (!done && room <= 0)}
                  onClick={() => takeShot(shot)}
                  title={shot.hint}
                  aria-label={done ? `${shot.label}: lista. Agregar otra` : `Agregar foto: ${shot.label}. ${shot.hint}`}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-[14px] font-semibold leading-5 text-ink transition-colors duration-120 disabled:cursor-not-allowed disabled:text-ink-3",
                    done ? "bg-accent-tint" : "border border-dashed border-line-strong bg-surface hover:bg-canvas",
                  )}
                >
                  {done ? <Check className="h-4 w-4" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
                  {shot.label}
                </button>
              </li>
            );
          })}
        </ul>
        <input ref={shotInput} type="file" accept={PHOTO_ACCEPT} capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(event) => pick(event, pendingShot.current)} />
      </div>

      <div
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={drop}
        className={cn("grid gap-3 rounded-panel border border-dashed p-4", dragOver ? "border-ink bg-accent-tint" : "border-line-strong bg-canvas")}
      >
        <div className="flex flex-wrap items-center gap-3">
          {/* Phones open the camera directly; the gallery stays one tap away. */}
          <label className={buttonClasses({ variant: "primary", className: "hidden cursor-pointer [@media(pointer:coarse)]:inline-flex" })}>
            <Camera aria-hidden />
            Tomar foto
            <input type="file" accept={PHOTO_ACCEPT} capture="environment" disabled={disabled || room <= 0} className="sr-only" onChange={pick} />
          </label>
          <label className={buttonClasses({ variant: "secondary", className: "cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink" })}>
            <ImagePlus aria-hidden />
            <span className="[@media(pointer:coarse)]:hidden">Elegir fotos</span>
            <span className="hidden [@media(pointer:coarse)]:inline">Elegir de la galería</span>
            <input id={id} type="file" accept={PHOTO_ACCEPT} multiple disabled={disabled || room <= 0} className="sr-only" onChange={pick} aria-describedby={error ? `${id}-error` : `${id}-ayuda`} aria-invalid={error ? true : undefined} />
          </label>
          <p className="t-meta [@media(pointer:coarse)]:hidden">o arrástralas aquí</p>
        </div>
        <p id={`${id}-ayuda`} className="t-meta">{hint ?? "JPEG, PNG, WebP o HEIC del iPhone. Las reducimos y les quitamos los datos de ubicación; se suben mientras completas lo demás."}</p>
        {error ? <p id={`${id}-error`} className="t-ui font-semibold text-danger">{error}</p> : null}
      </div>

      {photos.length ? (
        <ol className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Fotos de la publicación">
          {photos.map((photo, index) => {
            const shot = shots.find((item) => item.id === photo.shot);
            return (
              <li
                key={photo.key}
                data-photo-index={index}
                // Phones: a row per photo (thumbnail beside its buttons); wider screens: tiles.
                className={cn("grid min-w-0 grid-cols-[88px_minmax(0,1fr)] items-start gap-3 rounded-panel border bg-surface p-2 sm:grid-cols-1 sm:gap-2", dragging === index ? "border-ink shadow-level-1" : "border-subtle")}
              >
                <div className="relative aspect-square overflow-hidden rounded-control bg-canvas">
                  <Image src={photo.url} alt={`Foto ${index + 1}`} fill unoptimized sizes="200px" className="object-cover" />
                  {index === 0 ? <Tag tone="solid" className="absolute left-1.5 top-1.5 max-sm:hidden">Principal</Tag> : null}
                  <button
                    type="button"
                    onPointerDown={(event) => startDrag(event, index)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    aria-label={`Arrastrar para reordenar la foto ${index + 1}`}
                    className="absolute right-1.5 top-1.5 grid h-9 w-9 touch-none cursor-grab place-items-center rounded-control bg-surface/90 text-ink active:cursor-grabbing"
                  >
                    <GripVertical className="h-5 w-5" aria-hidden />
                  </button>
                  <UploadState photo={photo} />
                </div>
                <div className="grid min-w-0 gap-2">
                <p className="t-meta font-semibold">
                  Foto {index + 1}{index === 0 ? <span className="sm:hidden"> · Principal</span> : null}{shot ? ` · ${shot.label}` : ""}
                </p>
                {photo.dark ? <p className="t-meta text-ink">Esta foto se ve oscura. Con más luz se aprecia mejor el instrumento.</p> : null}
                {photo.status === "error" ? (
                  <button type="button" onClick={() => onRetry(index)} className={buttonClasses({ variant: "secondary", size: "sm", className: "min-h-11" })}>
                    <RotateCcw aria-hidden />Reintentar
                  </button>
                ) : null}
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" disabled={disabled || index === 0} aria-label={`Mover foto ${index + 1} antes`} onClick={() => onMove(index, index - 1)} className={buttonClasses({ variant: "secondary", size: "sm", className: "min-h-11 px-2" })}>Anterior</button>
                  <button type="button" disabled={disabled || index === photos.length - 1} aria-label={`Mover foto ${index + 1} después`} onClick={() => onMove(index, index + 1)} className={buttonClasses({ variant: "secondary", size: "sm", className: "min-h-11 px-2" })}>Siguiente</button>
                  {index > 0 ? (
                    <button type="button" disabled={disabled} aria-label={`Usar foto ${index + 1} como principal`} onClick={() => onMove(index, 0)} className={buttonClasses({ variant: "secondary", size: "sm", className: "col-span-2 min-h-11 px-2" })}>
                      <Star aria-hidden />Usar como principal
                    </button>
                  ) : null}
                  <label className={buttonClasses({ variant: "secondary", size: "sm", className: "min-h-11 cursor-pointer px-1 text-[13px]" })}>
                    Reemplazar
                    <input type="file" disabled={disabled} aria-label={`Reemplazar foto ${index + 1}`} accept={PHOTO_ACCEPT} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onReplace(index, file); }} />
                  </label>
                  <button type="button" disabled={disabled} aria-label={`Quitar foto ${index + 1}`} onClick={() => onRemove(index)} className={buttonClasses({ variant: "danger", size: "sm", className: "min-h-11 px-2" })}>Quitar</button>
                </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      <p className="t-meta font-semibold" role="status">{photoSummary(photos)}</p>
    </div>
  );
}

function UploadState({ photo }: { photo: FormPhoto }) {
  if (photo.status === "done") {
    return (
      <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-tag bg-surface/90 px-1.5 py-0.5 text-[12px] font-semibold leading-4 text-ink">
        <Check className="h-3.5 w-3.5" aria-hidden />Subida
      </span>
    );
  }
  if (photo.status === "error") {
    return <span className="absolute inset-x-1.5 bottom-1.5 rounded-tag bg-danger-tint px-1.5 py-0.5 text-[12px] font-semibold leading-4 text-danger">{photo.error ?? "No se subió"}</span>;
  }
  const percent = Math.round(photo.progress * 100);
  return (
    <span className="absolute inset-x-1.5 bottom-1.5 grid gap-1 rounded-tag bg-surface/90 px-1.5 py-1 text-[12px] font-semibold leading-4 text-ink">
      <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />{photo.status === "preparing" ? "Preparando…" : `Subiendo ${percent}%`}</span>
      <span className="h-1 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-label={`Subida de la foto`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span className="block h-full bg-accent" style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}

// Announced politely (fast-04): which photo is uploading, then "Fotos subidas"; never every percent.
export function photoSummary(photos: FormPhoto[]) {
  const uploading = photos.filter((photo) => photo.status === "preparing" || photo.status === "uploading").length;
  const done = photos.filter((photo) => photo.status === "done").length;
  const failed = photos.filter((photo) => photo.status === "error").length;
  const count = `${photos.length} de ${MAX_LISTING_PHOTOS} fotos`;
  const parts = uploading
    ? [`Subiendo ${Math.min(done + 1, photos.length)} de ${photos.length} fotos…`]
    : done && !failed ? ["Fotos subidas", count] : [count];
  if (failed) parts.push(`${failed} sin subir`);
  return parts.join(" · ");
}
