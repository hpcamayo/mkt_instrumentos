import type { getPublicSupabaseClient } from "@/lib/supabase/public-client";

type Client = NonNullable<ReturnType<typeof getPublicSupabaseClient>>;
type Kind = "listing" | "store" | "store_listing";
export type SubmissionFile = {
  file: File;
  role?: "logo" | "banner" | "store_photo";
};
type Attempt = {
  id: string;
  token: string;
  folder: string;
  fingerprint: string;
  commitStarted: boolean;
};

// One instance per form preserves the idempotency token across retries, including
// an uncertain response after the database has already committed the submission.
export function createPublicSubmission(client: Client) {
  let attempt: Attempt | null = null;
  let busy = false;
  return async (
    kind: Kind,
    fields: Record<string, unknown>,
    rawFiles: File[] | SubmissionFile[],
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
        await submissionRequest({ action: "cleanup", token: attempt.token });
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
          try {
            await submissionRequest({
              action: "cleanup",
              token: attempt.token,
            });
            attempt = null;
          } catch {
            // Retain the token so a retry can reuse or clean the same folder.
          }
          throw new Error(
            "No se pudieron subir las fotos. Reintenta sin cerrar esta página.",
          );
        }
      }
      attempt.commitStarted = true;
      await submissionRequest({
        action: "complete",
        token: attempt.token,
        fields,
        paths,
        roles: files.map(({ role }) => role ?? null),
      });
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
  if (!response.ok)
    throw new Error(
      result.message ?? "No se pudo completar el envío. Intenta nuevamente.",
    );
  return result;
}

function extension(type: string) {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  throw new Error("Usa fotos en JPG, PNG o WebP.");
}
