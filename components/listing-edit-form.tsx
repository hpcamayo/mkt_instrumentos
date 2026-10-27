"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LocationFields } from "@/components/location-fields";
import { PageNotice } from "@/components/page-notice";
import { ConditionCards, FormSection } from "@/components/selling/choice-fields";
import { ListingDetailFields } from "@/components/listing-details/detail-fields";
import { PriceModeField, SALE_TERMS_KEY } from "@/components/listing-details/sale-terms-fields";
import { MAX_SOURCE_PHOTO_BYTES, prepareListingPhoto } from "@/components/selling/prepare-photo";
import { getInstrumentFilterGroup } from "@/lib/instrument-filters";
import {
  MAX_LISTING_PHOTOS,
  MIN_LISTING_PHOTOS,
  getInstrumentTypeOptions,
  type ListingSubmissionAttributes,
} from "@/lib/listing-submission";
import { currentCondition } from "@/lib/listing-condition";
import { checkListingDetails } from "@/lib/listing-details";
import { categoryOptions, conditionOptions, particularConditionOptions } from "@/lib/listings";
import { normalizePeruRegion } from "@/lib/location";
import { parseWholeSolPrice } from "@/lib/price";
import { readSaleTerms, saleTermsFromListing, type ListingSaleTerms } from "@/lib/sale-terms";
import { conditionChoices, validateSellDraft } from "@/lib/sell-form";
import { useFormErrors } from "@/components/use-form-errors";
import { returnLabel } from "@/lib/listing-return";
import { fieldsForRejection, rejectionNote, rejectionReasonLabel, type ListingField } from "@/lib/rejection-reasons";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { uploadLimitReached } from "@/lib/upload-allowance";
import { Button, buttonClasses } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { PriceInput } from "@/components/ui/price-input";
import { Notice } from "@/components/ui/notice";
import { Tag } from "@/components/ui/tag";
import { Textarea } from "@/components/ui/textarea";
import { ListingSerialField } from "@/components/stolen-gear/listing-serial-field";

type ExistingPhoto = {
  id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
};

