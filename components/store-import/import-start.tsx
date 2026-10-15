"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/error-summary";
import { Field, FileInput } from "@/components/ui/field";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { IMPORT_MAX_FILE_BYTES } from "@/lib/store-import/limits";
import type { SpreadsheetFormat } from "@/lib/store-import/types";

export const IMPORT_FILE_ACCEPT = ".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

const CONTENT_TYPES: Record<SpreadsheetFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
};

// Checks the browser can make before anything is sent; the server reads the file again with its own limits.
export function importFileProblem(file: File | null): string | null {
  if (!file) return "Elige un archivo .xlsx o .csv.";
  if (/\.xls$/i.test(file.name)) return "Los archivos .xls antiguos no se aceptan. En Excel, usa Guardar como → Libro de Excel (.xlsx).";
  if (/\.xlsm$/i.test(file.name)) return "Los archivos con macros no se aceptan. Guárdalo como Libro de Excel (.xlsx).";
  if (!/\.(xlsx|csv)$/i.test(file.name)) return "Sube un archivo .xlsx o .csv.";
  if (file.size === 0) return "El archivo está vacío.";
  if (file.size > IMPORT_MAX_FILE_BYTES) return "El archivo debe pesar como máximo 5 MB.";
  return null;
}

export function importFileFormat(file: File): SpreadsheetFormat {
  return /\.csv$/i.test(file.name) ? "csv" : "xlsx";
}

// Sends the file straight to the private bucket, to the one path the session allows (design §7.1 step 1).
export async function uploadImportFile(path: string, file: File) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return "No pudimos conectar con Laria. Vuelve a intentarlo.";
  const { error } = await supabase.storage.from("store-imports").upload(path, file, {
    contentType: CONTENT_TYPES[importFileFormat(file)],
    upsert: false,
  });
  if (!error) return null;
  // A retry after a dropped connection finds the file already there.
  if (/exists|duplicate/i.test(error.message)) return null;
  return "No se pudo subir el archivo. Revisa tu conexión y vuelve a intentarlo.";
}

export function ImportStartForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = importFileProblem(file);
    if (problem || !file) {
      setError(problem);
      setAttempt((value) => value + 1);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/store/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, format: importFileFormat(file), bytes: file.size }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (body?.code === "IMPORT_ALREADY_OPEN") {
          router.refresh();
        }
        setError(body?.message ?? "No pudimos empezar la importación. Vuelve a intentarlo.");
        setAttempt((value) => value + 1);
        setBusy(false);
        return;
      }
      const uploadError = await uploadImportFile(body.upload.path, file);
      // Even if the upload failed, the session page offers to upload again.
      router.push(`/mi-cuenta/tienda/inventario/importar/${body.session.id}${uploadError ? "?subida=fallida" : ""}`);
    } catch {
      setError("No pudimos conectar con Laria. Revisa tu conexión y vuelve a intentarlo.");
      setAttempt((value) => value + 1);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <ErrorSummary title="No pudimos empezar la importación" errors={error ? [{ id: "archivo-importacion", message: error }] : []} attempt={attempt} />
      <Field
        id="archivo-importacion"
        label="Archivo de inventario"
        hint="Excel (.xlsx) o CSV, hasta 5 MB y 2000 filas. Se lee la primera hoja visible."
        error={error ?? undefined}
      >
        <FileInput
          accept={IMPORT_FILE_ACCEPT}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError(null);
          }}
        />
      </Field>
      <div>
        <Button type="submit" icon={<Upload aria-hidden />} loading={busy} loadingLabel="Subiendo archivo…">
          Subir y revisar
        </Button>
      </div>
    </form>
  );
}
