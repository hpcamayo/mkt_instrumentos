"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { PHOTO_ACCEPT, PhotoPrepareError, prepareListingPhoto } from "@/components/selling/prepare-photo";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ErrorSummary } from "@/components/ui/error-summary";
import { Checkbox, Field, FileInput, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PhoneInput } from "@/components/ui/phone-input";
import { PriceInput } from "@/components/ui/price-input";
import { Textarea } from "@/components/ui/textarea";
import { citySuggestions, peruRegions } from "@/lib/location";
import {
  SERVICE_AREAS_MAX,
  SERVICE_CATEGORY_INFO,
  SERVICE_DESCRIPTION_MAX,
  SERVICE_PHOTO_BUCKET,
  SERVICE_PHOTOS_MAX,
  SERVICE_PROVIDER_MAX,
  SERVICE_TITLE_MAX,
  SERVICE_UNIT_LABELS,
  serviceErrorCode,
  serviceErrorField,
  serviceErrorMessage,
  serviceFormErrors,
  serviceModalityOwnerLabel,
  servicePhotoUrl,
  serviceSavePayload,
  serviceSkillLabel,
  type ServiceCategory,
  type ServiceFormField,
  type ServiceFormValues,
} from "@/lib/services";
import { servicesDb } from "@/lib/services-db";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

const FIELD_ORDER: (ServiceFormField | "photos")[] = ["title", "providerName", "description", "price", "unit", "modalities", "skills", "city", "areas", "whatsapp", "photos"];

export type ServiceFormInitial = {
  id: string | null;
  version: number | null;
  category: ServiceCategory;
  isStore: boolean;
  storeName: string | null;
  values: Omit<ServiceFormValues, "category" | "areas"> & { areas: string };
  status: string | null;
};

