"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FileInput, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { getInstrumentTypeOptions } from "@/lib/listing-submission";
import { categoryOptions, conditionOptions } from "@/lib/listings";
import { parseWholeSolPrice } from "@/lib/price";
import { PHOTO_MAX_FILE_BYTES, PHOTO_SLOT_BATCH, baseName, photoTypeFromName } from "@/lib/store-import/photo-files";
import { defaultInstrumentType, type MissingField } from "@/lib/store-import/publication";
import type { PublishRowFields } from "@/lib/store-import/publication-server";
import { sendPhotoBatch, type PendingPhoto } from "./photo-upload";

// "Completar datos" on the import result (review fix B5): the fields a "Faltan datos" row still needs, and its
// photos, in one sheet. Text fields are saved on the staged row and the price on the SKU; the row is then checked
// again with the publish form's rules when it is published.

type ApiResult<T> = { ok: true; body: T } | { ok: false; code: string; message: string };
const NETWORK_MESSAGE = "No pudimos conectar con Laria. Revisa tu conexión y vuelve a intentarlo.";
const MAX_TEXT = 80;
const MIN_DESCRIPTION = 40;
const MAX_DESCRIPTION = 2000;
const MAX_PHOTOS = 10;
const MAX_PHOTO_MB = Math.round(PHOTO_MAX_FILE_BYTES / (1024 * 1024));

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

type Errors = Partial<Record<MissingField | "photos", string>>;

export type CompleteRowOutcome = { row: number; savedFields: boolean; photosAdded: number; photoError: string | null };

