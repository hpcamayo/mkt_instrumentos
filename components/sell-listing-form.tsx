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
import { ConditionCards, FormSection, TypeChips } from "@/components/selling/choice-fields";
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
import { createPublicSubmission, type SubmissionProgress } from "@/lib/public-submission";
import {
  DESCRIPTION_MIN,
  PHOTO_GUIDANCE,
  conditionChoices,
  errorSummaryTitle,
  sellConfirmation,
  validateSellDraft,
  type SellError,
  type SellField,
} from "@/lib/sell-form";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { Button, buttonClasses } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/error-summary";
import { Tag } from "@/components/ui/tag";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

// The sell form (docs/ux-redesign/ux-5-selling.md): seven sections, photos first; the form checks itself and lists
// what is missing in an error summary; after sending, a confirmation replaces the form. The submission itself is
// createPublicSubmission, unchanged.

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

const ID = "venta";
// Where each error's summary link lands. Location fields use the same prefix (LocationFields idPrefix).
const FIELD_IDS: Record<SellField, string> = {
  photos: `${ID}-fotos`,
  category: `${ID}-category`,
  instrument_type: `${ID}-instrument_type`,
  brand: `${ID}-brand`,
  model: `${ID}-model`,
  title: `${ID}-title`,
  condition: `${ID}-condition`,
  price_pen: `${ID}-price_pen`,
  city: `${ID}-city`,
  region: `${ID}-region`,
  description: `${ID}-description`,
  marketplace_rules: `${ID}-marketplace_rules`,
};

