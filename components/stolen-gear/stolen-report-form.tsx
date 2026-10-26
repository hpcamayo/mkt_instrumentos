"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FileInput, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { preparePhoto } from "@/components/store-import/photo-upload";
import { photoTypeFromName, type PhotoMimeType } from "@/lib/store-import/photo-files";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// safe-02 (accounts batch): "Reportar un robo". The photos go to a private bucket under the person's own folder (redrawn
// as JPEG first, which drops their location data); the report is private, compared with listings and store inventory,
// and only Admin sees a match.

const MAX_PHOTOS = 6;
const EXTENSIONS: Record<PhotoMimeType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function StolenReportForm({ userId, today }: { userId: string; today: string }) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    const files = data.getAll("photos").filter((item): item is File => item instanceof File && item.size > 0);
    const found: Record<string, string> = {};
    if (!value("brand")) found.brand = "Escribe la marca.";
    if (value("description").length < 10) found.description = "Describe el equipo con al menos 10 caracteres (color, detalles, marcas de uso).";
    if (!value("stolen_on")) found.stolen_on = "Indica la fecha.";
    if (value("place").length < 2) found.place = "Indica el distrito o la ciudad.";
    if (value("police_report").length < 3) found.police_report = "Escribe el número de la denuncia.";
    if (!value("serial") && !files.length) found.serial = "Agrega el número de serie o al menos una foto tuya del equipo.";
    if (files.length > MAX_PHOTOS) found.photos = `Elige hasta ${MAX_PHOTOS} fotos.`;
    if (files.some((file) => !photoTypeFromName(file.name) && !Object.keys(EXTENSIONS).includes(file.type))) found.photos = "Usa fotos JPG, PNG o WebP.";
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setFailure("No pudimos conectar con Laria. Vuelve a intentarlo.");
    setBusy(true);
    const folder = crypto.randomUUID();
    const paths: string[] = [];
    for (const [index, file] of files.entries()) {
      const type = photoTypeFromName(file.name) ?? (file.type as PhotoMimeType);
      const prepared = await preparePhoto(file, type);
      const path = `${userId}/${folder}/${index + 1}.${EXTENSIONS[prepared.type]}`;
      const { error } = await supabase.storage.from("stolen-gear-photos").upload(path, prepared.data, { contentType: prepared.type, upsert: false });
      if (error) {
        setBusy(false);
        return setFailure("No pudimos subir una de las fotos. Revisa tu conexión y vuelve a intentarlo.");
      }
      paths.push(path);
    }
    const response = await fetch("/api/stolen-gear/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand: value("brand"), model: value("model"), description: value("description"), serial: value("serial"),
        stolen_on: value("stolen_on"), place: value("place"), police_report: value("police_report"),
        police_station: value("police_station"), photos: paths,
      }),
    }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { code?: string; message?: string } | null;
    setBusy(false);
    if (!response?.ok || !result?.code) {
      if (paths.length) await supabase.storage.from("stolen-gear-photos").remove(paths);
      return setFailure(result?.message ?? "No pudimos guardar el reporte. Vuelve a intentarlo.");
    }
    setSent(result.code);
  }

  if (sent) {
    return (
      <Notice tone="success" title={`Guardamos tu reporte ${sent}`}>
        <p>
          Lo comparamos desde ahora con las publicaciones y el inventario de las tiendas. Si algo coincide, el equipo de
          Laria lo revisa y te escribe por correo. Puedes ver tus reportes en <Link href="/reportar-robo/mis-reportes">Mis reportes</Link>.
        </p>
      </Notice>
    );
  }

  return (
    <form noValidate onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="robo-marca" label="Marca" error={errors.brand}>
          <Input name="brand" maxLength={80} required />
        </Field>
        <Field id="robo-modelo" label="Modelo" optional>
          <Input name="model" maxLength={120} />
        </Field>
      </div>
      <Field id="robo-serie" label="Número de serie" hint="Suele estar en la parte de atrás del clavijero, en una placa o dentro de la caja. Nadie más lo ve." error={errors.serial}>
        <Input name="serial" maxLength={60} autoComplete="off" autoCapitalize="characters" />
      </Field>
      <Field id="robo-descripcion" label="Descripción" hint="Color, detalles, golpes o modificaciones que lo distingan." error={errors.description}>
        <Textarea name="description" rows={4} maxLength={1000} required />
      </Field>
      <Field id="robo-fotos" label="Fotos tuyas del equipo" optional hint={`Hasta ${MAX_PHOTOS}. Mejor si muestran detalles únicos. Solo el equipo de Laria las ve.`} error={errors.photos}>
        <FileInput name="photos" multiple accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="robo-fecha" label="Fecha del robo" error={errors.stolen_on}>
          <Input name="stolen_on" type="date" max={today} required />
        </Field>
        <Field id="robo-lugar" label="Dónde fue" hint="Distrito y ciudad." error={errors.place}>
          <Input name="place" maxLength={120} required />
        </Field>
        <Field id="robo-denuncia" label="Número de denuncia policial" error={errors.police_report}>
          <Input name="police_report" maxLength={60} required autoComplete="off" />
        </Field>
        <Field id="robo-comisaria" label="Comisaría" optional>
          <Input name="police_station" maxLength={120} />
        </Field>
      </div>
      {failure ? <Notice tone="danger"><p>{failure}</p></Notice> : null}
      <Button type="submit" className="justify-self-start" loading={busy} loadingLabel="Guardando…">Guardar reporte</Button>
    </form>
  );
}
