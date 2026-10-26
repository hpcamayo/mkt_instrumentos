"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ImagePlus, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PHOTO_ACCEPT, PhotoPrepareError, prepareListingPhoto } from "@/components/selling/prepare-photo";
import { uploadObject } from "@/components/selling/listing-uploads";
import { Button, IconButton } from "@/components/ui/button";
import { readMyReviewPhotos, trustErrorMessage, type MyReviewPhoto } from "@/lib/deal-trust";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// Review photos (safe-06): the buyer adds up to three photos of what they received to their review of the seller. Each
// photo is redrawn in the browser (no camera position or other metadata leaves the phone), uploaded to the private
// review-photos bucket under <buyer>/<transaction>/<random>.jpg, and attached to the review once it is sent. Laria
// reviews each photo before anyone else sees it.

export const MAX_REVIEW_PHOTOS = 3;
const BUCKET = "review-photos";

export type PickedPhoto = { key: string; file: File; preview: string };

export function ReviewPhotoPicker({
  photos,
  onChange,
  max = MAX_REVIEW_PHOTOS,
  disabled = false,
}: {
  photos: PickedPhoto[];
  onChange: (photos: PickedPhoto[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const room = max - photos.length;

  async function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");
    setPreparing(true);
    const next = [...photos];
    for (const source of Array.from(files).slice(0, Math.max(0, room))) {
      try {
        const prepared = await prepareListingPhoto(source);
        next.push({ key: crypto.randomUUID(), file: prepared.file, preview: URL.createObjectURL(prepared.file) });
      } catch (caught) {
        setError(caught instanceof PhotoPrepareError ? caught.message : "No pudimos preparar esa foto. Prueba con otra.");
      }
    }
    if (files.length > room) setError(`Puedes agregar hasta ${MAX_REVIEW_PHOTOS} fotos por reseña.`);
    setPreparing(false);
    if (input.current) input.current.value = "";
    onChange(next);
  }

  function remove(key: string) {
    const photo = photos.find((item) => item.key === key);
    if (photo) URL.revokeObjectURL(photo.preview);
    onChange(photos.filter((item) => item.key !== key));
  }

  return (
    <div className="grid gap-2">
      <p className="t-ui font-semibold text-ink">
        Fotos de lo que recibiste <span className="font-normal text-ink-2">(opcional, hasta {MAX_REVIEW_PHOTOS})</span>
      </p>
      <p className="t-meta">Laria las revisa antes de mostrarlas. Evita que se vean rostros, documentos o placas.</p>
      {photos.length ? (
        <ul className="flex flex-wrap gap-2">
          {photos.map((photo, index) => (
            <li key={photo.key} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
              <img src={photo.preview} alt={`Foto ${index + 1} elegida`} width={72} height={72} className="h-[72px] w-[72px] rounded-control border border-subtle object-cover" />
              <IconButton
                size="sm"
                label={`Quitar la foto ${index + 1}`}
                icon={<X aria-hidden />}
                onClick={() => remove(photo.key)}
                disabled={disabled}
                className="absolute -right-2 -top-2 bg-surface"
              />
            </li>
          ))}
        </ul>
      ) : null}
      {room > 0 ? (
        <div>
          <input
            ref={input}
            id={inputId}
            type="file"
            accept={PHOTO_ACCEPT}
            multiple
            disabled={disabled || preparing}
            className="sr-only"
            onChange={(event) => void pick(event.currentTarget.files)}
          />
          <label
            htmlFor={inputId}
            aria-disabled={disabled || preparing || undefined}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-line-strong bg-surface px-3 t-ui font-semibold text-ink hover:bg-canvas aria-disabled:cursor-not-allowed aria-disabled:text-ink-3 [&_svg]:h-4 [&_svg]:w-4"
          >
            <ImagePlus aria-hidden />
            {preparing ? "Preparando…" : photos.length ? "Agregar otra foto" : "Agregar fotos"}
          </label>
        </div>
      ) : null}
      {error ? <p role="alert" className="t-meta font-semibold text-danger">{error}</p> : null}
    </div>
  );
}

// Uploads the picked photos for one purchase; returns their storage paths in order.
export async function uploadReviewPhotos(transactionId: string, photos: PickedPhoto[]) {
  if (photos.length === 0) return [];
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("REVIEW_PHOTO");
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new Error("REVIEW_PHOTO");
  const paths: string[] = [];
  for (const photo of photos) {
    const path = `${userId}/${transactionId}/${crypto.randomUUID()}.jpg`;
    await uploadObject(BUCKET, path, photo.file);
    paths.push(path);
  }
  return paths;
}

export async function attachReviewPhotos(reviewId: string, paths: string[]) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "REVIEW_PHOTO" };
  const { error } = await (supabase as unknown as SupabaseClient).rpc("attach_review_photos", { p_review_id: reviewId, p_paths: paths });
  return { error: error ? error.message : null };
}

