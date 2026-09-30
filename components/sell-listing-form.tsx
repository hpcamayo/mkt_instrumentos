"use client";

import Image from "next/image";
import Link from "next/link";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { LocationFields } from "@/components/location-fields";
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
import { PageNotice } from "@/components/page-notice";
import { parseWholeSolPrice } from "@/lib/price";
import { createPublicSubmission } from "@/lib/public-submission";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { Button, buttonClasses } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

type FormState = "idle" | "submitting" | "success" | "error";

type SellerProfile = {
  fullName: string;
  phone: string;
  city: string;
  region: string;
};

type StoreContext = {
  id: string;
  name: string;
  status: "pending" | "active";
  isVerified: boolean;
};

export function SellListingForm({ profile, store }: { profile: SellerProfile; store?: StoreContext }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const submit = useMemo(
    () => (supabase ? createPublicSubmission(supabase) : null),
    [supabase],
  );
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("");
  const [instrumentType, setInstrumentType] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const photoPreviews = useMemo(
    () => photos.map((photo) => URL.createObjectURL(photo)),
    [photos],
  );

  useEffect(
    () => () => photoPreviews.forEach((preview) => URL.revokeObjectURL(preview)),
    [photoPreviews],
  );

  const instrumentOptions = useMemo(
    () => getInstrumentTypeOptions(category),
    [category],
  );
  const attributeGroup = instrumentType
    ? getInstrumentFilterGroup(instrumentType)
    : null;

  function handleCategoryChange(value: string) {
    const options = getInstrumentTypeOptions(value);
    setCategory(value);
    setInstrumentType(options.length === 1 ? options[0].value : "");
  }

  function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    const selected = chosen.filter(isImageFile);
    event.target.value = "";
    if (chosen.some((photo) => !isImageFile(photo))) {
      setState("error");
      setMessage("Usa fotos JPEG, PNG o WebP.");
      return;
    }
    if (selected.some((photo) => photo.size > MAX_LISTING_PHOTO_BYTES)) {
      setState("error");
      setMessage("Cada foto debe pesar 5 MB o menos.");
      return;
    }
    if (photos.length + selected.length > MAX_LISTING_PHOTOS) {
      setState("error");
      setMessage(`Puedes subir hasta ${MAX_LISTING_PHOTOS} fotos por publicación.`);
      return;
    }
    setPhotos((current) => [...current, ...selected]);
    setState("idle");
    setMessage("");
  }

  function replacePhoto(index: number, event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    const file = chosen.find(isImageFile);
    event.target.value = "";
    if (!file && chosen.length) {
      setState("error");
      setMessage("Usa una foto JPEG, PNG o WebP.");
      return;
    }
    if (!file) return;
    if (file.size > MAX_LISTING_PHOTO_BYTES) {
      setState("error");
      setMessage("Cada foto debe pesar 5 MB o menos.");
      return;
    }
    setPhotos((current) =>
      current.map((photo, photoIndex) => (photoIndex === index ? file : photo)),
    );
  }

  function movePhoto(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= photos.length) return;
    setPhotos((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  }

  function removePhoto(index: number) {
    if (photos.length <= MIN_LISTING_PHOTOS) return;
    setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !submit) {
      setState("error");
      setMessage("No se pudo conectar con Laria. Intenta nuevamente.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = readRequired(formData, "title");
    const brand = readRequired(formData, "brand");
    const model = readRequired(formData, "model");
    const condition = readRequired(formData, "condition");
    const pricePen = parseWholeSolPrice(readRequired(formData, "price_pen"));
    const city = readRequired(formData, "city");
    const region = normalizePeruRegion(readRequired(formData, "region"));
    const description = readRequired(formData, "description");
    const acceptedRules = formData.get("marketplace_rules") === "on";

    if (
      !title ||
      !category ||
      !instrumentType ||
      !brand ||
      !model ||
      !condition ||
      !city ||
      !region ||
      description.length < 40 ||
      pricePen === null
    ) {
      setState("error");
      setMessage("Completa los datos obligatorios y escribe una descripción de al menos 40 caracteres.");
      return;
    }
    if (!acceptedRules) {
      setState("error");
      setMessage("Debes aceptar las reglas del marketplace para publicar.");
      return;
    }
    if (photos.length < MIN_LISTING_PHOTOS || photos.length > MAX_LISTING_PHOTOS) {
      setState("error");
      setMessage(`Agrega entre ${MIN_LISTING_PHOTOS} y ${MAX_LISTING_PHOTOS} fotos.`);
      return;
    }

    setState("submitting");
    setMessage("");
    try {
      await submit(
        store ? "store_listing" : "listing",
        {
          title,
          category,
          instrument_type: instrumentType,
          attributes: readAttributes(formData, instrumentType),
          brand,
          model,
          condition,
          price_pen: pricePen,
          city,
          region,
          description,
          marketplace_rules_accepted: true,
        },
        photos,
      );
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo completar el envío. Intenta nuevamente.",
      );
      return;
    }

    form.reset();
    setCategory("");
    setInstrumentType("");
    setPhotos([]);
    setState("success");
    setMessage(
      store?.status === "active" && store.isVerified
        ? "Tu publicación ya está en el catálogo."
        : "Publicación enviada. Un administrador la revisará antes de hacerla pública.",
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-6 rounded-panel border border-subtle bg-white p-5 sm:p-6"
    >
      {message ? (
        <PageNotice kind={state === "success" ? "success" : "error"} message={message}>
          {state === "success" ? <div className="mt-3 flex flex-wrap gap-3"><Link href="/mi-cuenta" className="link font-semibold">Volver al resumen</Link><Link href={store ? "/mi-cuenta/tienda/inventario" : "/mi-cuenta/publicaciones"} className="link font-semibold">{store ? "Ver inventario" : "Ver mis publicaciones"}</Link></div> : null}
        </PageNotice>
      ) : null}

      <Notice tone="info" role="note">
        {store ? <>
          Publicarás en <strong className="text-ink">{store.name}</strong>. {store.status === "active" && store.isVerified ? "Como Tienda verificada, tus publicaciones aparecen directamente si cumplen las reglas." : "Tu publicación quedará en revisión antes de aparecer."}
        </> : <>
          Publicarás como <strong className="text-ink">{profile.fullName}</strong>. Las consultas llegarán al WhatsApp <strong className="text-ink">{profile.phone}</strong>. Puedes cambiar estos datos en <Link href="/mi-cuenta/perfil" className="link font-semibold">tu perfil</Link>.
        </>}
      </Notice>

      <TextField label="Título" name="title" required />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField label="Categoría" name="category" required value={category} onChange={handleCategoryChange} options={categoryOptions} />
        <SelectField label="Tipo de instrumento" name="instrument_type" required value={instrumentType} onChange={setInstrumentType} disabled={!category} options={instrumentOptions} />
        <TextField label="Marca" name="brand" required />
        <TextField label="Modelo" name="model" required />
        <SelectField label="Condición" name="condition" required options={conditionOptions.map((condition) => ({ value: condition, label: condition }))} />
        <NumberField label="Precio en soles" name="price_pen" required />
        <LocationFields defaultCity={profile.city} defaultRegion={profile.region} />
      </div>

      {attributeGroup ? (
        <fieldset className="grid gap-4 rounded-panel border border-subtle bg-canvas p-4 sm:grid-cols-2">
          <legend className="px-2 t-ui font-semibold text-ink">Características del instrumento <span className="font-normal text-ink-2">(opcionales)</span></legend>
          {attributeGroup.filters.map((filter) => <AttributeField key={filter.key} filter={filter} />)}
        </fieldset>
      ) : null}

      <Field id="venta-description" label="Descripción" hint="Mínimo 40 caracteres. Describe el estado real, detalles y accesorios incluidos.">
        <Textarea name="description" required minLength={40} rows={6} />
      </Field>

      <section className="grid gap-4" aria-labelledby="photo-heading">
        <div>
          <h2 id="photo-heading" className="t-section text-ink">Fotos</h2>
          <p className="mt-1 t-meta">Agrega entre 2 y 10 fotos. La primera será la imagen principal; incluye vistas frontal y posterior.</p>
        </div>
        <label className={buttonClasses({ variant: "secondary", className: "w-fit cursor-pointer" })}>
          Agregar fotos
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={addPhotos} />
        </label>
        {photos.length ? (
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((photo, index) => (
              <li key={`${photo.name}-${photo.lastModified}-${index}`} className="rounded-panel border border-subtle bg-white p-3">
                <div className="relative aspect-[4/3] overflow-hidden rounded-control bg-canvas">
                  <Image src={photoPreviews[index]} alt={`Vista previa ${index + 1}`} fill unoptimized className="object-contain" />
                  {index === 0 ? <Tag tone="solid" className="absolute left-2 top-2">Principal</Tag> : null}
                </div>
                <p className="mt-2 truncate t-meta">{photo.name}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" disabled={index === 0} onClick={() => movePhoto(index, -1)} className={buttonClasses({ variant: "secondary", size: "sm", className: "min-h-11" })}>Anterior</button>
                  <button type="button" disabled={index === photos.length - 1} onClick={() => movePhoto(index, 1)} className={buttonClasses({ variant: "secondary", size: "sm", className: "min-h-11" })}>Siguiente</button>
                  <label className={buttonClasses({ variant: "secondary", size: "sm", className: "min-h-11 cursor-pointer" })}>Reemplazar<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => replacePhoto(index, event)} /></label>
                  <button type="button" disabled={photos.length <= MIN_LISTING_PHOTOS} onClick={() => removePhoto(index)} className={buttonClasses({ variant: "danger", size: "sm", className: "min-h-11" })}>Quitar</button>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
        <p className="t-meta font-semibold">{photos.length} de {MAX_LISTING_PHOTOS} fotos · máximo 5 MB por foto</p>
      </section>

      <label className="flex gap-3 rounded-panel bg-canvas p-3 t-ui text-ink-2">
        <input type="checkbox" name="marketplace_rules" required className="mt-0.5 h-5 w-5 shrink-0 accent-ink" />
        <span>Acepto los <a href="/terminos" target="_blank" rel="noopener" className="link font-semibold">términos y reglas del marketplace</a>, confirmo que el artículo no está entre los <a href="/articulos-prohibidos" target="_blank" rel="noopener" className="link font-semibold">artículos prohibidos</a> y que la información y las fotos son reales. Laria no procesa pagos, no gestiona envíos ni garantiza transacciones.</span>
      </label>

      <Button type="submit" block className="sm:w-auto sm:justify-self-start" disabled={!supabase} loading={state === "submitting"} loadingLabel="Enviando...">
        Publicar
      </Button>
    </form>
  );
}

type AttributeFilter = NonNullable<ReturnType<typeof getInstrumentFilterGroup>>["filters"][number];

function AttributeField({ filter }: { filter: AttributeFilter }) {
  if (filter.type === "multiselect") {
    return (
      <fieldset className="grid gap-2">
        <legend className="t-ui font-semibold text-ink">{filter.label}</legend>
        <div className="grid gap-2">
          {filter.options?.map((option) => (
            <Checkbox key={option.value} name={`attribute:${filter.key}`} value={option.value} label={option.label} className="min-h-0 py-1" />
          ))}
        </div>
      </fieldset>
    );
  }
  return <SelectField label={filter.label} name={`attribute:${filter.key}`} options={filter.options ?? []} />;
}

function readAttributes(formData: FormData, instrumentType: string) {
  const group = getInstrumentFilterGroup(instrumentType);
  const attributes: ListingSubmissionAttributes = {};
  for (const filter of group?.filters ?? []) {
    const name = `attribute:${filter.key}`;
    if (filter.type === "multiselect") {
      const values = formData.getAll(name).filter((value): value is string => typeof value === "string" && Boolean(value));
      if (values.length) attributes[filter.key] = values;
      continue;
    }
    const value = readRequired(formData, name);
    if (!value) continue;
    attributes[filter.key] = value;
  }
  return attributes;
}

function fieldId(name: string) {
  return `venta-${name.replace(/[^a-z0-9_-]/gi, "-")}`;
}

function TextField({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return <Field id={fieldId(name)} label={label}><Input type="text" name={name} required={required} /></Field>;
}

function NumberField({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return <Field id={fieldId(name)} label={label}><Input type="text" inputMode="numeric" pattern="[0-9]+" name={name} required={required} /></Field>;
}

function SelectField({ label, name, required, options, value, onChange, disabled }: { label: string; name: string; required?: boolean; options: readonly { value: string; label: string }[]; value?: string; onChange?: (value: string) => void; disabled?: boolean }) {
  return <Field id={fieldId(name)} label={label}><Select name={name} required={required} value={value} defaultValue={value === undefined ? "" : undefined} disabled={disabled} onChange={onChange ? (event) => onChange(event.target.value) : undefined}><option value="" disabled>Selecciona una opción</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field>;
}

function readRequired(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isImageFile(value: FormDataEntryValue): value is File {
  return value instanceof File && value.size > 0 && ["image/jpeg", "image/png", "image/webp"].includes(value.type);
}