type EditableListing = ListingSaleTerms & {
  id: string;
  store_id?: string | null;
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

// mine-01: what the moderator rejected, so the form opens on what to fix.
export type EditRejection = { kind: "listing" | "revision"; reason: string | null; codes: string[] };

type PhotoItem =
  | { key: string; kind: "existing"; imageUrl: string; altText: string }
  | { key: string; kind: "new"; file: File; previewUrl: string };

type PhotoPayload = { image_url?: string; path?: string; alt_text: string };
type EditAttempt = {
  token: string;
  attemptId: string;
  folder: string;
  bucket: "listing-edit-photos";
  fingerprint: string;
  uploadedPaths: string[];
  photoPayload?: PhotoPayload[];
  prepared: boolean;
};

export function ListingEditForm({
  listing,
  hasPendingRevision,
  isVerifiedStore,
  returnHref,
  livePhotos,
  initialNotice = "",
  rejection = null,
}: {
  listing: EditableListing;
  hasPendingRevision: boolean;
  isVerifiedStore: boolean;
  returnHref: string;
  livePhotos: ExistingPhoto[];
  initialNotice?: string;
  rejection?: EditRejection | null;
}) {
  const router = useRouter();
  const [validation, errorSummary] = useFormErrors("editar", "guardar los cambios");
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [category, setCategory] = useState(listing.category);
  const [instrumentType, setInstrumentType] = useState(listing.instrument_type ?? "");
  const [photos, setPhotos] = useState<PhotoItem[]>(() => existingPhotoItems(listing.listing_photos));
  const [photosChanged, setPhotosChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "success" | "error">(initialNotice ? "success" : "idle");
  const [message, setMessage] = useState(initialNotice);
  const [progress, setProgress] = useState("");
  const photosRef = useRef(photos);
  const busyRef = useRef(false);
  const attemptRef = useRef<EditAttempt | null>(null);
  // listing-details: sale terms and other batches' fields, saved at once through the "details" action.
  const isStore = Boolean(listing.store_id);
  const savedDetails = useMemo<Record<string, unknown>>(() => ({ [SALE_TERMS_KEY]: saleTermsFromListing(listing) }), [listing]);
  const [details, setDetails] = useState(savedDetails);
  const [detailError, setDetailError] = useState<{ key?: string; field?: string; message: string } | null>(null);

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
  const flagged = useMemo(() => fieldsForRejection(rejection?.codes ?? []), [rejection]);
  // mine-02: rejected listings and drafts are fixed and sent in one step; published ones keep "Guardar cambios".
  const sendsForReview = listing.status === "rejected" || listing.status === "draft";
  const submitLabel = sendsForReview ? (isVerifiedStore ? "Guardar y publicar" : "Guardar y enviar a revisión") : "Guardar cambios";
  // Which fields go live at once and which wait for review (approved listings of Particulares and unverified stores).
  const showsReviewSplit = (listing.status === "approved" || listing.status === "hidden") && !isVerifiedStore;
  const [pendingKinds, setPendingKinds] = useState<{ immediate: boolean; moderated: boolean }>({ immediate: false, moderated: false });
  const fieldTag = (field: ListingField | "price_pen" | "location" | "attributes") => {
    const reviewed = ["photos", "title", "category", "instrument_type", "brand", "model", "condition"].includes(field);
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        {flagged.has(field as ListingField) ? <Tag tone="danger">Revisar</Tag> : null}
        {showsReviewSplit ? <Tag tone={reviewed ? "line" : "neutral"}>{reviewed ? "Pasa por revisión" : "Se publica al instante"}</Tag> : null}
      </span>
    );
  };
  const labelWith = (label: string, field: Parameters<typeof fieldTag>[0]) => <span className="inline-flex flex-wrap items-center gap-2">{label}{fieldTag(field)}</span>;

  function trackChanges(form: HTMLFormElement) {
    if (!showsReviewSplit) return;
    const formData = new FormData(form);
    const current: Record<string, unknown> = {
      title: read(formData, "title"), category, instrument_type: instrumentType, brand: read(formData, "brand"), model: read(formData, "model"), condition: read(formData, "condition"),
      price_pen: parseWholeSolPrice(read(formData, "price_pen")), description: read(formData, "description"), city: read(formData, "city"), region: normalizePeruRegion(read(formData, "region")),
    };
    const moderatedNow = Object.keys(changedValues(current, listing, ["title", "category", "instrument_type", "brand", "model", "condition"])).length > 0 || photosChanged;
    const immediateNow = Object.keys(changedValues(current, listing, ["price_pen", "description", "city", "region"])).length > 0;
    setPendingKinds((previous) => (previous.immediate === immediateNow && previous.moderated === moderatedNow ? previous : { immediate: immediateNow, moderated: moderatedNow }));
  }
  const moderatedNote =
    listing.status === "approved" || listing.status === "hidden"
      ? isVerifiedStore
        ? "Como Tienda verificada, tus cambios se aplican directamente."
        : hasPendingRevision
          ? "Ya tienes cambios en revisión. Puedes seguir ajustando título, categoría, tipo, marca, modelo, condición o fotos; se actualizarán esos mismos cambios sin modificar la versión pública."
          : "Precio, descripción, ubicación, características, entrega y cambios se actualizan ahora. Título, categoría, tipo, marca, modelo, condición y fotos requieren revisión; la versión pública actual no cambia mientras tanto."
      : "Los cambios se guardan directamente porque esta publicación todavía no es una versión pública aprobada.";

  function showMessage(nextState: "success" | "error", value: string) {
    setState(nextState);
    setMessage(value);
  }

  function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    if (busyRef.current) return;
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.some((file) => !isImageFile(file))) {
      showMessage("error", "Usa fotos JPEG, PNG o WebP.");
      return;
    }
    if (files.some((file) => file.size > MAX_SOURCE_PHOTO_BYTES)) {
      showMessage("error", "Una de las fotos es demasiado pesada. Prueba con otra.");
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
    validation.clear("photos");
    setState("idle");
    setMessage("");
  }

  function replacePhoto(index: number, event: ChangeEvent<HTMLInputElement>) {
    if (busyRef.current) return;
    const file = Array.from(event.target.files ?? [])[0];
    event.target.value = "";
    if (!file) return;
    if (!isImageFile(file)) return showMessage("error", "Usa fotos JPEG, PNG o WebP.");
    if (file.size > MAX_SOURCE_PHOTO_BYTES) return showMessage("error", "Esta foto es demasiado pesada. Prueba con otra.");
    setPhotos((current) => current.map((photo, photoIndex) => {
      if (photoIndex !== index) return photo;
      if (photo.kind === "new") URL.revokeObjectURL(photo.previewUrl);
      return { key: crypto.randomUUID(), kind: "new", file, previewUrl: URL.createObjectURL(file) };
    }));
    setPhotosChanged(true);
  }

  function movePhoto(index: number, direction: -1 | 1) {
    if (busyRef.current) return;
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
    if (busyRef.current) return;
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

  function restoreLivePhotos() {
    if (busyRef.current) return;
    for (const photo of photos) {
      if (photo.kind === "new") URL.revokeObjectURL(photo.previewUrl);
    }
    setPhotos(existingPhotoItems(livePhotos));
    setPhotosChanged(true);
    validation.clear("photos");
    setState("idle");
    setMessage("");
  }

  async function cleanupAttempt(attempt: EditAttempt) {
    if (!attempt.uploadedPaths.length) return;
    const response = await fetch(`/api/listings/${listing.id}/photo-cleanup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: attempt.uploadedPaths, bucket: attempt.bucket }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true || !Array.isArray(result.removed)) {
      throw new Error("No se pudo completar la limpieza segura de las fotos. Intenta nuevamente.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    if (!supabase) return showMessage("error", "No se pudo conectar con Laria.");
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
    const errors = validateSellDraft({
      photoCount: photos.length, category, instrumentType,
      brand: values.brand, model: values.model, title: values.title, condition: values.condition,
      price: read(formData, "price_pen"), priceValue: values.price_pen,
      city: values.city, region: read(formData, "region"), regionValue: values.region,
      description: values.description, acceptedRules: true,
      details, isStore,
    });
    // A detail's error belongs to its input (named `editar-<field>` in components/listing-details).
    const detailProblem = errors.find((error) => error.field === "details");
    setDetailError(detailProblem ? { key: detailProblem.key, field: detailProblem.target, message: detailProblem.message } : null);
    if (!validation.validate(event.currentTarget, Object.fromEntries(errors.map((error) => [error.target ? `editar-${error.target}` : error.field, error.message])))) {
      setMessage("");
      setState("idle");
      return;
    }

    const immediate = changedValues(values, listing, ["price_pen", "description", "city", "region", "attributes"]);
    const moderated = changedValues(values, listing, ["title", "category", "instrument_type", "brand", "model", "condition"]);
    const checkedDetails = checkListingDetails(details, { isStore });
    const checkedSaved = checkListingDetails(savedDetails, { isStore });
    const detailsChanged = checkedDetails.ok && JSON.stringify(checkedDetails.details) !== JSON.stringify(checkedSaved.ok ? checkedSaved.details : null);
    const unchanged = !Object.keys(immediate).length && !Object.keys(moderated).length && !photosChanged;
    if (unchanged && !detailsChanged && !sendsForReview) {
      return showMessage("error", "No hay cambios para guardar.");
    }
    if (unchanged) {
      busyRef.current = true;
      setBusy(true);
      setProgress(sendsForReview ? (isVerifiedStore ? "Publicando…" : "Enviando a revisión…") : "Guardando los cambios…");
      try {
        if (detailsChanged && checkedDetails.ok) await saveDetails(checkedDetails.details);
        if (!sendsForReview) {
          showMessage("success", "Los cambios se guardaron correctamente.");
          router.refresh();
          return;
        }
        await submitForReview();
      } catch (error) {
        showMessage("error", error instanceof Error ? error.message : "No se pudo enviar la publicación.");
      } finally {
        busyRef.current = false;
        setBusy(false);
        setProgress("");
      }
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    setProgress("Preparando los cambios…");
    let finalizationStarted = false;
    try {
      const fingerprint = JSON.stringify({
        immediate,
        moderated,
        photos: photosChanged ? photos.map((photo) => photo.kind === "existing"
          ? { key: photo.key, imageUrl: photo.imageUrl, altText: photo.altText }
          : { key: photo.key, name: photo.file.name, size: photo.file.size, type: photo.file.type, lastModified: photo.file.lastModified }) : null,
      });
      const previousAttempt = attemptRef.current;
      if (previousAttempt && (previousAttempt.fingerprint !== fingerprint || !previousAttempt.prepared)) {
        await cleanupAttempt(previousAttempt);
        attemptRef.current = null;
      }
      if (!attemptRef.current) {
        const started = await fetch(`/api/listings/${listing.id}/manage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start_edit" }),
        });
        const capability = await started.json().catch(() => null);
        if (!started.ok) throw new Error(capability?.message ?? "No se pudo preparar el guardado. Vuelve a ingresar o intenta nuevamente.");
        if (!capability?.token || !capability.attemptId || !capability.folder || capability.bucket !== "listing-edit-photos") {
          throw new Error("No se pudo preparar la subida segura de fotos.");
        }
        attemptRef.current = { ...capability, fingerprint, uploadedPaths: [], prepared: false };
      }
      const attempt = attemptRef.current;
      if (!attempt) throw new Error("No se pudo preparar el intento de guardado.");
      if (!attempt.prepared && photosChanged) {
        attempt.photoPayload = [];
        for (const [index, photo] of photos.entries()) {
          if (photo.kind === "existing") {
            attempt.photoPayload.push({ image_url: photo.imageUrl, alt_text: photo.altText });
            continue;
          }
          // FIX 02 (selling batch): shrink and re-encode before upload, which drops the photo's location data.
          const upload = (await prepareListingPhoto(photo.file)).file;
          const extension = extensionFor(upload.type);
          const path = `${attempt.folder}/${index}.${extension}`;
          // Include uncertain upload responses in server-side, reference-checked cleanup.
          attempt.uploadedPaths.push(path);
          setProgress(`Subiendo foto ${index + 1} de ${photos.length}…`);
          const { error } = await supabase.storage.from(attempt.bucket).upload(path, upload, { contentType: upload.type, upsert: false });
          // Launch audit A18: a refusal may be the account's daily limit, whose message says when the next one fits.
          if (error) throw (await uploadLimitReached(supabase, attempt.bucket)) ?? new Error("No se pudo subir una de las fotos.");
          attempt.photoPayload.push({ path, alt_text: `Foto de ${values.title}` });
        }
      }
      attempt.prepared = true;
      finalizationStarted = true;
      setProgress("Guardando los cambios…");
      if (detailsChanged && checkedDetails.ok) await saveDetails(checkedDetails.details);
      const response = await fetch(`/api/listings/${listing.id}/manage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", token: attempt.token, immediate, moderated, photos: attempt.photoPayload }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result) throw new Error(result?.message ?? "No se pudo confirmar el guardado. Reintenta sin cambiar los datos; no volveremos a subir las fotos.");
      const mode = result?.result?.mode;
      if (sendsForReview) {
        attemptRef.current = null;
        setProgress(isVerifiedStore ? "Publicando…" : "Enviando a revisión…");
        await submitForReview();
        return;
      }
      showMessage(
        "success",
        mode === "revision" || mode === "revision_amended"
          ? mode === "revision_amended"
            ? "Actualizamos tus cambios en revisión con la edición más reciente. La versión pública anterior sigue visible."
            : "Los cambios inmediatos ya se aplicaron. Los cambios principales quedaron en revisión y la versión pública anterior sigue visible."
          : mode === "revision_cancelled"
            ? "Cancelamos los cambios en revisión porque ya coinciden con la versión publicada."
            : "Los cambios se guardaron correctamente.",
      );
      // Keep the prepared request until server refresh: an immediate repeat is an exact replay.
      router.replace(`/mi-cuenta/publicaciones/${listing.id}/editar?guardado=${encodeURIComponent(mode ?? "direct")}`, { scroll: false });
      router.refresh();
    } catch (error) {
      let cleanupMessage = "";
      if (!finalizationStarted && attemptRef.current && !attemptRef.current.prepared) {
        try {
          await cleanupAttempt(attemptRef.current);
          attemptRef.current = null;
        } catch {
          cleanupMessage = " No se pudo completar la limpieza segura; vuelve a intentar antes de subir otras fotos.";
        }
      }
      showMessage("error", error instanceof Error ? error.message : "No se pudieron guardar los cambios.");
      if (cleanupMessage) setMessage((current) => current + cleanupMessage);
    } finally {
      busyRef.current = false;
      setBusy(false);
      setProgress("");
    }
  }

  async function saveDetails(payload: Record<string, unknown>) {
    const response = await fetch(`/api/listings/${listing.id}/manage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "details", details: payload }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.message ?? "No se pudo guardar la entrega y los cambios. Intenta nuevamente.");
  }

  function setDetail(key: string, value: unknown) {
    setDetails((current) => ({ ...current, [key]: value }));
    setDetailError(null);
    setState("idle");
    setMessage("");
  }

  async function submitForReview() {
    const sent = await fetch(`/api/listings/${listing.id}/manage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resubmit" }),
    });
    const sentResult = await sent.json().catch(() => null);
    if (!sent.ok) throw new Error(sentResult?.message ?? "Guardamos los cambios, pero no se pudo enviar la publicación. Inténtalo de nuevo.");
    const published = sentResult?.listing?.status === "approved";
    showMessage("success", published ? "Tu publicación ya está en el catálogo." : "Enviada a revisión. Te avisaremos apenas la revisemos.");
    router.refresh();
  }

  return (
    <form ref={validation.formRef} noValidate onSubmit={handleSubmit} onChange={(event) => { validation.onChange(event); trackChanges(event.currentTarget); }} aria-busy={busy} className="grid gap-6 rounded-panel border border-subtle bg-white p-5 sm:p-6">
      {message ? (
        <PageNotice kind={state === "error" ? "error" : "success"} message={message}>
          {state === "success" ? <Link href={returnHref} className="link mt-3 inline-block font-semibold">{returnLabel(returnHref)}</Link> : null}
        </PageNotice>
      ) : null}

      {errorSummary}
      <fieldset disabled={busy} className="grid min-w-0 gap-6">
      {rejection ? <RejectionChecklist rejection={rejection} /> : null}
      <Notice tone="info" role="note">{moderatedNote}</Notice>

      <section className="grid gap-4" aria-labelledby="edit-photo-heading">
        <div><h2 id="edit-photo-heading" className="flex flex-wrap items-center gap-2 t-section text-ink">Fotos{fieldTag("photos")}</h2><p className="mt-1 t-meta">Entre 2 y 10. La primera es la principal. Las fotos propuestas no reemplazan la versión pública antes de aprobarse.</p></div>
        <div className="flex flex-wrap gap-3"><label className={buttonClasses({ variant: "secondary", className: "w-fit cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-ink focus-within:outline-offset-2" })}>Agregar fotos<input id="editar-photos" name="photos" data-error-label="Fotos" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-invalid={validation.errorFor("photos") ? true : undefined} aria-describedby={validation.errorFor("photos") ? "editar-photos-error" : undefined} disabled={busy} className="sr-only" onChange={addPhotos} /></label>{hasPendingRevision && (listing.status === "approved" || listing.status === "hidden") ? <button type="button" disabled={busy} onClick={restoreLivePhotos} className={buttonClasses({ variant: "secondary" })}>Restaurar fotos aprobadas</button> : null}</div>
        {validation.errorFor("photos") ? <p id="editar-photos-error" className="t-ui font-semibold text-danger">{validation.errorFor("photos")}</p> : null}
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo, index) => (
            <li key={photo.key} className="rounded-panel border border-subtle bg-white p-3">
              <div className="relative aspect-[4/3] overflow-hidden rounded-control bg-canvas"><Image src={photo.kind === "existing" ? photo.imageUrl : photo.previewUrl} alt={`Foto ${index + 1}`} fill sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw" unoptimized={photo.kind === "new" || (photo.kind === "existing" && photo.imageUrl.startsWith("/api/listing-images/"))} className="object-contain" />{index === 0 ? <Tag tone="solid" className="absolute left-2 top-2">Principal</Tag> : null}</div>
              <p className="mt-2 t-meta font-semibold">Foto {index + 1} de {photos.length}{index === 0 ? " · Principal" : ""}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={busy || index === 0} aria-label={`Mover foto ${index + 1} antes`} onClick={() => movePhoto(index, -1)} className={buttonClasses({ variant: "secondary", size: "sm", className: "min-h-11" })}>Anterior</button>
                <button type="button" disabled={busy || index === photos.length - 1} aria-label={`Mover foto ${index + 1} después`} onClick={() => movePhoto(index, 1)} className={buttonClasses({ variant: "secondary", size: "sm", className: "min-h-11" })}>Siguiente</button>
                <label className={buttonClasses({ variant: "secondary", size: "sm", className: "min-h-11 cursor-pointer" })}>Reemplazar<input type="file" disabled={busy} aria-label={`Reemplazar foto ${index + 1}`} accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => replacePhoto(index, event)} /></label>
                <button type="button" disabled={busy} aria-label={`Quitar foto ${index + 1}`} onClick={() => removePhoto(index)} className={buttonClasses({ variant: "danger", size: "sm", className: "min-h-11" })}>Quitar</button>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Same order as the sell form (components/sell-listing-form.tsx): photos, the instrument, condition and price, location, description. */}
      <FormSection id="editar-instrumento" title="El instrumento">
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField label={labelWith("Categoría", "category")} name="category" error={validation.errorFor("category")} value={category} onChange={(value) => { setCategory(value); validation.clear("instrument_type"); const options = getInstrumentTypeOptions(value); if (!options.some((option) => option.value === instrumentType)) setInstrumentType(options[0]?.value ?? ""); }} options={categoryOptions} />
          <SelectField label={labelWith("Tipo de instrumento", "instrument_type")} name="instrument_type" error={validation.errorFor("instrument_type")} value={instrumentType} onChange={setInstrumentType} options={getInstrumentTypeOptions(category)} />
          <TextField label={labelWith("Marca", "brand")} name="brand" defaultValue={listing.brand ?? ""} error={validation.errorFor("brand")} plain />
          <TextField label={labelWith("Modelo", "model")} name="model" defaultValue={listing.model ?? ""} error={validation.errorFor("model")} plain />
        </div>
        <TextField label={labelWith("Título", "title")} name="title" defaultValue={listing.title} error={validation.errorFor("title")} />
      </FormSection>

      <FormSection id="editar-condicion" title="Condición y precio">
        {flagged.has("condition") || showsReviewSplit ? <div className="-mb-2">{fieldTag("condition")}</div> : null}
        <ConditionCards id="editar-condition" name="condition" legend="Condición" options={conditionChoices(isStore ? conditionOptions : particularConditionOptions)} defaultValue={currentCondition(listing.condition) ?? ""} error={validation.errorFor("condition")} />
        <Field id="editar-price_pen" label={labelWith("Precio en soles", "price_pen")} error={validation.errorFor("price_pen")} className="sm:max-w-xs"><PriceInput name="price_pen" required defaultValue={listing.price_pen} /></Field>
        <PriceModeField idPrefix="editar" value={readSaleTerms(details[SALE_TERMS_KEY]).price_mode} onChange={(mode) => setDetail(SALE_TERMS_KEY, { ...readSaleTerms(details[SALE_TERMS_KEY]), price_mode: mode })} />
      </FormSection>

      <FormSection id="editar-ubicacion" title="Ubicación" hint={showsReviewSplit ? "Se publica al instante." : undefined}>
        <div className="grid gap-5 sm:grid-cols-2">
          <LocationFields idPrefix="editar" defaultCity={listing.city} defaultRegion={listing.region} cityError={validation.errorFor("city")} regionError={validation.errorFor("region")} />
        </div>
      </FormSection>

      <FormSection id="editar-descripcion" title="Descripción">
        <Field id="editar-description" label={labelWith("Descripción", "description")} error={validation.errorFor("description")} hint="Mínimo 40 caracteres. Describe el estado real, detalles y accesorios incluidos."><Textarea name="description" required minLength={40} rows={6} defaultValue={listing.description ?? ""} /></Field>
      </FormSection>

      {attributeGroup ? (
        <fieldset className="grid gap-4 rounded-panel border border-subtle bg-canvas p-4 sm:grid-cols-2">
          <legend className="px-2 t-ui font-semibold text-ink">Características del instrumento{showsReviewSplit ? " · Se publican al instante" : ""}</legend>
          {attributeGroup.filters.map((filter) => <AttributeField key={filter.key} filter={filter} value={listing.attributes?.[filter.key]} />)}
        </fieldset>
      ) : null}
      <ListingDetailFields idPrefix="editar" heading="h2" details={details} onChange={setDetail} error={detailError} isStore={isStore} />
      {/* Feature ideas, accounts batch (safe-02): the private serial number, saved on its own. */}
      <ListingSerialField listingId={listing.id} />
      </fieldset>
      {busy ? <p role="status" aria-live="polite" className="t-ui font-semibold text-ink-2">{progress}</p> : null}
      {showsReviewSplit && (pendingKinds.immediate || pendingKinds.moderated) ? (
        <p role="status" aria-live="polite" className="t-ui text-ink-2">
          {pendingKinds.moderated
            ? pendingKinds.immediate
              ? "Al guardar, precio, ubicación o descripción se publican al instante; lo demás pasa por revisión y la versión pública sigue visible."
              : "Al guardar, estos cambios pasan por revisión; la versión pública sigue visible mientras tanto."
            : "Al guardar, estos cambios se publican al instante."}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3"><Button type="submit" loading={busy} loadingLabel="Guardando…">{submitLabel}</Button><Link href={returnHref} className={buttonClasses({ variant: "secondary" })}>Cancelar</Link></div>
    </form>
  );
}

function existingPhotoItems(photos: ExistingPhoto[]): PhotoItem[] {
  return [...photos].sort((a, b) => a.sort_order - b.sort_order).map((photo) => ({
    key: photo.id,
    kind: "existing" as const,
    imageUrl: photo.image_url,
    altText: photo.alt_text ?? "",
  }));
}

type AttributeFilter = NonNullable<ReturnType<typeof getInstrumentFilterGroup>>["filters"][number];

function AttributeField({ filter, value }: { filter: AttributeFilter; value: unknown }) {
  if (filter.type === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    return <fieldset className="grid gap-1"><legend className="t-ui font-semibold text-ink">{filter.label}</legend>{filter.options?.map((option) => <Checkbox key={option.value} name={`attribute:${filter.key}`} value={option.value} defaultChecked={selected.includes(option.value)} label={option.label} className="min-h-0 py-1" />)}</fieldset>;
  }
  return <SelectField label={filter.label} name={`attribute:${filter.key}`} defaultValue={typeof value === "string" || typeof value === "number" ? String(value) : ""} options={filter.options ?? []} required={false} />;
}

// plain: names such as brand and model, which the phone keyboard must not "correct" (auth-03).
function TextField({ label, name, defaultValue, error, plain = false }: { label: ReactNode; name: string; defaultValue: string; error?: string; plain?: boolean }) {
  return <Field id={`editar-${name}`} label={label} error={error}><Input type="text" name={name} required defaultValue={defaultValue} {...(plain ? { autoComplete: "off", autoCorrect: "off", spellCheck: false } : {})} /></Field>;
}

function SelectField({ label, name, options, value, defaultValue, onChange, required = true, error }: { label: ReactNode; name: string; options: readonly { value: string; label: string }[]; value?: string; defaultValue?: string; onChange?: (value: string) => void; required?: boolean; error?: string }) {
  return <Field id={`editar-${name.replace(/[^a-z0-9_-]/gi, "-")}`} label={label} error={error}><Select name={name} required={required} value={value} defaultValue={value === undefined ? defaultValue : undefined} onChange={onChange ? (event) => onChange(event.target.value) : undefined}><option value="">Selecciona una opción</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field>;
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

function RejectionChecklist({ rejection }: { rejection: EditRejection }) {
  const labels = rejection.codes.flatMap((code) => { const label: string | null = rejectionReasonLabel(code); return label ? [label] : []; });
  const note = labels.length ? rejectionNote(rejection.reason) : rejection.reason;
  return (
    <section aria-labelledby="motivo-rechazo" className="rounded-panel border border-subtle bg-danger-tint p-4">
      <h2 id="motivo-rechazo" className="t-section text-ink">{rejection.kind === "revision" ? "Por qué no se aprobaron tus cambios" : "Por qué no se aprobó tu publicación"}</h2>
      {labels.length ? (
        <>
          <p className="mt-1 t-meta text-ink">Marca cada punto a medida que lo corriges. Los campos a revisar están señalados abajo.</p>
          <ul className="mt-3 grid gap-1">
            {labels.map((label) => <li key={label}><Checkbox name="checklist" value={label} label={label} className="min-h-0 py-1" form="" /></li>)}
          </ul>
        </>
      ) : null}
      {note ? <p className="mt-2 t-body text-ink"><span className="font-semibold">{labels.length ? "Nota de moderación: " : "Motivo: "}</span>{note}</p> : null}
    </section>
  );
}
