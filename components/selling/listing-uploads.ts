"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { uploadLimitReached } from "@/lib/upload-allowance";

// Uploads that happen while the seller fills the form (POST 03, big-06). The submission is started (or a saved draft
// resumed, POST 02) on the first photo; each photo then goes straight to its own path in the submission's folder,
// with progress, so pressing Publicar only confirms. Paths are never reused within a submission (a replaced photo
// takes a new slot), which keeps uploads immutable (upsert off) and lets the publish route drop the unused ones.

export type Capability = { id: string; token: string; folder: string };
// Launch audit A18: a renewal also says, by bucket, which files are still in the folder (null when Storage can't say).
export type Renewed = Capability & { present?: Record<string, string[]> | null };
export type UploadKind = "listing" | "store_listing";

const NETWORK = "No pudimos conectar con Laria. Revisa tu conexión y vuelve a intentarlo.";
export const PHOTO_BUCKET = "listing-photos";
export const SOUND_BUCKET = "listing-sound-clips";

// A refusal: nothing was written, so the seller may change the data and send again.
export class SubmissionRejected extends Error {}
// Launch audit A35: the submission's token expired, or predates expiring tokens; renewSubmission gets a fresh one.
export class SubmissionExpired extends SubmissionRejected {}
// The token can't be renewed either, so the photos in the submission's folder can't be confirmed: they go in again.
export class SubmissionLost extends SubmissionRejected {}

export async function submissionRequest<T = Record<string, unknown>>(payload: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  } catch {
    throw new Error(NETWORK);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const refusal = result.rejected !== true ? Error : result.renew === true ? SubmissionExpired : result.restart === true ? SubmissionLost : SubmissionRejected;
    throw new refusal(result.message ?? "No se pudo completar el envío. Intenta nuevamente.");
  }
  return result as T;
}

export function startSubmission(kind: UploadKind) {
  return submissionRequest<Capability>({ action: "start", kind });
}

export function resumeDraftSubmission(draftId: string) {
  return submissionRequest<Capability>({ action: "resume", draft_id: draftId });
}

// A fresh token for the same submission (same id and folder), for its owner only.
export function renewSubmission(token: string) {
  return submissionRequest<Renewed>({ action: "renew", token });
}

export function publicUrl(bucket: string, path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

// One object to Storage with upload progress (supabase-js has no progress callback, so this is the same REST call it
// makes). An "already exists" answer means an earlier attempt of this same path landed: that counts as uploaded.
export async function uploadObject(bucket: string, path: string, file: Blob, onProgress?: (fraction: number) => void) {
  const supabase = getSupabaseBrowserClient();
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabase || !base || !anon) throw new Error(NETWORK);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Tu sesión terminó. Vuelve a ingresar para seguir subiendo fotos.");
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${base.replace(/\/$/, "")}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`);
    request.setRequestHeader("authorization", `Bearer ${token}`);
    request.setRequestHeader("apikey", anon);
    request.setRequestHeader("x-upsert", "false");
    request.setRequestHeader("cache-control", "max-age=31536000");
    request.setRequestHeader("content-type", file.type || "application/octet-stream");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.min(0.99, event.loaded / event.total));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) return resolve();
      if (/exists|duplicate/i.test(request.responseText)) return resolve();
      // Launch audit A18: a refusal may be the account's daily limit, whose message says when the next file fits.
      void uploadLimitReached(supabase, bucket).then((limited) => reject(limited ?? new Error("No se pudo subir. Toca Reintentar.")));
    };
    request.onerror = () => reject(new Error("Se cortó la conexión. Toca Reintentar."));
    request.send(file);
  });
  onProgress?.(1);
}

// Runs tasks at most `limit` at a time (two or three photos in parallel, as the idea asks).
export function createQueue(limit = 3) {
  let running = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (running >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    running++;
    try {
      return await task();
    } finally {
      running--;
      waiting.shift()?.();
    }
  };
}

export type CompleteResult = { ok: true; completed: true; slug?: string; status?: string };

// details: listing-details' extra fields by key (lib/listing-details.ts), stored with the listing.
export function completeSubmission(token: string, fields: Record<string, unknown>, paths: string[], soundClip: { path: string; duration: number } | null, details: Record<string, unknown> = {}) {
  return submissionRequest<CompleteResult>({
    action: "complete",
    token,
    fields,
    paths,
    roles: paths.map(() => null),
    ...(soundClip ? { sound_clip: soundClip } : {}),
    ...(Object.keys(details).length ? { details } : {}),
  });
}

export function cleanupSubmission(token: string) {
  return submissionRequest({ action: "cleanup", token });
}