export function CompleteRowSheet({ sessionId, row, itemId, onClose, onSaved }: {
  sessionId: string;
  row: number;
  itemId: string;
  onClose: () => void;
  onSaved: (outcome: CompleteRowOutcome) => void;
}) {
  const [data, setData] = useState<PublishRowFields | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const formId = `completar-fila-${row}`;

  const load = useCallback(async () => {
    const result = await api<PublishRowFields>(`/api/store/imports/${sessionId}/publication/fields?row=${row}`);
    if (!result.ok) {
      setLoadError(result.message);
      return;
    }
    setLoadError(null);
    setData(result.body);
    setCategory(result.body.values.category);
    setDescription(result.body.values.description);
  }, [sessionId, row]);

  useEffect(() => { void load(); }, [load]);

  const missing = new Set(data?.missing_fields ?? []);
  const showCategory = missing.has("category");
  const typeOptions = category ? getInstrumentTypeOptions(category) : [];
  // Asked when it is missing, or when a new category has more than one type (a single-type category fills it in).
  const showType = missing.has("instrument_type") || (showCategory && Boolean(category) && !defaultInstrumentType(category));
  const photoRoom = data ? Math.max(MAX_PHOTOS - data.photo_count, 0) : 0;
  const photosEditable = Boolean(data?.photos_missing && (data.photo_state === "none" || data.photo_state === "too_few"));
  const nothingToFill = data && !missing.size && !data.photos_missing;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const form = new FormData(event.currentTarget);
    const found: Errors = {};
    const fields: Record<string, string> = {};
    const text = (name: string) => String(form.get(name) ?? "").replace(/\s+/g, " ").trim();

    for (const [key, label] of [["brand", "la marca"], ["model", "el modelo"]] as const) {
      if (!missing.has(key)) continue;
      const value = text(key);
      if (!value) found[key] = `Ingresa ${label}.`;
      else if (value.length > MAX_TEXT) found[key] = `Usa ${MAX_TEXT} caracteres como máximo.`;
      else fields[key] = value;
    }
    if (showCategory) {
      if (!category) found.category = "Elige una categoría.";
      else fields.category = category;
    }
    if (showType) {
      const value = text("instrument_type");
      if (!value) found.instrument_type = "Elige el tipo de instrumento.";
      else fields.instrument_type = value;
    }
    if (missing.has("condition")) {
      const value = text("condition");
      if (!value) found.condition = "Elige la condición.";
      else fields.condition = value;
    }
    if (missing.has("description")) {
      const value = description.trim();
      if (value.length < MIN_DESCRIPTION) found.description = `Escribe al menos ${MIN_DESCRIPTION} caracteres (llevas ${value.length}).`;
      else if (value.length > MAX_DESCRIPTION) found.description = `Usa ${MAX_DESCRIPTION} caracteres como máximo.`;
      else fields.description = value;
    }
    let price: number | null = null;
    if (missing.has("price")) {
      price = parseWholeSolPrice(text("price"));
      if (price === null) found.price = "Ingresa el precio en soles enteros, sin puntos ni comas. Ej.: 1500.";
    }
    const files = photosEditable ? (form.getAll("photos") as File[]).filter((file) => file.size > 0) : [];
    if (files.length > photoRoom) found.photos = `Puedes agregar ${photoRoom === 1 ? "1 foto más" : `hasta ${photoRoom} fotos más`}.`;
    else if (files.some((file) => !photoTypeFromName(file.name) || file.size > PHOTO_MAX_FILE_BYTES)) {
      found.photos = `Usa fotos JPG, PNG o WebP de hasta ${MAX_PHOTO_MB} MB.`;
    }
    setErrors(found);
    setFailure("");
    if (Object.keys(found).length) {
      const first = Object.keys(found)[0];
      document.getElementById(`${formId}-${first}`)?.focus();
      return;
    }

    let savedFields = false;
    if (Object.keys(fields).length || price !== null) {
      setBusy("Guardando datos…");
      const saved = await api<PublishRowFields>(`/api/store/imports/${sessionId}/publication/fields`, {
        row,
        fields: Object.keys(fields).length ? fields : null,
        price,
        itemVersion: price !== null ? data.item_version : null,
      });
      if (!saved.ok) {
        setBusy(null);
        setFailure(saved.message);
        // The SKU changed meanwhile (for example a sale): read it again so the next try has its current version.
        if (saved.code === "INVENTORY_VERSION_CONFLICT") await load();
        return;
      }
      savedFields = true;
    }

    let photosAdded = 0;
    let photoError: string | null = null;
    if (files.length) {
      setBusy("Subiendo fotos…");
      try {
        for (let start = 0; start < files.length; start += PHOTO_SLOT_BATCH) {
          const batch: PendingPhoto[] = files.slice(start, start + PHOTO_SLOT_BATCH)
            .map((file) => ({ name: baseName(file.name), type: photoTypeFromName(file.name)!, data: file }));
          const { uploaded, rejected } = await sendPhotoBatch(sessionId, batch, new Map());
          const refused = new Set(rejected);
          for (const assetId of uploaded.filter((id) => !refused.has(id))) {
            const placed = await api(`/api/store/imports/${sessionId}/photos`, { action: "place", assetId, row });
            if (!placed.ok) throw new Error(placed.message);
            photosAdded += 1;
          }
          if (refused.size) photoError = `${refused.size === 1 ? "1 foto no pasó" : `${refused.size} fotos no pasaron`} la revisión (formato, tamaño o archivo dañado).`;
        }
      } catch (error) {
        photoError = error instanceof Error && error.message ? error.message : NETWORK_MESSAGE;
      }
    }
    setBusy(null);
    onSaved({ row, savedFields, photosAdded, photoError });
  }

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onClose} disabled={Boolean(busy)}>Cancelar</Button>
      {data && !nothingToFill ? (
        <Button type="submit" form={formId} loading={Boolean(busy)} loadingLabel={busy ?? "Guardando…"}>Guardar datos</Button>
      ) : null}
    </div>
  );

  return (
    <Sheet title="Completar datos" closeLabel="Cerrar sin guardar" onDismiss={() => { if (!busy) onClose(); }} layout="responsive" footer={footer}>
      {!data ? (
        loadError ? (
          <div className="grid gap-3 pt-4">
            <Notice tone="danger" role="alert">{loadError}</Notice>
            <div><Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button></div>
          </div>
        ) : <p className="pt-4 t-body text-ink-2" aria-live="polite">Cargando…</p>
      ) : (
        <form id={formId} className="grid gap-4 pt-4" onSubmit={submit} noValidate>
          <div className="grid gap-0.5">
            <p className="t-body font-semibold break-words">{data.sku ? `${data.sku} · ` : ""}{data.name}</p>
            <p className="t-meta">Fila {data.row_number}. Completa lo que falta; al guardar, la fila se revisa otra vez.</p>
          </div>

          {missing.has("name") ? (
            <Notice tone="warning">
              El nombre del SKU es muy corto. <Link href={`/mi-cuenta/tienda/inventario/${itemId}`} className="link font-semibold">Corrígelo en Inventario</Link>.
            </Notice>
          ) : null}
          {nothingToFill ? <Notice tone="success">Esta fila ya tiene todo lo necesario para publicarse.</Notice> : null}

          {missing.has("brand") || missing.has("model") ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {missing.has("brand") ? (
                <Field id={`${formId}-brand`} label="Marca" hint="Ej.: Fender, Yamaha." error={errors.brand}>
                  <Input name="brand" defaultValue={data.values.brand} maxLength={MAX_TEXT} autoComplete="off" required />
                </Field>
              ) : null}
              {missing.has("model") ? (
                <Field id={`${formId}-model`} label="Modelo" hint="Ej.: Stratocaster, P-45." error={errors.model}>
                  <Input name="model" defaultValue={data.values.model} maxLength={MAX_TEXT} autoComplete="off" required />
                </Field>
              ) : null}
            </div>
          ) : null}

          {showCategory || showType ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {showCategory ? (
                <Field id={`${formId}-category`} label="Categoría" error={errors.category}>
                  <Select name="category" value={category} onChange={(event) => setCategory(event.target.value)} required>
                    <option value="">Elige una categoría</option>
                    {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
              ) : null}
              {showType ? (
                <Field id={`${formId}-instrument_type`} label="Tipo de instrumento" error={errors.instrument_type}
                  hint={category ? undefined : "Primero elige la categoría."}>
                  <Select key={category} name="instrument_type" defaultValue={typeOptions.some((option) => option.value === data.values.instrument_type) ? data.values.instrument_type : ""}
                    disabled={!category} required>
                    <option value="">Elige el tipo</option>
                    {typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
              ) : null}
            </div>
          ) : null}

          {missing.has("condition") ? (
            <Field id={`${formId}-condition`} label="Condición" error={errors.condition} className="sm:max-w-xs">
              <Select name="condition" defaultValue="" required>
                <option value="">Elige la condición</option>
                {conditionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </Select>
            </Field>
          ) : null}

          {missing.has("description") ? (
            <Field id={`${formId}-description`} label="Descripción" error={errors.description}
              hint={`Al menos ${MIN_DESCRIPTION} caracteres: estado, accesorios incluidos, detalles. Llevas ${description.trim().length}.`}>
              <Textarea name="description" value={description} onChange={(event) => setDescription(event.target.value)} rows={5} required />
            </Field>
          ) : null}

          {missing.has("price") ? (
            <Field id={`${formId}-price`} label="Precio en soles" hint="Se guarda en el SKU, como en Inventario." error={errors.price} className="sm:max-w-xs">
              <Input name="price" inputMode="numeric" pattern="[0-9]*" autoComplete="off" required />
            </Field>
          ) : null}

          {data.photos_missing ? (
            photosEditable ? (
              <Field id={`${formId}-photos`} label="Fotos" error={errors.photos}
                hint={`Cada SKU necesita de 2 a 10 fotos; esta fila tiene ${data.photo_count}. JPG, PNG o WebP de hasta ${MAX_PHOTO_MB} MB. Se agregan después de las que ya tiene.`}>
                <FileInput name="photos" multiple accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" />
              </Field>
            ) : (
              <Notice tone="info">
                {data.photo_state === "too_many"
                  ? "Esta fila tiene más de 10 fotos. Quita las que sobren en Revisar fotos, más arriba en esta página."
                  : "Revisa el orden de las fotos de esta fila en Revisar fotos, más arriba en esta página."}
              </Notice>
            )
          ) : null}

          {failure ? <Notice tone="danger" role="alert">{failure}</Notice> : null}
        </form>
      )}
    </Sheet>
  );
}