// bet-02: create or edit a service. One page, in the order a musician reads it: what (title, name, description), from
// what price, where and how, what they teach or repair, where they work and the zones they cover, the WhatsApp number and
// up to six photos. Nothing is pre-chosen except what the category allows in one way only (a rehearsal room is at its
// own place). Each photo is redrawn in the browser (no GPS data, under 5 MB) and uploaded into the account's own folder
// before saving. Contact details in the text are refused, as on listings. A new service goes to Admin; edits to an
// approved one apply at once.
export function ServiceForm({ initial }: { initial: ServiceFormInitial }) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const id = useId();
  const info = SERVICE_CATEGORY_INFO[initial.category];
  const singleModality = info.modalities.length === 1 ? info.modalities[0] : null;
  const [values, setValues] = useState({
    ...initial.values,
    modalities: singleModality ? [singleModality] : initial.values.modalities,
  });
  const [errors, setErrors] = useState<Partial<Record<ServiceFormField | "photos", string>>>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const creating = initial.id === null;
  // Files uploaded on this page; after saving, the ones the service no longer uses are removed (the bucket only lets an
  // owner delete a photo that no service of theirs uses).
  const uploaded = useRef<string[]>([]);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues((current) => ({ ...current, [key]: value }));
  const toggle = (key: "modalities" | "skills", value: string) =>
    setValues((current) => ({ ...current, [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value] }));

  async function addPhotos(files: File[]) {
    if (!files.length || !supabase) return;
    const room = SERVICE_PHOTOS_MAX - values.photoPaths.length;
    const chosen = files.slice(0, Math.max(0, room));
    if (!chosen.length) return setErrors((current) => ({ ...current, photos: `Puedes subir hasta ${SERVICE_PHOTOS_MAX} fotos.` }));
    const { data } = await supabase.auth.getUser();
    if (!data.user) return setFailure("Tu sesión venció. Ingresa nuevamente.");
    setErrors((current) => ({ ...current, photos: undefined }));
    setUploading(chosen.length);
    for (const file of chosen) {
      try {
        const prepared = await prepareListingPhoto(file);
        const extension = prepared.file.type === "image/png" ? "png" : prepared.file.type === "image/webp" ? "webp" : "jpg";
        const path = `${data.user.id}/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage.from(SERVICE_PHOTO_BUCKET).upload(path, prepared.file, { cacheControl: "31536000", contentType: prepared.file.type });
        if (error) throw error;
        uploaded.current.push(path);
        setValues((current) => ({ ...current, photoPaths: [...current.photoPaths, path].slice(0, SERVICE_PHOTOS_MAX) }));
      } catch (error) {
        setErrors((current) => ({ ...current, photos: error instanceof PhotoPrepareError ? error.message : "No pudimos subir una de las fotos. Intenta nuevamente." }));
      } finally {
        setUploading((count) => count - 1);
      }
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || uploading || !supabase) return;
    setFailure(null);
    const formValues: ServiceFormValues = { ...values, category: initial.category, areas: values.areas.split(/[\n,;]/) };
    const found = serviceFormErrors(formValues, { isStore: initial.isStore });
    if (found.length) {
      setErrors(Object.fromEntries(found.map((item) => [item.field, item.message])));
      setAttempt((count) => count + 1);
      return;
    }
    setErrors({});
    setBusy(true);
    const { data, error } = await servicesDb(supabase).rpc("save_service", {
      p_service_id: initial.id,
      p_fields: serviceSavePayload(formValues, { isStore: initial.isStore }),
      p_expected_version: initial.version,
    });
    setBusy(false);
    if (error) {
      const message = serviceErrorMessage(error.message, "No pudimos guardar el servicio. Intenta nuevamente.");
      const field = serviceErrorField(serviceErrorCode(error.message));
      if (field) {
        setErrors({ [field]: message });
        setAttempt((count) => count + 1);
      } else setFailure(message);
      return;
    }
    const saved = data as { status?: string } | null;
    const unused = [...new Set([...initial.values.photoPaths, ...uploaded.current])].filter((path) => !values.photoPaths.includes(path));
    if (unused.length) void supabase.storage.from(SERVICE_PHOTO_BUCKET).remove(unused).catch(() => undefined);
    router.push(`/mi-cuenta/servicios?guardado=${creating ? "nuevo" : saved?.status === "pending" ? "revision" : "cambios"}`);
    router.refresh();
  }

  const summary = FIELD_ORDER.flatMap((field) => (errors[field] ? [{ id: `${id}-${field}`, message: errors[field] as string }] : []));

  return (
    <form onSubmit={submit} noValidate className="grid max-w-3xl gap-6">
      <ErrorSummary title="Revisa estos datos" errors={summary} attempt={attempt} />
      {failure ? <Notice tone="danger" role="alert">{failure}</Notice> : null}

      <fieldset className="grid gap-4">
        <legend className="mb-1 t-section text-ink">Qué ofreces</legend>
        <Field id={`${id}-title`} label="Título" error={errors.title} hint={`Por ejemplo: ${info.titleExample}.`}>
          <Input value={values.title} onChange={(event) => set("title", event.target.value)} maxLength={SERVICE_TITLE_MAX} autoComplete="off" />
        </Field>
        {initial.isStore ? (
          <p className="t-meta">Se publica con el nombre de tu tienda, {initial.storeName}, y su verificación.</p>
        ) : (
          <Field id={`${id}-providerName`} label="Nombre que verán los músicos" error={errors.providerName} hint="Tu nombre, el de tu taller, sala o estudio.">
            <Input value={values.providerName} onChange={(event) => set("providerName", event.target.value)} maxLength={SERVICE_PROVIDER_MAX} autoComplete="organization" />
          </Field>
        )}
        <Field id={`${id}-description`} label="Descripción" error={errors.description} hint="Qué incluye, tu experiencia, horarios, equipos. Sin teléfonos, enlaces ni correos: te escriben por WhatsApp.">
          <Textarea value={values.description} onChange={(event) => set("description", event.target.value)} maxLength={SERVICE_DESCRIPTION_MAX} rows={7} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-1 t-section text-ink">Precio desde</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${id}-price`} label="Precio desde" error={errors.price} hint="El precio más bajo que cobras. El final lo acuerdas con cada cliente.">
            <PriceInput value={values.price} onValueChange={(text) => set("price", text)} />
          </Field>
          <Field id={`${id}-unit`} label="Se cobra" error={errors.unit}>
            <Select value={values.unit} onChange={(event) => set("unit", event.target.value)}>
              <option value="">Elige una opción</option>
              {info.units.map((unit) => <option key={unit} value={unit}>{SERVICE_UNIT_LABELS[unit]}</option>)}
            </Select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-2" aria-describedby={errors.modalities ? `${id}-modalities-error` : undefined}>
        <legend className="mb-1 t-section text-ink">Dónde das el servicio</legend>
        {singleModality ? (
          <p className="t-ui text-ink-2">{serviceModalityOwnerLabel(singleModality, initial.category)}.</p>
        ) : (
          <div id={`${id}-modalities`} tabIndex={-1} className="grid gap-0.5">
            {info.modalities.map((modality) => (
              <Checkbox key={modality} label={serviceModalityOwnerLabel(modality, initial.category)} checked={values.modalities.includes(modality)} onChange={() => toggle("modalities", modality)} />
            ))}
          </div>
        )}
        {errors.modalities ? <p id={`${id}-modalities-error`} className="t-ui font-semibold text-danger">{errors.modalities}</p> : null}
      </fieldset>

      {info.skills.length && info.skillsQuestion ? (
        <fieldset className="grid gap-2" aria-describedby={errors.skills ? `${id}-skills-error` : `${id}-skills-hint`}>
          <legend className="mb-1 t-section text-ink">{info.skillsQuestion}</legend>
          <p id={`${id}-skills-hint`} className="t-meta">Elige hasta 8.</p>
          <div id={`${id}-skills`} tabIndex={-1} className="flex flex-wrap gap-2">
            {info.skills.map((skill) => (
              <Chip key={skill} selected={values.skills.includes(skill)} onClick={() => toggle("skills", skill)}>{serviceSkillLabel(skill)}</Chip>
            ))}
          </div>
          {errors.skills ? <p id={`${id}-skills-error`} className="t-ui font-semibold text-danger">{errors.skills}</p> : null}
        </fieldset>
      ) : null}

      <fieldset className="grid gap-4">
        <legend className="mb-1 t-section text-ink">Ubicación</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id={`${id}-city`} label="Ciudad" error={errors.city}>
            <Input value={values.city} onChange={(event) => set("city", event.target.value)} list={`${id}-ciudades`} autoComplete="address-level2" />
          </Field>
          <Field id={`${id}-district`} label="Distrito" optional>
            <Input value={values.district} onChange={(event) => set("district", event.target.value)} autoComplete="address-level3" />
          </Field>
          <Field id={`${id}-region`} label="Región" optional>
            <Select value={values.region} onChange={(event) => set("region", event.target.value)}>
              <option value="">Elige una región</option>
              {peruRegions.map((region) => <option key={region} value={region}>{region}</option>)}
            </Select>
          </Field>
        </div>
        <datalist id={`${id}-ciudades`}>
          {citySuggestions.map((city) => <option key={city} value={city} />)}
        </datalist>
        <Field id={`${id}-areas`} label="Zonas que atiendes" optional error={errors.areas} hint={`Otros distritos o ciudades, uno por línea o separados por comas. Hasta ${SERVICE_AREAS_MAX}. Quien busque en esas zonas también te encontrará.`}>
          <Textarea value={values.areas} onChange={(event) => set("areas", event.target.value)} rows={3} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-1 t-section text-ink">Contacto</legend>
        <Field id={`${id}-whatsapp`} label="WhatsApp" error={errors.whatsapp} hint="Los músicos te escriben con el botón de tu página. Laria no muestra tu número en el texto.">
          <PhoneInput defaultValue={values.whatsapp} onChange={(event) => set("whatsapp", event.target.value)} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-3" aria-describedby={`${id}-photos-hint`}>
        <legend className="mb-1 t-section text-ink">Fotos <span className="t-ui font-normal text-ink-2">(opcional)</span></legend>
        <p id={`${id}-photos-hint`} className="t-meta">Hasta {SERVICE_PHOTOS_MAX}: tu sala, tu taller, tu equipo o tus clases. La primera es la portada.</p>
        {values.photoPaths.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {values.photoPaths.map((path, index) => {
              const url = servicePhotoUrl(path);
              return (
                <li key={path} className="grid gap-2">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-control bg-canvas">
                    {url ? <Image src={url} alt={`Foto ${index + 1}`} fill sizes="200px" className="object-cover" /> : null}
                  </div>
                  <div className="flex flex-wrap gap-x-3">
                    {index > 0 ? (
                      <button type="button" className="link inline-flex min-h-6 items-center t-meta font-semibold" onClick={() => set("photoPaths", [path, ...values.photoPaths.filter((item) => item !== path)])}>
                        Usar de portada
                      </button>
                    ) : <span className="t-meta">Portada</span>}
                    <button type="button" className="link inline-flex min-h-6 items-center t-meta font-semibold" onClick={() => set("photoPaths", values.photoPaths.filter((item) => item !== path))}>
                      Quitar<span className="sr-only"> la foto {index + 1}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
        {values.photoPaths.length < SERVICE_PHOTOS_MAX ? (
          <Field id={`${id}-photos`} label="Agregar fotos" error={errors.photos}>
            <FileInput
              accept={PHOTO_ACCEPT}
              multiple
              disabled={uploading > 0}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void addPhotos(files);
              }}
            />
          </Field>
        ) : errors.photos ? <p className="t-ui font-semibold text-danger">{errors.photos}</p> : null}
        {uploading > 0 ? <p role="status" className="t-meta">Subiendo {uploading === 1 ? "1 foto" : `${uploading} fotos`}…</p> : null}
      </fieldset>

      <div className="grid gap-2 border-t border-subtle pt-5">
        <p className="t-meta">
          {creating || initial.status === "rejected" || initial.status === "hidden"
            ? "Moderación revisa el servicio antes de publicarlo y te avisa por aquí y por correo. Al enviarlo aceptas los Términos de Laria, que incluyen las reglas de los servicios."
            : "Los cambios se aplican al instante. Si cambias el título, la descripción, el nombre o las fotos, moderación los revisará después."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={busy} loadingLabel="Guardando…" disabled={uploading > 0}>
            {creating ? "Enviar a revisión" : initial.status === "rejected" || initial.status === "hidden" ? "Guardar y enviar a revisión" : "Guardar cambios"}
          </Button>
          <Button href="/mi-cuenta/servicios" variant="quiet">Cancelar</Button>
        </div>
      </div>
    </form>
  );
}