export function SellListingForm({ profile, store }: { profile: SellerProfile; store?: StoreContext }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const submit = useMemo(
    () => (supabase ? createPublicSubmission(supabase) : null),
    [supabase],
  );
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");
  const [errors, setErrors] = useState<SellError[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const [category, setCategory] = useState("");
  const [instrumentType, setInstrumentType] = useState("");
  const [descriptionLength, setDescriptionLength] = useState(0);
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
  const direct = store?.status === "active" && store.isVerified;
  const busy = state === "submitting";
  const errorFor = (field: SellField) => errors.find((error) => error.field === field)?.message;

  function clearError(field: SellField) {
    setErrors((current) => (current.some((error) => error.field === field) ? current.filter((error) => error.field !== field) : current));
  }

  function showMessage(value: string) {
    setState("error");
    setMessage(value);
  }

  function handleCategoryChange(value: string) {
    const options = getInstrumentTypeOptions(value);
    setCategory(value);
    setInstrumentType(options.length === 1 ? options[0].value : "");
    clearError("category");
  }

  function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    const selected = chosen.filter(isImageFile);
    event.target.value = "";
    if (chosen.some((photo) => !isImageFile(photo))) return showMessage("Usa fotos JPEG, PNG o WebP.");
    if (selected.some((photo) => photo.size > MAX_LISTING_PHOTO_BYTES)) return showMessage("Cada foto debe pesar 5 MB o menos.");
    if (photos.length + selected.length > MAX_LISTING_PHOTOS) return showMessage(`Puedes subir hasta ${MAX_LISTING_PHOTOS} fotos por publicación.`);
    setPhotos((current) => [...current, ...selected]);
    if (photos.length + selected.length >= MIN_LISTING_PHOTOS) clearError("photos");
    setState("idle");
    setMessage("");
  }

  function replacePhoto(index: number, event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    const file = chosen.find(isImageFile);
    event.target.value = "";
    if (!file && chosen.length) return showMessage("Usa una foto JPEG, PNG o WebP.");
    if (!file) return;
    if (file.size > MAX_LISTING_PHOTO_BYTES) return showMessage("Cada foto debe pesar 5 MB o menos.");
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

  // An error clears as soon as its field changes; the summary shrinks with it.
  function handleFieldChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLInputElement;
    if (target.name === "description") setDescriptionLength(target.value.trim().length);
    if (target.name in FIELD_IDS) clearError(target.name as SellField);
  }

  function reportProgress(step: SubmissionProgress) {
    setProgress(step.step === "upload" ? `Subiendo foto ${step.index + 1} de ${step.total}…` : "Enviando la publicación…");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!supabase || !submit) return showMessage("No se pudo conectar con Laria. Intenta nuevamente.");

    const formData = new FormData(event.currentTarget);
    const price = readValue(formData, "price_pen");
    const region = readValue(formData, "region");
    const draft = {
      photoCount: photos.length,
      category,
      instrumentType,
      brand: readValue(formData, "brand"),
      model: readValue(formData, "model"),
      title: readValue(formData, "title"),
      condition: readValue(formData, "condition"),
      price,
      priceValue: parseWholeSolPrice(price),
      city: readValue(formData, "city"),
      region,
      regionValue: normalizePeruRegion(region) || null,
      description: readValue(formData, "description"),
      acceptedRules: formData.get("marketplace_rules") === "on",
    };
    const found = validateSellDraft(draft);
    setMessage("");
    setState("idle");
    if (found.length) {
      setErrors(found);
      setAttempt((count) => count + 1);
      return;
    }
    setErrors([]);
    setState("submitting");
    setProgress("Preparando el envío…");
    try {
      await submit(
        store ? "store_listing" : "listing",
        {
          title: draft.title,
          category,
          instrument_type: instrumentType,
          attributes: readAttributes(formData, instrumentType),
          brand: draft.brand,
          model: draft.model,
          condition: draft.condition,
          price_pen: draft.priceValue,
          city: draft.city,
          region: draft.regionValue,
          description: draft.description,
          marketplace_rules_accepted: true,
        },
        photos,
        reportProgress,
      );
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "No se pudo completar el envío. Intenta nuevamente.");
      setProgress("");
      return;
    }
    setProgress("");
    setState("success");
  }

  // A fresh, empty form: a new key remounts every uncontrolled field.
  function startAnother() {
    setPhotos([]);
    setCategory("");
    setInstrumentType("");
    setDescriptionLength(0);
    setErrors([]);
    setMessage("");
    setState("idle");
    setFormKey((key) => key + 1);
  }

  if (state === "success") {
    const confirmation = sellConfirmation(direct);
    return (
      <div className="grid gap-6 rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <PageNotice kind="success" message={confirmation.message}>
          <p className="mt-2">{confirmation.next}</p>
        </PageNotice>
        <div className="flex flex-wrap gap-3">
          <Link href={store ? "/mi-cuenta/tienda/inventario" : "/mi-cuenta/publicaciones"} className={buttonClasses({ variant: "secondary" })}>{store ? "Ver inventario" : "Ver mis publicaciones"}</Link>
          <button type="button" onClick={startAnother} className={buttonClasses({ variant: "secondary" })}>Publicar otro instrumento</button>
          <Link href="/mi-cuenta" className="link self-center font-semibold">Volver al resumen</Link>
        </div>
      </div>
    );
  }

  return (
    <form
      key={formKey}
      noValidate
      onSubmit={handleSubmit}
      onChange={handleFieldChange}
      aria-busy={busy}
      className="grid gap-6 rounded-panel border border-subtle bg-white p-5 sm:p-6"
    >
      {message ? <PageNotice kind="error" message={message} /> : null}
      <ErrorSummary
        title={errorSummaryTitle(errors.length)}
        errors={errors.map((error) => ({ id: FIELD_IDS[error.field], message: error.message }))}
        attempt={attempt}
      />

      <Notice tone="info" role="note">
        {store ? <>
          Publicarás en <strong className="text-ink">{store.name}</strong>. {direct ? "Como Tienda verificada, tus publicaciones aparecen directamente si cumplen las reglas." : "Tu publicación quedará en revisión antes de aparecer."}
        </> : <>
          Publicarás como <strong className="text-ink">{profile.fullName}</strong>. Las consultas llegarán al WhatsApp <strong className="text-ink">{profile.phone}</strong>. Puedes cambiar estos datos en <Link href="/mi-cuenta/perfil" className="link font-semibold">tu perfil</Link>.
        </>}
      </Notice>

      <fieldset disabled={busy} className="grid min-w-0 gap-6">
        <FormSection id="photo-heading" step={1} title="Fotos" hint={<>Entre {MIN_LISTING_PHOTOS} y {MAX_LISTING_PHOTOS}, JPEG, PNG o WebP de 5 MB o menos. La primera es la principal.</>}>
          <ul className="grid gap-1 t-meta sm:grid-cols-2">
            {PHOTO_GUIDANCE.map((tip) => <li key={tip} className="flex gap-2"><span aria-hidden>·</span>{tip}</li>)}
          </ul>
          {errorFor("photos") ? <p id={`${FIELD_IDS.photos}-error`} className="t-ui font-semibold text-danger">{errorFor("photos")}</p> : null}
          <label className={buttonClasses({ variant: "secondary", className: "w-fit cursor-pointer" })}>
            Agregar fotos
            <input id={FIELD_IDS.photos} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={addPhotos} aria-describedby={errorFor("photos") ? `${FIELD_IDS.photos}-error` : undefined} aria-invalid={errorFor("photos") ? true : undefined} />
          </label>
          {photos.length ? (
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {photos.map((photo, index) => (
                <li key={`${photo.name}-${photo.lastModified}-${index}`} className="rounded-panel border border-subtle bg-white p-3">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-control bg-canvas">
                    <Image src={photoPreviews[index]} alt={`Foto ${index + 1}`} fill unoptimized className="object-contain" />
                    {index === 0 ? <Tag tone="solid" className="absolute left-2 top-2">Principal</Tag> : null}
                  </div>
                  <p className="mt-2 t-meta font-semibold">Foto {index + 1} de {photos.length}{index === 0 ? " · Principal" : ""}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" disabled={index === 0} aria-label={`Mover foto ${index + 1} antes`} onClick={() => movePhoto(index, -1)} className={buttonClasses({ variant: "secondary", size: "sm", className: "min-h-11" })}>Anterior</button>
                    <button type="button" disabled={index === photos.length - 1} aria-label={`Mover foto ${index + 1} después`} onClick={() => movePhoto(index, 1)} className={buttonClasses({ variant: "secondary", size: "sm", className: "min-h-11" })}>Siguiente</button>
                    <label className={buttonClasses({ variant: "secondary", size: "sm", className: "min-h-11 cursor-pointer" })}>Reemplazar<input type="file" aria-label={`Reemplazar foto ${index + 1}`} accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => replacePhoto(index, event)} /></label>
                    <button type="button" disabled={photos.length <= MIN_LISTING_PHOTOS} aria-label={`Quitar foto ${index + 1}`} onClick={() => removePhoto(index)} className={buttonClasses({ variant: "danger", size: "sm", className: "min-h-11" })}>Quitar</button>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
          <p className="t-meta font-semibold" aria-live="polite">{photos.length} de {MAX_LISTING_PHOTOS} fotos</p>
        </FormSection>

        <FormSection id={`${ID}-instrumento`} step={2} title="El instrumento">
          <SelectField label="Categoría" name="category" value={category} onChange={handleCategoryChange} options={categoryOptions} error={errorFor("category")} />
          {category && instrumentOptions.length > 1 ? (
            <TypeChips
              id={FIELD_IDS.instrument_type}
              name="instrument_type"
              legend="Tipo de instrumento"
              options={instrumentOptions}
              value={instrumentType}
              onChange={(value) => { setInstrumentType(value); clearError("instrument_type"); }}
              error={errorFor("instrument_type")}
            />
          ) : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField label="Marca" name="brand" error={errorFor("brand")} />
            <TextField label="Modelo" name="model" error={errorFor("model")} />
          </div>
          <TextField label="Título" name="title" hint="Marca, modelo y lo que lo distingue. Ej.: Fender Player Stratocaster 2021, color Tidepool." error={errorFor("title")} />
        </FormSection>

        <FormSection id={`${ID}-condicion`} step={3} title="Condición y precio">
          <ConditionCards id={FIELD_IDS.condition} name="condition" legend="Condición" options={conditionChoices(conditionOptions)} error={errorFor("condition")} />
          <Field id={FIELD_IDS.price_pen} label="Precio en soles" hint="Solo números, sin decimales." error={errorFor("price_pen")} className="sm:max-w-xs">
            <Input type="text" inputMode="numeric" pattern="[0-9]+" name="price_pen" required />
          </Field>
        </FormSection>

        <FormSection id={`${ID}-ubicacion`} step={4} title="Ubicación" hint="Dónde puede verse o recogerse el instrumento.">
          <div className="grid gap-5 sm:grid-cols-2">
            <LocationFields idPrefix={ID} defaultCity={profile.city} defaultRegion={profile.region} cityError={errorFor("city")} regionError={errorFor("region")} />
          </div>
        </FormSection>

        <FormSection id={`${ID}-descripcion`} step={5} title="Descripción">
          <Field
            id={FIELD_IDS.description}
            label="Descripción"
            labelClassName="sr-only"
            hint={<>Describe el estado real, detalles y accesorios incluidos. {descriptionLength} de {DESCRIPTION_MIN} caracteres mínimos.</>}
            error={errorFor("description")}
          >
            <Textarea name="description" required minLength={DESCRIPTION_MIN} rows={6} />
          </Field>
        </FormSection>

        {attributeGroup ? (
          <FormSection id={`${ID}-caracteristicas`} step={6} title="Características" hint="Opcionales. Ayudan a que te encuentren con los filtros.">
            <div className="grid gap-4 sm:grid-cols-2">
              {attributeGroup.filters.map((filter) => <AttributeField key={filter.key} filter={filter} />)}
            </div>
          </FormSection>
        ) : null}

        <FormSection id={`${ID}-publicar`} step={attributeGroup ? 7 : 6} title="Publicar">
          <div className="grid gap-1.5">
            <label className="flex gap-3 rounded-panel bg-canvas p-3 t-ui text-ink-2">
              <input id={FIELD_IDS.marketplace_rules} type="checkbox" name="marketplace_rules" required className="mt-0.5 h-5 w-5 shrink-0 accent-ink" aria-describedby={errorFor("marketplace_rules") ? `${FIELD_IDS.marketplace_rules}-error` : undefined} aria-invalid={errorFor("marketplace_rules") ? true : undefined} />
              <span>Acepto los <a href="/terminos" target="_blank" rel="noopener" className="link font-semibold">términos y reglas del marketplace</a>, confirmo que el equipo no está entre los <a href="/articulos-prohibidos" target="_blank" rel="noopener" className="link font-semibold">artículos prohibidos</a> y que la información y las fotos son reales. Laria no procesa pagos, no gestiona envíos ni garantiza transacciones.</span>
            </label>
            {errorFor("marketplace_rules") ? <p id={`${FIELD_IDS.marketplace_rules}-error`} className="t-ui font-semibold text-danger">{errorFor("marketplace_rules")}</p> : null}
          </div>
          <p className="t-meta">{direct ? "Aparecerá en el catálogo al publicarla." : "Un administrador la revisará antes de mostrarla. Te avisaremos por correo."}</p>
        </FormSection>
      </fieldset>

      {busy && progress ? <p role="status" aria-live="polite" className="t-ui font-semibold text-ink-2">{progress}</p> : null}
      <Button type="submit" block className="sm:w-auto sm:justify-self-start" disabled={!supabase} loading={busy} loadingLabel="Publicando…">
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
    const value = readValue(formData, name);
    if (!value) continue;
    attributes[filter.key] = value;
  }
  return attributes;
}

function fieldId(name: string) {
  return `${ID}-${name.replace(/[^a-z0-9_-]/gi, "-")}`;
}

function TextField({ label, name, hint, error }: { label: string; name: string; hint?: string; error?: string }) {
  return <Field id={fieldId(name)} label={label} hint={hint} error={error}><Input type="text" name={name} required /></Field>;
}

function SelectField({ label, name, options, value, onChange, error }: { label: string; name: string; options: readonly { value: string; label: string }[]; value?: string; onChange?: (value: string) => void; error?: string }) {
  return <Field id={fieldId(name)} label={label} error={error}><Select name={name} value={value} defaultValue={value === undefined ? "" : undefined} onChange={onChange ? (event) => onChange(event.target.value) : undefined}><option value="">Selecciona una opción</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field>;
}

function readValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isImageFile(value: FormDataEntryValue): value is File {
  return value instanceof File && value.size > 0 && ["image/jpeg", "image/png", "image/webp"].includes(value.type);
}