const STATUS_LABEL: Record<MyReviewPhoto["status"], string> = {
  pending: "En revisión",
  approved: "Publicada",
  hidden: "No se publicó",
};

// Under the buyer's own sent review: the photos with their review state and, on the day of the review, a way to add
// the ones that didn't make it (an upload that failed, or one more).
export function OwnReviewPhotos({ transactionId, reviewId, submittedAt }: { transactionId: string; reviewId: string; submittedAt: string }) {
  const [photos, setPhotos] = useState<MyReviewPhoto[] | null>(null);
  const [picked, setPicked] = useState<PickedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [now] = useState(() => Date.now());
  const open = now - Date.parse(submittedAt) < 24 * 60 * 60 * 1000;

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data, error } = await (supabase as unknown as SupabaseClient).rpc("get_my_review_photos", { p_transaction_id: transactionId });
    setPhotos(error ? [] : readMyReviewPhotos(data));
  }, [transactionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const paths = await uploadReviewPhotos(transactionId, picked);
      const { error } = await attachReviewPhotos(reviewId, paths);
      if (error) throw new Error(error);
      for (const photo of picked) URL.revokeObjectURL(photo.preview);
      setPicked([]);
      setFailed(false);
      setMessage("Guardamos tus fotos. Laria las revisa antes de mostrarlas.");
      await load();
    } catch (caught) {
      setFailed(true);
      setMessage(trustErrorMessage(caught instanceof Error ? caught.message : "REVIEW_PHOTO"));
    } finally {
      setBusy(false);
    }
  }

  if (photos === null) return null;
  const room = MAX_REVIEW_PHOTOS - photos.length;
  if (photos.length === 0 && !open) return null;
  return (
    <div className="mt-3 grid gap-3">
      {photos.length ? (
        <ul className="flex flex-wrap gap-3" aria-label="Tus fotos">
          {photos.map((photo, index) => (
            <li key={photo.id} className="grid w-[72px] gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- the private bucket is served by a checked route */}
              <img src={`/api/review-photos/${photo.id}`} alt={`Tu foto ${index + 1}`} width={72} height={72} className="h-[72px] w-[72px] rounded-control border border-subtle bg-canvas object-cover" />
              <span className="t-meta">{STATUS_LABEL[photo.status]}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {open && room > 0 ? (
        <>
          <ReviewPhotoPicker photos={picked} onChange={setPicked} max={room} disabled={busy} />
          {picked.length ? (
            <Button size="sm" variant="secondary" className="w-fit" loading={busy} loadingLabel="Subiendo fotos…" onClick={() => void save()}>
              Guardar fotos
            </Button>
          ) : null}
        </>
      ) : null}
      {message ? <p role={failed ? "alert" : "status"} className={failed ? "t-meta font-semibold text-danger" : "t-meta"}>{message}</p> : null}
    </div>
  );
}
