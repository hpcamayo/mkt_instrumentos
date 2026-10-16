import { createImportSession, ImportRequestError } from "@/lib/store-import/server";
import { importClient, importErrorResponse, importJson } from "@/lib/store-import/route-helpers";
import { IMPORT_MAX_FILE_BYTES } from "@/lib/store-import/limits";

export const dynamic = "force-dynamic";

// Starts an import (design §7.1 step 1). Returns the session and the private path the browser uploads the file to.
export async function POST(request: Request) {
  const auth = await importClient(request, true);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  const fileName = typeof body?.fileName === "string" ? body.fileName.slice(0, 300) : "";
  const format = body?.format === "csv" || body?.format === "xlsx" ? body.format : null;
  const bytes = Number(body?.bytes);
  if (!format) return importJson({ code: "IMPORT_FORMAT_UNSUPPORTED", message: "Sube un archivo .xlsx o .csv." }, 400);
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > IMPORT_MAX_FILE_BYTES) {
    return importJson({ code: "IMPORT_FILE_TOO_LARGE", message: "El archivo debe pesar como máximo 5 MB." }, 400);
  }
  try {
    return importJson(await createImportSession(auth.db, { fileName, format, bytes }), 201);
  } catch (error) {
    if (error instanceof ImportRequestError && error.code === "IMPORT_ALREADY_OPEN") {
      return importJson({ code: error.code, message: error.userMessage }, 409);
    }
    return importErrorResponse(error);
  }
}
