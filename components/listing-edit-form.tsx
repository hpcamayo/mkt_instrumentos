"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LocationFields } from "@/components/location-fields";
import { PageNotice } from "@/components/page-notice";
import { getInstrumentFilterGroup } from "@/lib/instrument-filters";
import {
  MAX_LISTING_PHOTOS,
  MAX_LISTING_PHOTO_BYTES,
  MIN_LISTING_PHOTOS,
  getInstrumentTypeOptions,
  type ListingSubmissionAttributes,
} from "@/lib/listing-submission";
import { categoryOptions, conditionOptions } from "@/lib/listings";
import { normalizePeruRegion } from "@/lib/location";
import { parseWholeSolPrice } from "@/lib/price";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type ExistingPhoto = {
  id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
};

type EditableListing = {
  id: string;
  title: string;
  status: string;
  category: string;
  instrument_type: string | null;
  attributes: Record<string, unknown> | null;
  brand: string | null;
  model: string | null;
  condition: string | null;
  price_pen: number | null;
  city: string;
  region: string;
  description: string | null;
  listing_photos: ExistingPhoto[];
};

type PhotoItem =
  | { key: string; kind: "existing"; imageUrl: string; altText: string }
  | { key: string; kind: "new"; file: File; previewUrl: string };

export function ListingEditForm({
  listing,
  hasPendingRevision,
  isVerifiedStore,
  returnHref,
}: {
  listing: EditableListing;
  hasPendingRevision: boolean;
  isVerifiedStore: boolean;
  returnHref: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [category, setCategory] = useState(listing.category);
  const [instrumentType, setInstrumentType] = useState(listing.instrument_type ?? "");
  const [photos, setPhotos] = useState<PhotoItem[]>(
    [...listing.listing_photos]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((photo) => ({
        key: photo.id,
        kind: "existing" as const,
        imageUrl: photo.image_url,
        altText: photo.alt_text ?? `Foto de ${listing.title}`,
      })),
  );
  const [photosChanged, setPhotosChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const photosRef = useRef(photos);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(
    () => () => {
      for (const photo of photosRef.current) {
        if (photo.kind === "new") URL.revokeObjectURL(photo.previewUrl);
      }
    },
    [],
  );

  const attributeGroup = getInstrumentFilterGroup(instrumentType);
  const moderatedNote =
    listing.status === "approved" || listing.status === "hidden"
      ? isVerifiedStore
        ? "Tu Tienda Verificada puede aplicar todos estos cambios directamente."
        : hasPendingRevision
          ? "Ya hay una propuesta en revisión. Puedes seguir ajustando título, categoría, tipo, marca, modelo, condición o fotos; se actualizará la misma propuesta sin cambiar la versión pública."
          : "Precio, descripción, ubicación y características se actualizan ahora. Título, categoría, tipo, marca, modelo, condición y fotos requieren revisión; la versión pública actual no cambia mientras tanto."
      : "Los cambios se guardan directamente porque esta publicación todavía no es una versión pública aprobada.";

  function showMessage(nextState: "success" | "error", value: string) {
    setState(nextState);
    setMessage(value);
  }

  function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.some((file) => !isImageFile(file))) {
      showMessage("error", "Usa fotos JPEG, PNG o WebP.");
      return;
    }
    if (files.some((file) => file.size > MAX_LISTING_PHOTO_BYTES)) {
      showMessage("error", "Cada foto debe pesar 5 MB o menos.");
      return;
    }
    if (photos.length + files.length > MAX_LISTING_PHOTOS) {
      showMessage("error", `Puedes guardar hasta ${MAX_LISTING_PHOTOS} fotos.`);
      return;
    }
    setPhotos((current) => [
      ...current,
      ...files.map((file) => ({
        key: crypto.randomUUID(),
        kind: "new" as const,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
    setPhotosChanged(true);
    setState("idle");
    setMessage("");
  }

  function replacePhoto(index: number, event: ChangeEvent<HTMLInputElement>) {
    const file = Array.from(event.target.files ?? [])[0];
    event.target.value = "";
    if (!file) return;
    if (!isImageFile(file)) return showMessage("error", "Usa fotos JPEG, PNG o WebP.");
    if (file.size > MAX_LISTING_PHOTO_BYTES) return showMessage("error", "Cada foto debe pesar 5 MB o menos.");
    setPhotos((current) => current.map((photo, photoIndex) => {
      if (photoIndex !== index) return photo;
      if (photo.kind === "new") URL.revokeObjectURL(photo.previewUrl);
      return { key: crypto.randomUUID(), kind: "new", file, previewUrl: URL.createObjectURL(file) };
    }));
    setPhotosChanged(true);
  }

  function movePhoto(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= photos.length) return;
    setPhotos((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
    setPhotosChanged(true);
  }

  function removePhoto(index: number) {
    if (photos.length <= MIN_LISTING_PHOTOS) {
      showMessage("error", `Debes conservar al menos ${MIN_LISTING_PHOTOS} fotos.`);
      return;
    }
    setPhotos((current) => {
      const removed = current[index];
      if (removed.kind === "new") URL.revokeObjectURL(removed.previewUrl);
      return current.filter((_, photoIndex) => photoIndex !== index);
    });
    setPhotosChanged(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return showMessage("error", "No se pudo conectar con Laria.");
    if (photos.length < MIN_LISTING_PHOTOS || photos.length > MAX_LISTING_PHOTOS) {
      return showMessage("error", `Agrega entre ${MIN_LISTING_PHOTOS} y ${MAX_LISTING_PHOTOS} fotos.`);
    }
    const formData = new FormData(event.currentTarget);
    const values = {
      title: read(formData, "title"),
      category,
      instrument_type: instrumentType,
      brand: read(formData, "brand"),
      model: read(formData, "model"),
      condition: read(formData, "condition"),
      price_pen: parseWholeSolPrice(read(formData, "price_pen")),
      city: read(formData, "city"),
      region: normalizePeruRegion(read(formData, "region")),
      description: read(formData, "description"),
      attributes: readAttributes(formData, instrumentType),
    };
    if (!values.title || !values.category || !values.instrument_type || !values.brand || !values.model || !values.condition || !values.city || !values.region || values.description.length < 40 || values.price_pen === null) {
      return showMessage("error", "Completa los datos obligatorios y usa una descripción de al menos 40 caracteres.");
    }

    const immediate = changedValues(values, listing, ["price_pen", "description", "city", "region", "attributes"]);
    const moderated = changedValues(values, listing, ["title", "category", "instrument_type", "brand", "model", "condition"]);
    if (!Object.keys(immediate).length && !Object.keys(moderated).length && !photosChanged) {
      return showMessage("error", "No hay cambios para guardar.");
    }
    setBusy(true);
    setMessage("");
    const uploadedPaths: string[] = [];
    try {
      const attemptId = crypto.randomUUID();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Tu sesión ya no es válida. Vuelve a ingresar.");
      let photoPayload: { image_url?: string; path?: string; alt_text: string }[] | undefined;
      if (photosChanged) {
        photoPayload = [];
        for (const [index, photo] of photos.entries()) {
          if (photo.kind === "existing") {
            photoPayload.push({ image_url: photo.imageUrl, alt_text: photo.altText });
            continue;
          }
          const extension = extensionFor(photo.file.type);
          const path = `${authData.user.id}/listing-edits/${listing.id}/${attemptId}/${index}.${extension}`;
          const { error } = await supabase.storage.from("listing-photos").upload(path, photo.file, { contentType: photo.file.type, upsert: false });
          if (error) throw new Error("No se pudo subir una de las fotos.");
          uploadedPaths.push(path);
          photoPayload.push({ path, alt_text: `Foto de ${values.title}` });
        }
      }
      const response = await fetch(`/api/listings/${listing.id}/manage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", immediate, moderated, photos: photoPayload }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ?? "No se pudieron guardar los cambios.");
      const mode = result?.result?.mode;
      showMessage(
        "success",
        mode === "revision" || mode === "revision_amended"
          ? mode === "revision_amended"
            ? "Actualizamos la propuesta pendiente con tus cambios más recientes. La versión pública anterior sigue visible."
            : "Los cambios inmediatos ya se aplicaron. Los cambios principales quedaron en revisión y la versión pública anterior sigue visible."
          : mode === "revision_cancelled"
            ? "Cancelamos la propuesta porque ya coincide con la versión pública aprobada."
            : "Los cambios se guardaron correctamente.",
      );
      setPhotosChanged(false);
      router.refresh();
    } catch (error) {
      if (uploadedPaths.length) {
        await supabase.storage.from("listing-photos").remove(uploadedPaths);
      }
      showMessage("error", error instanceof Error ? error.message : "No se pudieron guardar los cambios.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 rounded-lg border border-laria-fog bg-white p-5 shadow-sm sm:p-6">
      {message ? (
        <PageNotice kind={state === "error" ? "error" : "success"} message={message}>
          {state === "success" ? <Link href={returnHref} className="mt-3 inline-block font-black underline underline-offset-4">Volver al inventario</Link> : null}
        </PageNotice>
      ) : null}

      <div className="rounded-md border border-laria-blue/25 bg-laria-blue/10 p-4 text-sm leading-6 text-laria-text-soft">{moderatedNote}</div>
      <TextField label="Título" name="title" defaultValue={listing.title} />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField label="Categoría" name="category" value={category} onChange={(value) => { setCategory(value); const options = getInstrumentTypeOptions(value); if (!options.some((option) => option.value === instrumentType)) setInstrumentType(options[0]?.value ?? ""); }} options={categoryOptions} />
        <SelectField label="Tipo de instrumento" name="instrument_type" value={instrumentType} onChange={setInstrumentType} options={getInstrumentTypeOptions(category)} />
        <TextField label="Marca" name="brand" defaultValue={listing.brand ?? ""} />
        <TextField label="Modelo" name="model" defaultValue={listing.model ?? ""} />
        <SelectField label="Condición" name="condition" defaultValue={listing.condition ?? ""} options={conditionOptions.map((condition) => ({ value: condition, label: condition }))} />
        <label className="grid gap-2 text-sm font-medium text-laria-text-soft">Precio en soles<input type="text" inputMode="numeric" pattern="[0-9]+" name="price_pen" required defaultValue={listing.price_pen ?? ""} className="h-11 rounded-md border border-laria-steel bg-white px-3 text-sm text-laria-ink outline-none focus:border-laria-blue focus:ring-2 focus:ring-laria-blue/20" /></label>
        <LocationFields defaultCity={listing.city} defaultRegion={listing.region} />
      </div>
      {attributeGroup ? (
        <fieldset className="grid gap-4 rounded-md border border-laria-fog bg-laria-cloud/60 p-4 sm:grid-cols-2">
          <legend className="px-2 text-sm font-black text-laria-ink">Características del instrumento</legend>
          {attributeGroup.filters.map((filter) => <AttributeField key={filter.key} filter={filter} value={listing.attributes?.[filter.key]} />)}
        </fieldset>
      ) : null}
      <label className="grid gap-2 text-sm font-medium text-laria-text-soft">Descripción<textarea name="description" required minLength={40} rows={6} defaultValue={listing.description ?? ""} className="rounded-md border border-laria-steel bg-white px-3 py-3 text-sm text-laria-ink outline-none focus:border-laria-blue focus:ring-2 focus:ring-laria-blue/20" /></label>

      <section className="grid gap-4" aria-labelledby="edit-photo-heading">
        <div><h2 id="edit-photo-heading" className="text-sm font-black text-laria-ink">Fotos</h2><p className="mt-1 text-xs text-laria-text-soft">Entre 2 y 10. La primera es la principal. Las fotos propuestas no reemplazan la versión pública antes de aprobarse.</p></div>
        <label className="laria-button-secondary min-h-11 w-fit cursor-pointer px-4 py-2 text-sm">Agregar fotos<input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={addPhotos} /></label>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo, index) => (
            <li key={photo.key} className="rounded-md border border-laria-fog p-3">
              <div className="relative aspect-[4/3] overflow-hidden rounded bg-laria-cloud"><Image src={photo.kind === "existing" ? photo.imageUrl : photo.previewUrl} alt={`Foto ${index + 1}`} fill unoptimized={photo.kind === "new"} className="object-contain" />{index === 0 ? <span className="absolute left-2 top-2 rounded bg-laria-black px-2 py-1 text-xs font-black text-white">Principal</span> : null}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <button type="button" disabled={index === 0} onClick={() => movePhoto(index, -1)} className="rounded border border-laria-steel px-2 py-1.5 disabled:opacity-40">Anterior</button>
                <button type="button" disabled={index === photos.length - 1} onClick={() => movePhoto(index, 1)} className="rounded border border-laria-steel px-2 py-1.5 disabled:opacity-40">Siguiente</button>
                <label className="cursor-pointer rounded border border-laria-steel px-2 py-1.5 text-center">Reemplazar<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => replacePhoto(index, event)} /></label>
                <button type="button" onClick={() => removePhoto(index)} className="rounded border border-red-200 px-2 py-1.5 text-red-700">Quitar</button>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy} className="laria-button-primary min-h-12 px-5 py-3 text-sm">{busy ? "Guardando…" : "Guardar cambios"}</button><Link href={returnHref} className="laria-button-secondary min-h-12 px-5 py-3 text-sm">Cancelar</Link></div>
    </form>
  );
}

type AttributeFilter = NonNullable<ReturnType<typeof getInstrumentFilterGroup>>["filters"][number];

function AttributeField({ filter, value }: { filter: AttributeFilter; value: unknown }) {
  if (filter.type === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    return <fieldset className="grid gap-2"><legend className="text-sm font-bold text-laria-text-soft">{filter.label}</legend>{filter.options?.map((option) => <label key={option.value} className="flex items-center gap-2 text-sm text-laria-ink"><input type="checkbox" name={`attribute:${filter.key}`} value={option.value} defaultChecked={selected.includes(option.value)} />{option.label}</label>)}</fieldset>;
  }
  return <SelectField label={filter.label} name={`attribute:${filter.key}`} defaultValue={typeof value === "string" || typeof value === "number" ? String(value) : ""} options={filter.options ?? []} required={false} />;
}

function TextField({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  return <label className="grid gap-2 text-sm font-medium text-laria-text-soft">{label}<input type="text" name={name} required defaultValue={defaultValue} className="h-11 rounded-md border border-laria-steel bg-white px-3 text-sm text-laria-ink outline-none focus:border-laria-blue focus:ring-2 focus:ring-laria-blue/20" /></label>;
}

function SelectField({ label, name, options, value, defaultValue, onChange, required = true }: { label: string; name: string; options: readonly { value: string; label: string }[]; value?: string; defaultValue?: string; onChange?: (value: string) => void; required?: boolean }) {
  return <label className="grid gap-2 text-sm font-medium text-laria-text-soft">{label}<select name={name} required={required} value={value} defaultValue={value === undefined ? defaultValue : undefined} onChange={onChange ? (event) => onChange(event.target.value) : undefined} className="h-11 rounded-md border border-laria-steel bg-white px-3 text-sm text-laria-ink outline-none focus:border-laria-blue focus:ring-2 focus:ring-laria-blue/20"><option value="">Selecciona una opción</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function readAttributes(formData: FormData, instrumentType: string) {
  const attributes: ListingSubmissionAttributes = {};
  for (const filter of getInstrumentFilterGroup(instrumentType)?.filters ?? []) {
    const name = `attribute:${filter.key}`;
    if (filter.type === "multiselect") {
      const values = formData.getAll(name).filter((item): item is string => typeof item === "string" && Boolean(item));
      if (values.length) attributes[filter.key] = values;
    } else {
      const value = read(formData, name);
      if (value) attributes[filter.key] = value;
    }
  }
  return attributes;
}

function changedValues(values: Record<string, unknown>, listing: Record<string, unknown>, keys: string[]) {
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    if (JSON.stringify(values[key] ?? null) !== JSON.stringify(listing[key] ?? null)) output[key] = values[key];
  }
  return output;
}

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isImageFile(file: File) {
  return file.size > 0 && ["image/jpeg", "image/png", "image/webp"].includes(file.type);
}

function extensionFor(type: string) {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}
