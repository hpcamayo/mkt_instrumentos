"use client";

import Image from "next/image";
import Link from "next/link";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
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
import { createPublicSubmission } from "@/lib/public-submission";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type FormState = "idle" | "submitting" | "success" | "error";

type SellerProfile = {
  fullName: string;
  phone: string;
  city: string;
  region: string;
};

export function SellListingForm({ profile }: { profile: SellerProfile }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const submit = useMemo(
    () => (supabase ? createPublicSubmission(supabase) : null),
    [supabase],
  );
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");
  const statusRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!message || !statusRef.current) return;
    statusRef.current.focus({ preventScroll: true });
    statusRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [message, state]);

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
    const pricePen = Number(readRequired(formData, "price_pen"));
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
      !Number.isSafeInteger(pricePen) ||
      pricePen <= 0
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
        "listing",
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
    setMessage("Publicación enviada. Un administrador la revisará antes de hacerla pública.");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-6 rounded-lg border border-laria-fog bg-white p-5 shadow-sm sm:p-6"
    >
      {message ? (
        <StatusMessage ref={statusRef} state={state} message={message} />
      ) : null}

      <div className="rounded-md border border-laria-blue/25 bg-laria-blue/10 p-4 text-sm leading-6 text-laria-text-soft">
        Publicarás como <strong className="text-laria-ink">{profile.fullName}</strong>. Las consultas llegarán al WhatsApp <strong className="text-laria-ink">{profile.phone}</strong>. Puedes cambiar estos datos en <Link href="/mi-cuenta/perfil" className="font-black text-laria-blue underline-offset-4 hover:underline">tu perfil</Link>.
      </div>

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
        <fieldset className="grid gap-4 rounded-md border border-laria-fog bg-laria-cloud/60 p-4 sm:grid-cols-2">
          <legend className="px-2 text-sm font-black text-laria-ink">Características del instrumento <span className="font-normal text-laria-text-soft">(opcionales)</span></legend>
          {attributeGroup.filters.map((filter) => <AttributeField key={filter.key} filter={filter} />)}
        </fieldset>
      ) : null}

      <label className="grid gap-2 text-sm font-medium text-laria-text-soft">
        Descripción
        <textarea name="description" required minLength={40} rows={6} className="rounded-md border border-laria-steel bg-white px-3 py-3 text-sm text-laria-ink outline-none transition focus:border-laria-blue focus:ring-2 focus:ring-laria-blue/20" />
        <span className="text-xs font-normal">Mínimo 40 caracteres. Describe el estado real, detalles y accesorios incluidos.</span>
      </label>

      <section className="grid gap-4" aria-labelledby="photo-heading">
        <div>
          <h2 id="photo-heading" className="text-sm font-black text-laria-ink">Fotos</h2>
          <p className="mt-1 text-xs leading-5 text-laria-text-soft">Agrega entre 2 y 10 fotos. La primera será la imagen principal; incluye vistas frontal y posterior.</p>
        </div>
        <label className="laria-button-secondary min-h-11 w-fit cursor-pointer px-4 py-2 text-sm">
          Agregar fotos
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={addPhotos} />
        </label>
        {photos.length ? (
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((photo, index) => (
              <li key={`${photo.name}-${photo.lastModified}-${index}`} className="rounded-md border border-laria-fog bg-white p-3">
                <div className="relative aspect-[4/3] overflow-hidden rounded bg-laria-cloud">
                  <Image src={photoPreviews[index]} alt={`Vista previa ${index + 1}`} fill unoptimized className="object-contain" />
                  {index === 0 ? <span className="absolute left-2 top-2 rounded bg-laria-black px-2 py-1 text-xs font-black text-white">Principal</span> : null}
                </div>
                <p className="mt-2 truncate text-xs text-laria-text-soft">{photo.name}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <button type="button" disabled={index === 0} onClick={() => movePhoto(index, -1)} className="rounded border border-laria-steel px-2 py-1.5 disabled:opacity-40">Anterior</button>
                  <button type="button" disabled={index === photos.length - 1} onClick={() => movePhoto(index, 1)} className="rounded border border-laria-steel px-2 py-1.5 disabled:opacity-40">Siguiente</button>
                  <label className="cursor-pointer rounded border border-laria-steel px-2 py-1.5 text-center">Reemplazar<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => replacePhoto(index, event)} /></label>
                  <button type="button" disabled={photos.length <= MIN_LISTING_PHOTOS} onClick={() => removePhoto(index)} className="rounded border border-red-200 px-2 py-1.5 text-red-700 disabled:opacity-40">Quitar</button>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
        <p className="text-xs font-semibold text-laria-text-soft">{photos.length} de {MAX_LISTING_PHOTOS} fotos · máximo 5 MB por foto</p>
      </section>

      <label className="flex gap-3 rounded-md border border-laria-fog bg-laria-cloud p-4 text-sm leading-6 text-laria-text-soft">
        <input type="checkbox" name="marketplace_rules" required className="mt-1 h-4 w-4 rounded border-laria-steel text-laria-blue" />
        <span>Acepto las reglas del marketplace y confirmo que la información y las fotos son reales. Laria no procesa pagos, envíos ni garantías.</span>
      </label>

      <button type="submit" disabled={state === "submitting" || !supabase} className="laria-button-primary min-h-12 w-full px-5 py-3 text-sm uppercase tracking-wide sm:w-auto">
        {state === "submitting" ? "Enviando..." : "Enviar para revisión"}
      </button>
    </form>
  );
}

type AttributeFilter = NonNullable<ReturnType<typeof getInstrumentFilterGroup>>["filters"][number];

function AttributeField({ filter }: { filter: AttributeFilter }) {
  if (filter.type === "multiselect") {
    return (
      <fieldset className="grid gap-2">
        <legend className="text-sm font-bold text-laria-text-soft">{filter.label}</legend>
        <div className="grid gap-2">
          {filter.options?.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-laria-ink"><input type="checkbox" name={`attribute:${filter.key}`} value={option.value} />{option.label}</label>
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

function StatusMessage({
  ref,
  state,
  message,
}: {
  ref: React.Ref<HTMLDivElement>;
  state: FormState;
  message: string;
}) {
  return <div ref={ref} tabIndex={-1} role={state === "success" ? "status" : "alert"} className={state === "success" ? "rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 outline-none focus:ring-2 focus:ring-emerald-600/30" : "rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 outline-none focus:ring-2 focus:ring-red-600/30"}>{message}</div>;
}

function TextField({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return <label className="grid gap-2 text-sm font-medium text-laria-text-soft">{label}<input type="text" name={name} required={required} className="h-11 rounded-md border border-laria-steel bg-white px-3 text-sm text-laria-ink outline-none transition focus:border-laria-blue focus:ring-2 focus:ring-laria-blue/20" /></label>;
}

function NumberField({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return <label className="grid gap-2 text-sm font-medium text-laria-text-soft">{label}<input type="number" min="0" name={name} required={required} className="h-11 rounded-md border border-laria-steel bg-white px-3 text-sm text-laria-ink outline-none transition focus:border-laria-blue focus:ring-2 focus:ring-laria-blue/20" /></label>;
}

function SelectField({ label, name, required, options, value, onChange, disabled }: { label: string; name: string; required?: boolean; options: readonly { value: string; label: string }[]; value?: string; onChange?: (value: string) => void; disabled?: boolean }) {
  return <label className="grid gap-2 text-sm font-medium text-laria-text-soft">{label}<select name={name} required={required} value={value} defaultValue={value === undefined ? "" : undefined} disabled={disabled} onChange={onChange ? (event) => onChange(event.target.value) : undefined} className="h-11 rounded-md border border-laria-steel bg-white px-3 text-sm text-laria-ink outline-none transition focus:border-laria-blue focus:ring-2 focus:ring-laria-blue/20 disabled:bg-laria-cloud"><option value="" disabled>Selecciona una opción</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function readRequired(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isImageFile(value: FormDataEntryValue): value is File {
  return value instanceof File && value.size > 0 && ["image/jpeg", "image/png", "image/webp"].includes(value.type);
}
