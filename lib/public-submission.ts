import type { getPublicSupabaseClient } from "@/lib/supabase/public-client";
import { uploadLimitReached } from "@/lib/upload-allowance";

type Client = NonNullable<ReturnType<typeof getPublicSupabaseClient>>;
type Kind = "listing" | "store" | "store_listing";
export type SubmissionFile = {
  file: File;
  role?: "logo" | "banner" | "store_photo";
};
// Reported while a submission runs, so a form can say which photo is uploading.
export type SubmissionProgress =
  | { step: "upload"; index: number; total: number }
  | { step: "complete" };
type Attempt = {
  id: string;
  token: string;
  folder: string;
  fingerprint: string;
  commitStarted: boolean;
  uncertainOutcome: boolean;
};

// One instance per form preserves the idempotency token across retries, including
// an uncertain response after the database has already committed the submission.
export function createPublicSubmission(client: Client) {
  let attempt: Attempt | null = null;
  let busy = false;
  // Launch audit A35: a token that expired while the form was open (a week, or a deploy that started expiring them) is
  // refused before anything is written; renew it for the same submission, whose folder and photos carry over, and send
  // once more.
  const send = async (current: Attempt, payload: Record<string, unknown>) => {
    const request = () => submissionRequest({ ...payload, token: current.token });
    return request().catch(async (error) => {
      if (!(error instanceof SubmissionRejected && error.expired)) throw error;
      current.token = (await submissionRequest({ action: "renew", token: current.token })).token;
      return request();
    });
  };
  return async (
    kind: Kind,
    fields: Record<string, unknown>,
    rawFiles: File[] | SubmissionFile[],
    onProgress?: (progress: SubmissionProgress) => void,
  ) => {
    if (busy) throw new Error("El envío ya está en curso.");
    busy = true;
    try {
      const files = rawFiles.map((item) =>
        typeof item === "object" && item !== null && "file" in item
          ? item
          : { file: item as File },
      );
      const fingerprint = JSON.stringify([
        kind,
        fields,
        files.map(({ file, role }) => [
          file.name,
          file.size,
          file.lastModified,
          role ?? null,
        ]),
      ]);
      if (attempt && attempt.fingerprint !== fingerprint) {
        if (attempt.commitStarted)
          throw new Error(
            "Reintenta con los mismos datos y fotos para confirmar el envío anterior.",
          );
        await send(attempt, { action: "cleanup" });
        attempt = null;
      }
      if (!attempt) {
        const started = await submissionRequest({ action: "start", kind });
        attempt = {
          id: started.id,
          token: started.token,
          folder: started.folder ?? `pending/${started.id}`,
          fingerprint,
          commitStarted: false,
          uncertainOutcome: false,
        };
      }
      const bucket = kind === "store" ? "store-assets" : "listing-photos";
      const paths = files.map(
        ({ file }, index) =>
          `${attempt!.folder}/${index}.${extension(file.type)}`,
      );
      if (!attempt.commitStarted) {
        try {
          for (const [index, { file }] of files.entries()) {
            onProgress?.({ step: "upload", index, total: files.length });
            const { error } = await client.storage
              .from(bucket)
              .upload(paths[index], file, {
                cacheControl: "31536000",
                upsert: false,
              });
            // The same immutable path can already exist after a lost upload response.
            if (
              error &&
              error.statusCode !== "409" &&
              error.statusCode !== "400"
            )
              throw error;
            if (
              error &&
              error.statusCode === "400" &&
              error.message !== "The resource already exists"
            )
              throw error;
          }
        } catch {
          // Launch audit A18: a refusal may be the account's daily limit, whose message says when the next one fits.
          // Asked before the cleanup, which frees places.
          const limited = await uploadLimitReached(client, bucket);
          try {
            await send(attempt, { action: "cleanup" });
            attempt = null;
          } catch {
            // Retain the token so a retry can reuse or clean the same folder.
          }
          throw limited ?? new Error(
            "No se pudieron subir las fotos. Reintenta sin cerrar esta página.",
          );
        }
      }
      attempt.commitStarted = true;
      onProgress?.({ step: "complete" });
      try {
        await send(attempt, {
          action: "complete",
          fields,
          paths,
          roles: files.map(({ role }) => role ?? null),
        });
      } catch (error) {
        // Only an explicit server rollback permits corrected data. Network/5xx
        // failures retain the immutable attempt: the transaction may have committed.
        if (error instanceof SubmissionRejected && !attempt.uncertainOutcome) {
          attempt.commitStarted = false;
        } else {
          // A later preflight rejection cannot disprove an earlier lost commit.
          attempt.uncertainOutcome = true;
        }
        throw error;
      }
      attempt = null;
    } finally {
      busy = false;
    }
  };
}

async function submissionRequest(payload: object) {
  const response = await fetch("/api/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) {
    const message = result.message ?? "No se pudo completar el envío. Intenta nuevamente.";
    throw result.rejected === true ? new SubmissionRejected(message, result.renew === true) : new Error(message);
  }
  return result;
}

class SubmissionRejected extends Error {
  // The token expired; the submission can go on with a renewed one.
  constructor(message: string, readonly expired = false) {
    super(message);
  }
}

function extension(type: string) {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  throw new Error("Usa fotos en JPG, PNG o WebP.");
}
