"use client";

import Link from "next/link";
import { Check, ChevronLeft, Circle, CloudUpload, Eye, Share2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ListingCardPreview, ListingPagePreview, type PreviewListing } from "@/components/selling/listing-preview";
import { ConditionCards, FormSection, TypeChips } from "@/components/selling/choice-fields";
import {
  PHOTO_BUCKET,
  SOUND_BUCKET,
  SubmissionRejected,
  cleanupSubmission,
  completeSubmission,
  createQueue,
  publicUrl,
  resumeDraftSubmission,
  startSubmission,
  uploadObject,
  type Capability,
} from "@/components/selling/listing-uploads";
import { PhotoStep, type FormPhoto } from "@/components/selling/photo-step";
import { PhotoPrepareError, isAcceptedPhotoType, prepareListingPhoto } from "@/components/selling/prepare-photo";
import { SoundClipField, type ClipState, type EncodedClip } from "@/components/selling/sound-clip-field";
import { PageNotice } from "@/components/page-notice";
import { Button, buttonClasses } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ErrorSummary } from "@/components/ui/error-summary";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { PriceInput } from "@/components/ui/price-input";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { getInstrumentFilterGroup } from "@/lib/instrument-filters";
import { MAX_LISTING_PHOTOS, getInstrumentTypeOptions } from "@/lib/listing-submission";
import { categoryOptions, conditionOptions } from "@/lib/listings";
import { citySuggestions, normalizePeruRegion, peruRegions } from "@/lib/location";
import { parseWholeSolPrice } from "@/lib/price";
import {
  emptyValues,
  draftFromServer,
  hasContent,
  localDraftKey,
  parseLocalDraft,
  savedAgo,
  serverDraftRow,
  similarValues,
  submissionFields,
  type LocalDraft,
  type SavedClip,
  type SellValues,
} from "@/lib/sell-draft";
import {
  DESCRIPTION_MIN,
  conditionChoices,
  errorSummaryTitle,
  sellConfirmation,
  validateSellDraft,
  type SellError,
  type SellField,
} from "@/lib/sell-form";
import { addStarter, descriptionStarters, sellHints, shotList, titleFromBrandModel } from "@/lib/sell-guidance";
import { SHARED_PHOTOS_PARAM, takeSharedPhotos } from "@/lib/share-target";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { cn } from "@/lib/utils";
import { ListingSerialField } from "@/components/stolen-gear/listing-serial-field";

// The sell form, Effortless Laria (docs/ux-effortless/selling.md; big-06 and POST 01–11, 13–16, SHOP 06, STOCK 09).
// Four short steps on every screen size: photos first (they shrink and upload in the background while the seller
// goes on), what it is, condition and price, then a preview and Publicar, which only confirms. Everything is saved on
// the device as it changes and, with "Guardar borrador", on the server so it can be finished elsewhere. The rules
// (2–10 photos, 40-character description, whole soles, a Peruvian region, the marketplace rules) are today's.

type SellerProfile = { fullName: string; phone: string; city: string; region: string };

type StoreContext = { id: string; name: string; status: "pending" | "active"; isVerified: boolean };

// Publishing an inventory SKU (design §4.2): the listing is linked to it in the same transaction. STOCK 09: the SKU's
// remembered details prefill the form.
export type InventorySku = {
  id: string;
  sku: string;
  name: string;
  price: number | null;
  available: number;
  category?: string | null;
  details?: Partial<Record<"brand" | "model" | "instrument_type" | "condition" | "description", string>> & { attributes?: Record<string, string | string[]> };
};

export type ServerDraft = { id: string; form: unknown; photos: unknown; sound_clip: unknown; inventory_item_id: string | null; updated_at: string };

type Props = {
  ownerId: string;
  profile: SellerProfile;
  store?: StoreContext;
  inventorySku?: InventorySku;
  brandsByCategory?: Record<string, string[]>;
  storeDefaults?: { condition: string | null; descriptionFooter: string };
  serverDraft?: ServerDraft;
  reviewWaitMinutes?: number | null;
};

type Clip = NonNullable<ClipState> & { path?: string; slot: number; type: EncodedClip["type"]; blob?: Blob };
type Success = { slug?: string; status?: string; sku?: InventorySku; values: SellValues };

const ID = "venta";
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

export const SELL_STEPS: { title: string; fields: SellField[] }[] = [
  { title: "Fotos", fields: ["photos"] },
  { title: "Qué es", fields: ["category", "instrument_type", "brand", "model", "title"] },
  { title: "Estado y precio", fields: ["condition", "price_pen", "city", "region", "description"] },
  { title: "Revisar y publicar", fields: ["marketplace_rules"] },
];

// Photo paths allow slots 0–99 (app/api/submissions); a replaced photo never reuses its slot.
const MAX_SLOT = 99;

export function SellListingForm({ ownerId, profile, store, inventorySku: initialSku, brandsByCategory = {}, storeDefaults, serverDraft, reviewWaitMinutes = null }: Props) {
  const kind = store ? "store_listing" : "listing";
  const direct = store?.status === "active" && store.isVerified;
  // FIX 05: the SKU being published. Starting another listing clears it, so the next one is never sent for a linked SKU.
  const [inventorySku, setInventorySku] = useState(initialSku);
  const storageKey = localDraftKey(ownerId, kind, inventorySku?.id);

  const baseValues = useMemo(() => initialValues({ profile, store, sku: initialSku, storeDefaults }), [profile, store, initialSku, storeDefaults]);
  const [values, setValues] = useState<SellValues>(baseValues);
  const [photos, setPhotos] = useState<FormPhoto[]>([]);
  const [clip, setClip] = useState<Clip | null>(null);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [errors, setErrors] = useState<SellError[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState<"" | "publishing" | "saving">("");
  const [progress, setProgress] = useState("");
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [showPage, setShowPage] = useState(false);
  const [restore, setRestore] = useState<LocalDraft | null>(null);
  const [ready, setReady] = useState(false);
  const [onServer, setOnServer] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [success, setSuccess] = useState<Success | null>(null);

  const submission = useRef<Capability | null>(null);
  const starting = useRef<Promise<Capability> | null>(null);
  const nextSlot = useRef(0);
  const pending = useRef(new Map<string, Promise<void>>());
  const prepared = useRef(new Map<string, File>());
  const originals = useRef(new Map<string, File>());
  const queue = useMemo(() => createQueue(3), []);
  // After a completion whose outcome is unknown (network or 5xx), only the same data may be retried: the listing may
  // already exist, and the server would then report success for the earlier data.
  const uncertain = useRef<string | null>(null);

  const instrumentOptions = useMemo(() => getInstrumentTypeOptions(values.category), [values.category]);
  const attributeGroup = values.instrumentType ? getInstrumentFilterGroup(values.instrumentType) : null;
  const shots = useMemo(() => shotList(values.category), [values.category]);
  const brands = brandsByCategory[values.category] ?? [];
  const priceValue = parseWholeSolPrice(values.price);
  const hints = sellHints({ photoCount: photos.length, shots: photos.map((photo) => photo.shot ?? ""), title: values.title, description: values.description, price: priceValue });
  const hintFor = (field: string) => hints.filter((hint) => hint.field === field);
  const errorFor = (field: SellField) => errors.find((error) => error.field === field)?.message;
  const uploading = photos.some((photo) => photo.status === "preparing" || photo.status === "uploading") || clip?.status === "uploading";

  // ------------------------------------------------------------------ restoring (POST 01, POST 02)

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (serverDraft) {
        try {
          const capability = await resumeDraftSubmission(serverDraft.id);
          if (cancelled) return;
          apply(draftFromServer(serverDraft, capability));
        } catch (error) {
          setMessage({ kind: "error", text: error instanceof Error ? error.message : "No pudimos abrir el borrador." });
        }
        setReady(true);
        return;
      }
      // big-12 (speed batch): photos shared from the phone's gallery arrive as ?compartido=1 and are added as if picked.
      // A share starts a new listing, so an older unfinished one on this device is not offered over it.
      if (new URLSearchParams(window.location.search).get(SHARED_PHOTOS_PARAM) === "1") {
        const shared = await takeSharedPhotos();
        if (cancelled) return;
        dropSharedParam();
        if (shared.length) {
          setReady(true);
          addPhotos(shared);
          return;
        }
      }
      const stored = parseLocalDraft(readStorage(storageKey));
      if (stored && hasContent(stored, baseValues)) setRestore(stored);
      else setReady(true);
    }
    void load();
    return () => { cancelled = true; };
    // Runs once per form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(draft: LocalDraft) {
    submission.current = draft.submission;
    nextSlot.current = draft.nextSlot;
    setValues(draft.values);
    setPhotos(draft.photos.map((photo) => ({
      key: `${photo.slot}-${photo.path}`,
      slot: photo.slot,
      path: photo.path,
      url: publicUrl(PHOTO_BUCKET, photo.path),
      status: "done",
      progress: 1,
      shot: photo.shot,
      dark: photo.dark,
    })));
    setClip(draft.soundClip ? {
      ...draft.soundClip,
      slot: Number(/sonido-(\d+)/.exec(draft.soundClip.path)?.[1] ?? 0),
      url: publicUrl(SOUND_BUCKET, draft.soundClip.path),
      status: "done",
      progress: 1,
      type: draft.soundClip.type as EncodedClip["type"],
    } : null);
    setOnServer(draft.onServer);
    setSavedAt(draft.savedAt);
    // Open where the seller left off: the first step that still needs something.
    const firstOpen = draft.photos.length < 2 ? 0 : !draft.values.category || !draft.values.brand || !draft.values.model ? 1 : 2;
    setStep(firstOpen);
    setReached(firstOpen);
  }

  function acceptRestore() {
    if (restore) apply(restore);
    setRestore(null);
    setReady(true);
  }

  async function discardRestore() {
    const old = restore;
    setRestore(null);
    setReady(true);
    removeStorage(storageKey);
    if (old?.submission) {
      if (old.onServer) await draftsTable()?.delete().eq("id", old.submission.id);
      await cleanupSubmission(old.submission.token).catch(() => undefined);
    }
  }

  // ------------------------------------------------------------------ saving as the seller goes

  const snapshot = useCallback((): LocalDraft => ({
    version: 1,
    savedAt: new Date().toISOString(),
    submission: submission.current,
    nextSlot: nextSlot.current,
    values,
    photos: photos.filter((photo) => photo.status === "done" && photo.path).map((photo) => ({ path: photo.path!, slot: photo.slot, ...(photo.shot ? { shot: photo.shot } : {}), ...(photo.dark ? { dark: true } : {}) })),
    soundClip: clip?.status === "done" && clip.path ? { path: clip.path, duration: clip.duration, type: clip.type } satisfies SavedClip : null,
    onServer,
    ...(inventorySku ? { skuId: inventorySku.id } : {}),
  }), [values, photos, clip, onServer, inventorySku]);

  useEffect(() => {
    if (!ready || success) return;
    const draft = snapshot();
    const local = window.setTimeout(() => {
      if (!hasContent(draft, baseValues)) return;
      if (writeStorage(storageKey, JSON.stringify(draft))) setSavedAt(draft.savedAt);
    }, 500);
    const remote = onServer ? window.setTimeout(() => { void saveToServer(draft, false); }, 2500) : null;
    return () => {
      window.clearTimeout(local);
      if (remote) window.clearTimeout(remote);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, ready, success]);

  // Leaving while photos are still uploading would lose them; everything else is already saved.
  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  async function saveToServer(draft: LocalDraft, explicit: boolean) {
    const table = draftsTable();
    const row = serverDraftRow(draft, kind, store?.id ?? null);
    if (!table || !row) return false;
    const { error } = await table.upsert(row);
    if (error) {
      if (explicit) setMessage({ kind: "error", text: /LIMIT/.test(error.message) ? "Tienes 20 borradores. Publica o descarta alguno para guardar otro." : "No pudimos guardar el borrador en tu cuenta. Sigue guardado en este dispositivo." });
      return false;
    }
    return true;
  }

  async function saveDraft() {
    if (busy) return;
    setBusy("saving");
    setMessage(null);
    try {
      await ensureSubmission();
      const ok = await saveToServer({ ...snapshot(), submission: submission.current, onServer: true }, true);
      if (ok) {
        setOnServer(true);
        setMessage({ kind: "success", text: uploading
          ? "Borrador guardado. Las fotos que aún se están subiendo se agregan al terminar. Puedes seguir desde Mis publicaciones en cualquier dispositivo."
          : "Borrador guardado. Puedes seguir desde Mis publicaciones en cualquier dispositivo." });
      }
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "No pudimos guardar el borrador." });
    } finally {
      setBusy("");
    }
  }

  // ------------------------------------------------------------------ uploads (POST 03)

  function ensureSubmission() {
    if (submission.current) return Promise.resolve(submission.current);
    starting.current ??= startSubmission(kind).then((capability) => {
      submission.current = capability;
      return capability;
    }).finally(() => { starting.current = null; });
    return starting.current;
  }

  function takeSlot() {
    if (nextSlot.current > MAX_SLOT) throw new PhotoPrepareError("Hiciste muchos cambios de fotos en esta publicación. Guarda el borrador y empieza una nueva.");
    return nextSlot.current++;
  }

  function updatePhoto(key: string, change: Partial<FormPhoto>) {
    setPhotos((current) => current.map((photo) => (photo.key === key ? { ...photo, ...change } : photo)));
  }

  function upload(key: string, slot: number, source: File) {
    const task = queue(async () => {
      try {
        let file = prepared.current.get(key);
        if (!file) {
          const result = await prepareListingPhoto(source);
          file = result.file;
          prepared.current.set(key, file);
          updatePhoto(key, { dark: result.dark });
        }
        const capability = await ensureSubmission();
        const path = `${capability.folder}/${slot}.${file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"}`;
        updatePhoto(key, { status: "uploading", progress: 0, error: undefined });
        await uploadObject(PHOTO_BUCKET, path, file, (fraction) => updatePhoto(key, { progress: fraction }));
        updatePhoto(key, { status: "done", progress: 1, path });
      } catch (error) {
        updatePhoto(key, { status: "error", error: error instanceof Error ? shortError(error.message) : "No se subió" });
        if (error instanceof PhotoPrepareError) setMessage({ kind: "error", text: `«${source.name}»: ${error.message}` });
      } finally {
        pending.current.delete(key);
      }
    });
    pending.current.set(key, task);
  }

  function addPhotos(files: File[], shot?: string) {
    setMessage(null);
    const accepted = files.filter((file) => file.size > 0 && isAcceptedPhotoType(file.type, file.name));
    const skipped = files.length - accepted.length;
    const room = MAX_LISTING_PHOTOS - photos.length;
    const taken = accepted.slice(0, Math.max(0, room));
    const problems: string[] = [];
    if (skipped) problems.push(`${skipped === 1 ? "Un archivo no es" : `${skipped} archivos no son`} una foto JPEG, PNG, WebP o HEIC.`);
    if (accepted.length > taken.length) problems.push(`Puedes subir hasta ${MAX_LISTING_PHOTOS} fotos por publicación.`);
    const added: FormPhoto[] = [];
    for (const [index, file] of taken.entries()) {
      let slot: number;
      try {
        slot = takeSlot();
      } catch (error) {
        problems.push((error as Error).message);
        break;
      }
      const key = `${slot}-${file.name}-${file.lastModified}`;
      originals.current.set(key, file);
      added.push({ key, slot, url: URL.createObjectURL(file), status: "preparing", progress: 0, ...(shot && index === 0 ? { shot } : {}) });
      upload(key, slot, file);
    }
    if (added.length) {
      setPhotos((current) => [...current, ...added]);
      clearError("photos");
    }
    if (problems.length) setMessage({ kind: "error", text: problems.join(" ") });
  }

  function replacePhoto(index: number, file: File) {
    if (!isAcceptedPhotoType(file.type, file.name)) return setMessage({ kind: "error", text: "Usa una foto JPEG, PNG, WebP o HEIC." });
    let slot: number;
    try {
      slot = takeSlot();
    } catch (error) {
      return setMessage({ kind: "error", text: (error as Error).message });
    }
    const key = `${slot}-${file.name}-${file.lastModified}`;
    originals.current.set(key, file);
    setPhotos((current) => current.map((photo, photoIndex) => (photoIndex === index ? { key, slot, url: URL.createObjectURL(file), status: "preparing", progress: 0, shot: photo.shot } : photo)));
    upload(key, slot, file);
  }

  function retryPhoto(index: number) {
    const photo = photos[index];
    const source = photo && originals.current.get(photo.key);
    if (!photo || !source) return;
    updatePhoto(photo.key, { status: "uploading", progress: 0, error: undefined });
    upload(photo.key, photo.slot, source);
  }

  function removePhoto(index: number) {
    setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
  }

  function movePhoto(from: number, to: number) {
    if (to < 0 || to >= photos.length || from === to) return;
    setPhotos((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  // POST 16
  function addClip(encoded: EncodedClip) {
    let slot: number;
    try {
      slot = takeSlot();
    } catch (error) {
      return setMessage({ kind: "error", text: (error as Error).message });
    }
    const next: Clip = { url: URL.createObjectURL(encoded.blob), duration: encoded.duration, status: "uploading", progress: 0, slot, type: encoded.type, blob: encoded.blob };
    setClip(next);
    void uploadClip(next);
  }

  async function uploadClip(target: Clip) {
    if (!target.blob) return;
    const extension = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/wav": "wav" }[target.type];
    const update = (change: Partial<Clip>) => setClip((current) => (current && current.slot === target.slot ? { ...current, ...change } : current));
    try {
      const capability = await ensureSubmission();
      const path = `${capability.folder}/sonido-${target.slot}.${extension}`;
      update({ status: "uploading", progress: 0, error: undefined });
      await uploadObject(SOUND_BUCKET, path, target.blob, (fraction) => update({ progress: fraction }));
      update({ status: "done", progress: 1, path });
    } catch (error) {
      update({ status: "error", error: error instanceof Error ? shortError(error.message) : "No se subió" });
    }
  }

  // ------------------------------------------------------------------ fields

  function set<K extends keyof SellValues>(key: K, value: SellValues[K]) {
    setValues((current) => {
      const next = { ...current, [key]: value };
      // POST 07: the title writes itself from brand and model until the seller changes it.
      if ((key === "brand" || key === "model") && !current.titleEdited) next.title = titleFromBrandModel(next.brand, next.model);
      return next;
    });
    const field = key === "instrumentType" ? "instrument_type" : key === "price" ? "price_pen" : key;
    if (field in FIELD_IDS) clearError(field as SellField);
  }

  function setCategory(value: string) {
    const options = getInstrumentTypeOptions(value);
    setValues((current) => ({
      ...current,
      category: value,
      instrumentType: options.length === 1 ? options[0].value : current.category === value ? current.instrumentType : "",
      attributes: current.category === value ? current.attributes : {},
    }));
    clearError("category");
  }

  function setAttribute(key: string, value: string | string[]) {
    setValues((current) => {
      const attributes = { ...current.attributes };
      if ((Array.isArray(value) && value.length) || (!Array.isArray(value) && value)) attributes[key] = value;
      else delete attributes[key];
      return { ...current, attributes };
    });
  }

  function clearError(field: SellField) {
    setErrors((current) => (current.some((error) => error.field === field) ? current.filter((error) => error.field !== field) : current));
  }

  // ------------------------------------------------------------------ steps and publishing

  function draftForChecks() {
    const city = store ? profile.city : values.city;
    const region = store ? profile.region : values.region;
    return {
      photoCount: photos.length,
      category: values.category,
      instrumentType: values.instrumentType,
      brand: values.brand.trim(),
      model: values.model.trim(),
      title: values.title.trim(),
      condition: values.condition,
      price: values.price.trim(),
      priceValue,
      city: city.trim(),
      region: region.trim(),
      regionValue: normalizePeruRegion(region) || null,
      // The 40-character minimum applies to the seller's own words, not to the store's standard text (SHOP 06).
      description: withoutFooter(values.description, store ? storeDefaults?.descriptionFooter.trim() ?? "" : ""),
      acceptedRules,
    };
  }

  function goTo(target: number) {
    setErrors([]);
    setStep(target);
    setReached((current) => Math.max(current, target));
    window.requestAnimationFrame(() => {
      const heading = document.getElementById(`${ID}-paso`);
      heading?.focus({ preventScroll: true });
      heading?.closest("form")?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  function next() {
    const found = validateSellDraft(draftForChecks()).filter((error) => SELL_STEPS[step].fields.includes(error.field));
    if (found.length) {
      setErrors(found);
      setAttempt((count) => count + 1);
      return;
    }
    goTo(step + 1);
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (step < SELL_STEPS.length - 1) return next();
    const checks = draftForChecks();
    const found = validateSellDraft(checks);
    if (found.length) {
      const firstStep = SELL_STEPS.findIndex((item) => item.fields.includes(found[0].field));
      setStep(firstStep);
      setErrors(found.filter((error) => SELL_STEPS[firstStep].fields.includes(error.field)));
      setAttempt((count) => count + 1);
      return;
    }
    setErrors([]);
    setMessage(null);
    setBusy("publishing");
    try {
      if (pending.current.size) {
        setProgress("Terminando de subir las fotos…");
        await Promise.all(pending.current.values());
      }
      const latest = await currentPhotos();
      if (latest.some((photo) => photo.status !== "done" || !photo.path)) throw new Error("Una foto no se subió. Toca Reintentar en la foto o quítala.");
      if (latest.length < 2) throw new Error("Agrega al menos 2 fotos.");
      const currentClip = await currentClipState();
      if (currentClip && currentClip.status !== "done") throw new Error("El sonido no se subió. Reintenta o quítalo.");
      const capability = await ensureSubmission();
      const fields = {
        ...submissionFields({ ...values, city: checks.city, region: checks.region }, priceValue, checks.regionValue, cleanAttributes(values.instrumentType, values.attributes)),
        ...(store && inventorySku ? { inventory_item_id: inventorySku.id } : {}),
      };
      const paths = latest.map((photo) => photo.path!);
      const sound = currentClip?.path ? { path: currentClip.path, duration: currentClip.duration } : null;
      const fingerprint = JSON.stringify([fields, paths, sound]);
      if (uncertain.current && uncertain.current !== fingerprint) {
        throw new Error("No supimos si el envío anterior llegó. Deja los datos como estaban y toca Publicar para confirmarlo.");
      }
      setProgress("Enviando la publicación…");
      let result;
      try {
        result = await completeSubmission(capability.token, fields, paths, sound);
      } catch (error) {
        if (!(error instanceof SubmissionRejected)) uncertain.current = fingerprint;
        throw error;
      }
      uncertain.current = null;
      removeStorage(storageKey);
      submission.current = null;
      setSuccess({ slug: result.slug, status: result.status, sku: inventorySku, values });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "No se pudo completar el envío. Intenta nuevamente." });
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  // State updates are asynchronous; after waiting for uploads, read the photos and clip as they are now.
  function currentPhotos() {
    return new Promise<FormPhoto[]>((resolve) => setPhotos((current) => { resolve(current); return current; }));
  }
  function currentClipState() {
    return new Promise<Clip | null>((resolve) => setClip((current) => { resolve(current); return current; }));
  }

  // A fresh form: new values, no photos, a new submission.
  function startOver(fresh: SellValues) {
    setInventorySku(undefined);
    submission.current = null;
    nextSlot.current = 0;
    prepared.current.clear();
    originals.current.clear();
    setValues(fresh);
    setPhotos([]);
    setClip(null);
    setAcceptedRules(false);
    setErrors([]);
    setMessage(null);
    setOnServer(false);
    setSavedAt(null);
    setShowPage(false);
    setSuccess(null);
    setStep(0);
    setReached(0);
  }

  // ------------------------------------------------------------------ preview data (POST 10)

  const preview: PreviewListing = {
    title: values.title.trim(),
    category: values.category,
    instrumentType: values.instrumentType,
    brand: values.brand.trim(),
    model: values.model.trim(),
    condition: values.condition,
    price: priceValue,
    city: (store ? profile.city : values.city).trim(),
    region: (store ? profile.region : values.region).trim(),
    description: values.description.trim(),
    attributes: cleanAttributes(values.instrumentType, values.attributes),
    photos: photos.map((photo) => photo.url),
    seller: { name: store ? store.name : profile.fullName, label: !store ? "Particular" : direct ? "Tienda verificada" : "Tienda" },
    hasSound: Boolean(clip),
  };

  if (success) {
    return (
      <SellSuccess
        success={success}
        store={store}
        direct={direct}
        reviewWaitMinutes={reviewWaitMinutes}
        onSimilar={() => startOver(similarValues(success.values))}
        onAnother={() => startOver(initialValues({ profile, store, storeDefaults }))}
      />
    );
  }

  if (restore) {
    return (
      <div className="grid gap-4 rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <Notice tone="info" title={`Tienes una publicación sin terminar (${savedAgo(restore.savedAt)})`}>
          <p className="mt-1">{restore.values.title || "Sin título"} · {restore.photos.length} {restore.photos.length === 1 ? "foto" : "fotos"}</p>
        </Notice>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={acceptRestore}>Retomar tu borrador</Button>
          <Button type="button" variant="secondary" onClick={discardRestore}>Descartar</Button>
        </div>
      </div>
    );
  }

  const stepErrors = errors.map((error) => ({ id: FIELD_IDS[error.field], message: error.message }));
  const last = step === SELL_STEPS.length - 1;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
      <form noValidate onSubmit={publish} aria-busy={Boolean(busy)} className="grid min-w-0 gap-6 rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <StepIndicator step={step} reached={reached} onGo={goTo} disabled={Boolean(busy)} />
        {message ? <PageNotice kind={message.kind} message={message.text} /> : null}
        <ErrorSummary title={errorSummaryTitle(errors.length)} errors={stepErrors} attempt={attempt} />

        {step === 0 ? (
          <Notice tone="info" role="note">
            {store ? <>
              Publicarás en <strong className="text-ink">{store.name}</strong>. {direct ? "Como Tienda verificada, tus publicaciones aparecen directamente si cumplen las reglas." : "Tu publicación quedará en revisión antes de aparecer."}
              {inventorySku ? <> La publicación quedará vinculada al SKU <strong className="text-ink">{inventorySku.sku}</strong>: su stock ({inventorySku.available} disponibles) decide si se muestra como Agotado y su precio sigue al SKU.</> : null}
            </> : <>
              Publicarás como <strong className="text-ink">{profile.fullName}</strong>. Las consultas llegarán al WhatsApp <strong className="text-ink">{profile.phone}</strong>. Puedes cambiar estos datos en <Link href="/mi-cuenta/perfil" className="link font-semibold">tu perfil</Link>.
            </>}
          </Notice>
        ) : null}

        <fieldset disabled={busy === "publishing"} className="grid min-w-0 gap-6">
          {step === 0 ? (
            <FormSection id={`${ID}-paso`} step={1} title="Fotos" hint="Empieza por las fotos: se suben mientras completas lo demás.">
              <div className="grid gap-2">
                <p className="t-ui font-semibold text-ink">¿Qué vas a vender? <span className="font-normal text-ink-2">(para sugerirte las fotos)</span></p>
                <div className="flex flex-wrap gap-2">
                  {categoryOptions.map((option) => (
                    <Chip key={option.value} selected={values.category === option.value} onClick={() => setCategory(values.category === option.value ? "" : option.value)}>{option.label}</Chip>
                  ))}
                </div>
              </div>
              <PhotoStep
                id={FIELD_IDS.photos}
                photos={photos}
                shots={shots}
                error={errorFor("photos")}
                disabled={busy === "publishing"}
                onAdd={addPhotos}
                onReplace={replacePhoto}
                onRemove={removePhoto}
                onMove={movePhoto}
                onRetry={retryPhoto}
              />
              {hintFor("photos").map((hint) => <HintLine key={hint.message} text={hint.message} />)}
            </FormSection>
          ) : null}

          {step === 1 ? (
            <FormSection id={`${ID}-paso`} step={2} title="Qué es">
              <Field id={FIELD_IDS.category} label="Categoría" error={errorFor("category")}>
                <Select name="category" value={values.category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="">Selecciona una opción</option>
                  {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </Field>
              {values.category && instrumentOptions.length > 1 ? (
                <TypeChips id={FIELD_IDS.instrument_type} name="instrument_type" legend="Tipo de instrumento" options={instrumentOptions} value={values.instrumentType} onChange={(value) => set("instrumentType", value)} error={errorFor("instrument_type")} />
              ) : null}
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="grid content-start gap-2">
                  <Field id={FIELD_IDS.brand} label="Marca" error={errorFor("brand")}>
                    <Input type="text" name="brand" autoComplete="off" autoCorrect="off" spellCheck={false} list={brands.length ? `${ID}-marcas` : undefined} value={values.brand} onChange={(event) => set("brand", event.target.value)} />
                  </Field>
                  {brands.length ? <datalist id={`${ID}-marcas`}>{brands.map((brand) => <option key={brand} value={brand} />)}</datalist> : null}
                  {brands.length && !values.brand ? (
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Marcas frecuentes">
                      {brands.slice(0, 6).map((brand) => <Chip key={brand} className="h-9" onClick={() => set("brand", brand)}>{brand}</Chip>)}
                    </div>
                  ) : null}
                </div>
                <Field id={FIELD_IDS.model} label="Modelo" error={errorFor("model")}>
                  <Input type="text" name="model" autoComplete="off" autoCorrect="off" spellCheck={false} value={values.model} onChange={(event) => set("model", event.target.value)} />
                </Field>
              </div>
              <Field id={FIELD_IDS.title} label="Título" error={errorFor("title")} hint={values.titleEdited ? "Marca, modelo y lo que lo distingue. Ej.: Fender Player Stratocaster 2021, color Tidepool." : "Lo escribimos con la marca y el modelo. Agrega lo que lo distingue: año, color, versión."}>
                <Input type="text" name="title" value={values.title} onChange={(event) => { const title = event.target.value; setValues((current) => ({ ...current, title, titleEdited: true })); clearError("title"); }} />
              </Field>
              {hintFor("title").map((hint) => <HintLine key={hint.message} text={hint.message} />)}
              {attributeGroup ? (
                <div className="grid gap-3">
                  <p className="t-ui font-semibold text-ink">Características <span className="font-normal text-ink-2">(opcionales; ayudan a que te encuentren con los filtros)</span></p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {attributeGroup.filters.map((filter) => <AttributeField key={filter.key} filter={filter} value={values.attributes[filter.key]} onChange={(value) => setAttribute(filter.key, value)} />)}
                  </div>
                </div>
              ) : null}
            </FormSection>
          ) : null}

          {step === 2 ? (
            <FormSection id={`${ID}-paso`} step={3} title="Estado y precio">
              <ConditionCards id={FIELD_IDS.condition} name="condition" legend="Condición" options={conditionChoices(conditionOptions)} value={values.condition} onChange={(value) => set("condition", value)} error={errorFor("condition")} />
              <Field id={FIELD_IDS.price_pen} label="Precio en soles" hint="Solo números, sin decimales." error={errorFor("price_pen")} className="sm:max-w-xs">
                <PriceInput name="price_pen" value={values.price} onValueChange={(text) => set("price", text)} />
              </Field>
              {hintFor("price_pen").map((hint) => <HintLine key={hint.message} text={hint.message} />)}
              {store ? (
                <p className="t-ui text-ink-2">Ubicación: <strong className="text-ink">{[profile.city, profile.region].filter(Boolean).join(", ")}</strong>, la de tu tienda.</p>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id={FIELD_IDS.city} label="Ciudad" error={errorFor("city")} hint="Dónde puede verse o recogerse.">
                    <Input name="city" autoComplete="address-level2" list={`${ID}-cities`} value={values.city} onChange={(event) => set("city", event.target.value)} />
                  </Field>
                  <datalist id={`${ID}-cities`}>{citySuggestions.map((city) => <option key={city} value={city} />)}</datalist>
                  <Field id={FIELD_IDS.region} label="Región" error={errorFor("region")}>
                    <Input name="region" autoComplete="address-level1" list={`${ID}-regions`} value={values.region} onChange={(event) => set("region", event.target.value)} />
                  </Field>
                  <datalist id={`${ID}-regions`}>{peruRegions.map((region) => <option key={region} value={region} />)}</datalist>
                </div>
              )}
              <DescriptionField
                value={values.description}
                footer={store ? storeDefaults?.descriptionFooter.trim() ?? "" : ""}
                instrumentType={values.instrumentType}
                error={errorFor("description")}
                onChange={(value) => set("description", value)}
              />
              {hintFor("description").map((hint) => <HintLine key={hint.message} text={hint.message} />)}
              <SoundClipField
                id={`${ID}-sonido`}
                clip={clip}
                disabled={busy === "publishing"}
                onClip={addClip}
                onRemove={() => setClip(null)}
                onRetry={() => { if (clip) void uploadClip(clip); }}
              />
            </FormSection>
          ) : null}

          {last ? (
            <FormSection id={`${ID}-paso`} step={4} title="Revisar y publicar" hint="Así verán tu publicación los compradores.">
              <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
                <ListingCardPreview listing={preview} />
                <div className="grid gap-3">
                  {hints.length ? (
                    <Notice tone="warning" role="note" title="Antes de publicar">
                      <ul className="mt-1 grid gap-1">{hints.map((hint) => <li key={hint.message}>{hint.message}</li>)}</ul>
                    </Notice>
                  ) : (
                    <p className="flex items-start gap-1.5 t-ui text-ink"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />No vemos nada que suela causar un rechazo.</p>
                  )}
                  <button type="button" aria-expanded={showPage} aria-controls={`${ID}-pagina`} onClick={() => setShowPage((open) => !open)} className={buttonClasses({ variant: "secondary", className: "w-fit" })}>
                    <Eye aria-hidden />{showPage ? "Ocultar la página" : "Ver cómo se verá la página"}
                  </button>
                </div>
              </div>
              {showPage ? <div id={`${ID}-pagina`}><ListingPagePreview listing={preview} /></div> : null}
              <div className="grid gap-1.5">
                <label className="flex gap-3 rounded-panel bg-canvas p-3 t-ui text-ink-2">
                  <input id={FIELD_IDS.marketplace_rules} type="checkbox" name="marketplace_rules" checked={acceptedRules} onChange={(event) => { setAcceptedRules(event.target.checked); clearError("marketplace_rules"); }} className="mt-0.5 h-5 w-5 shrink-0 accent-ink" aria-describedby={errorFor("marketplace_rules") ? `${FIELD_IDS.marketplace_rules}-error` : undefined} aria-invalid={errorFor("marketplace_rules") ? true : undefined} />
                  <span>Acepto los <a href="/terminos" target="_blank" rel="noopener" className="link font-semibold">términos y reglas del marketplace</a>, confirmo que el equipo no está entre los <a href="/articulos-prohibidos" target="_blank" rel="noopener" className="link font-semibold">artículos prohibidos</a> y que la información y las fotos son reales. Laria no procesa pagos, no gestiona envíos ni garantiza transacciones.</span>
                </label>
                {errorFor("marketplace_rules") ? <p id={`${FIELD_IDS.marketplace_rules}-error`} className="t-ui font-semibold text-danger">{errorFor("marketplace_rules")}</p> : null}
              </div>
              <p className="t-meta">{direct ? "Aparecerá en el catálogo al publicarla." : "Un administrador la revisará antes de mostrarla. Te avisaremos por correo."}</p>
            </FormSection>
          ) : null}
        </fieldset>

        {busy === "publishing" && progress ? <p role="status" aria-live="polite" className="t-ui font-semibold text-ink-2">{progress}</p> : null}
        <div className="flex flex-col-reverse gap-3 border-t border-subtle pt-5 sm:flex-row sm:items-center">
          {step > 0 ? (
            <button type="button" disabled={Boolean(busy)} onClick={() => goTo(step - 1)} className={buttonClasses({ variant: "quiet", className: "self-start sm:mr-auto sm:self-center" })}><ChevronLeft aria-hidden />Atrás</button>
          ) : <span className="hidden sm:mr-auto sm:block" />}
          <Button type="button" variant="secondary" disabled={Boolean(busy)} loading={busy === "saving"} loadingLabel="Guardando…" onClick={saveDraft} icon={<CloudUpload aria-hidden />}>Guardar borrador</Button>
          {last ? (
            <Button type="submit" disabled={Boolean(busy)} loading={busy === "publishing"} loadingLabel="Publicando…">Publicar</Button>
          ) : (
            <Button type="submit" disabled={Boolean(busy)}>Continuar</Button>
          )}
        </div>
        <p className="t-meta" aria-live="polite">
          {savedAt ? `Guardado en este dispositivo, ${savedAgo(savedAt)}${onServer ? ", y en tu cuenta" : ""}.` : "Se guarda en este dispositivo mientras escribes."}
        </p>
      </form>

      <aside className="sticky top-4 hidden gap-2 lg:grid" aria-label="Vista previa">
        <p className="t-ui font-semibold text-ink">Así se verá</p>
        <ListingCardPreview listing={preview} />
      </aside>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function StepIndicator({ step, reached, onGo, disabled }: { step: number; reached: number; onGo: (step: number) => void; disabled: boolean }) {
  return (
    <nav aria-label="Pasos para publicar">
      <ol className="grid grid-cols-4 gap-1.5">
        {SELL_STEPS.map((item, index) => {
          const current = index === step;
          const done = !current && index <= reached;
          return (
            <li key={item.title} className="min-w-0">
              <button
                type="button"
                disabled={disabled || index > reached || current}
                aria-current={current ? "step" : undefined}
                onClick={() => onGo(index)}
                className="grid min-h-11 w-full min-w-0 content-start gap-1 text-left disabled:cursor-default"
              >
                <span className={cn("h-1.5 rounded-full", current ? "bg-ink" : done ? "bg-accent" : "bg-subtle")} aria-hidden />
                <span className={cn("flex min-w-0 items-center gap-1 t-meta", current ? "font-semibold text-ink" : "text-ink-2")}>
                  {done ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Circle className="h-3 w-3 shrink-0" aria-hidden />}
                  <span className="truncate"><span className="sr-only">Paso </span>{index + 1}<span className="max-sm:sr-only">. {item.title}</span></span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function HintLine({ text }: { text: string }) {
  return <p className="rounded-control bg-warning-tint px-3 py-2 t-ui text-ink">{text}</p>;
}

// POST 09: starters per instrument type, and a counter that marks the 40-character minimum with a check, not color alone.
function DescriptionField({ value, footer, instrumentType, error, onChange }: { value: string; footer: string; instrumentType: string; error?: string; onChange: (value: string) => void }) {
  // A store's standard text does not count towards the seller's own description.
  const length = withoutFooter(value, footer).length;
  const enough = length >= DESCRIPTION_MIN;
  function insert(starter: string) {
    // A store's standard text stays at the end; starters go above it.
    const trimmed = value.replace(/\s+$/, "");
    const next = footer && trimmed.endsWith(footer)
      ? `${addStarter(trimmed.slice(0, trimmed.length - footer.length).replace(/\s+$/, ""), starter)}\n\n${footer}`
      : addStarter(value, starter);
    // Rendered at once, so the caret lands after the starter before the next key is typed.
    flushSync(() => onChange(next));
    const field = document.getElementById(FIELD_IDS.description) as HTMLTextAreaElement | null;
    if (!field) return;
    field.focus();
    const at = field.value.indexOf(starter) + starter.length;
    field.setSelectionRange(at, at);
  }
  return (
    <div className="grid gap-2">
      <Field id={FIELD_IDS.description} label="Descripción" error={error} hint="Cuenta el estado real, los detalles y lo que incluye.">
        <Textarea name="description" rows={7} value={value} onChange={(event) => onChange(event.target.value)} />
      </Field>
      <p className={cn("inline-flex w-fit items-center gap-1 rounded-tag px-2 py-0.5 t-meta font-semibold", enough ? "bg-accent-tint text-ink" : "bg-canvas text-ink-2")} aria-live="polite">
        {enough ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
        {enough ? `${length} caracteres: suficiente` : `${length} de ${DESCRIPTION_MIN} caracteres mínimos`}{footer ? ", sin contar el texto de tu tienda" : ""}
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ideas para la descripción">
        {descriptionStarters(instrumentType).map((starter) => (
          <Chip key={starter} className="h-9" onClick={() => insert(starter)}>+ {starter.replace(/[:\s]+$/, "")}</Chip>
        ))}
      </div>
    </div>
  );
}

type AttributeFilter = NonNullable<ReturnType<typeof getInstrumentFilterGroup>>["filters"][number];

function AttributeField({ filter, value, onChange }: { filter: AttributeFilter; value: string | string[] | undefined; onChange: (value: string | string[]) => void }) {
  const id = `${ID}-attribute-${filter.key.replace(/[^a-z0-9_-]/gi, "-")}`;
  if (filter.type === "multiselect") {
    const selected = Array.isArray(value) ? value : value ? [value] : [];
    return (
      <fieldset className="grid gap-2">
        <legend className="t-ui font-semibold text-ink">{filter.label}</legend>
        <div className="grid gap-2">
          {filter.options?.map((option) => (
            <Checkbox key={option.value} name={`attribute:${filter.key}`} value={option.value} label={option.label} className="min-h-0 py-1" checked={selected.includes(option.value)} onChange={(event) => onChange(event.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value))} />
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <Field id={id} label={filter.label}>
      <Select name={`attribute:${filter.key}`} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">Selecciona una opción</option>
        {(filter.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
    </Field>
  );
}

// POST 14 and POST 15: after sending. A live listing is a moment to celebrate and share; one in review shows where it
// is and, once Laria has enough data, the usual wait.
function SellSuccess({ success, store, direct, reviewWaitMinutes, onSimilar, onAnother }: {
  success: Success;
  store?: StoreContext;
  direct: boolean;
  reviewWaitMinutes: number | null;
  onSimilar: () => void;
  onAnother: () => void;
}) {
  const live = success.status ? success.status === "approved" : direct;
  const href = success.slug ? `/instrumentos/${success.slug}` : null;
  const confirmation = sellConfirmation(live);
  const [copied, setCopied] = useState(false);
  const title = success.values.title.trim();

  async function share() {
    if (!href) return;
    const url = `${window.location.origin}${href}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: `${title} en Laria`, url });
        return;
      } catch {
        // Dismissed or unavailable: copy the link instead.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`, "_blank", "noopener");
    }
  }

  return (
    <div className="grid gap-6 rounded-panel border border-subtle bg-white p-5 sm:p-6">
      <PageNotice kind="success" message={live ? "Tu publicación está en línea" : confirmation.message}>
        <p className="mt-2">{confirmation.next}</p>
      </PageNotice>
      {!live ? <ReviewSteps waitMinutes={reviewWaitMinutes} /> : null}
      {/* Feature ideas, accounts batch (safe-02): a store's serials live on the SKU. */}
      {success.slug && !success.sku ? <ListingSerialField listingSlug={success.slug} /> : null}
      {live && href ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link href={href} className={buttonClasses({ variant: "primary" })}>Ver publicación</Link>
          <button type="button" onClick={share} className={buttonClasses({ variant: "secondary" })}><Share2 aria-hidden />Compartir</button>
          {copied ? <p className="t-ui font-semibold text-ink" role="status">Enlace copiado.</p> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onSimilar} className={buttonClasses({ variant: "secondary" })}>Publicar uno parecido</button>
        {success.sku ? <>
          <Link href={`/mi-cuenta/tienda/inventario/${success.sku.id}`} className={buttonClasses({ variant: "secondary" })}>Volver al SKU</Link>
          <Link href="/mi-cuenta/tienda/publicar?sku=siguiente" className={buttonClasses({ variant: "secondary" })}>Publicar el siguiente SKU sin publicación</Link>
        </> : null}
        {/* After a SKU the page header and address still name it, so a fresh page load starts clean. */}
        {success.sku ? <a href="/mi-cuenta/tienda/publicar" className={buttonClasses({ variant: "secondary" })}>Publicar otro instrumento</a>
        : <button type="button" onClick={onAnother} className={buttonClasses({ variant: "secondary" })}>Publicar otro instrumento</button>}
        <Link href={store ? "/mi-cuenta/tienda/inventario" : "/mi-cuenta/publicaciones"} className="link self-center font-semibold">{store ? "Ver inventario" : "Ver mis publicaciones"}</Link>
      </div>
    </div>
  );
}

export function reviewWaitText(minutes: number | null) {
  if (minutes === null) return null;
  if (minutes < 60) return "Normalmente se revisa en menos de una hora.";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Normalmente se revisa en unas ${hours} ${hours === 1 ? "hora" : "horas"}.`;
  const days = Math.round(hours / 24);
  return `Normalmente se revisa en ${days} ${days === 1 ? "día" : "días"}.`;
}

function ReviewSteps({ waitMinutes }: { waitMinutes: number | null }) {
  const items = [
    { label: "Enviada", state: "done" },
    { label: "En revisión", state: "current" },
    { label: "Publicada", state: "next" },
  ] as const;
  const wait = reviewWaitText(waitMinutes);
  return (
    <div className="grid gap-2">
      <ol className="grid grid-cols-3 gap-2" aria-label="Estado de tu publicación">
        {items.map((item) => (
          <li key={item.label} aria-current={item.state === "current" ? "step" : undefined} className="grid gap-1">
            <span className={cn("h-1.5 rounded-full", item.state === "done" ? "bg-accent" : item.state === "current" ? "bg-ink" : "bg-subtle")} aria-hidden />
            <span className={cn("flex items-center gap-1 t-ui", item.state === "current" ? "font-semibold text-ink" : "text-ink-2")}>
              {item.state === "done" ? <Check className="h-4 w-4" aria-hidden /> : <Circle className="h-3 w-3" aria-hidden />}
              {item.label}{item.state === "current" ? " (ahora)" : ""}
            </span>
          </li>
        ))}
      </ol>
      {wait ? <p className="t-meta">{wait}</p> : null}
    </div>
  );
}

// ------------------------------------------------------------------ helpers

function initialValues({ profile, store, sku, storeDefaults }: {
  profile: SellerProfile;
  store?: StoreContext;
  sku?: InventorySku;
  storeDefaults?: { condition: string | null; descriptionFooter: string };
}): SellValues {
  const details = sku?.details ?? {};
  const footer = store ? storeDefaults?.descriptionFooter.trim() ?? "" : "";
  const base = emptyValues({
    city: profile.city,
    region: profile.region,
    // SHOP 06: a store's default condition and standard text.
    condition: store ? storeDefaults?.condition ?? "" : "",
    description: footer ? `\n\n${footer}` : "",
  });
  if (!sku) return base;
  // STOCK 09: what the SKU remembers.
  const category = sku.category && categoryOptions.some((option) => option.value === sku.category) ? sku.category : "";
  const types = getInstrumentTypeOptions(category);
  const type = details.instrument_type && types.some((option) => option.value === details.instrument_type) ? details.instrument_type : types.length === 1 ? types[0].value : "";
  return {
    ...base,
    category,
    instrumentType: type,
    brand: details.brand ?? "",
    model: details.model ?? "",
    title: sku.name,
    titleEdited: true,
    condition: details.condition ?? base.condition,
    price: sku.price ? String(sku.price) : "",
    description: details.description ? (footer && !details.description.includes(footer) ? `${details.description}\n\n${footer}` : details.description) : base.description,
    attributes: details.attributes ?? {},
  };
}

function cleanAttributes(instrumentType: string, attributes: Record<string, string | string[]>) {
  const group = getInstrumentFilterGroup(instrumentType);
  const output: Record<string, string | string[]> = {};
  for (const filter of group?.filters ?? []) {
    const value = attributes[filter.key];
    if (filter.type === "multiselect") {
      const list = (Array.isArray(value) ? value : value ? [value] : []).filter((item) => filter.options?.some((option) => option.value === item));
      if (list.length) output[filter.key] = list;
    } else if (typeof value === "string" && filter.options?.some((option) => option.value === value)) {
      output[filter.key] = value;
    }
  }
  return output;
}

function withoutFooter(description: string, footer: string) {
  const trimmed = description.trim();
  return footer && trimmed.endsWith(footer) ? trimmed.slice(0, trimmed.length - footer.length).trim() : trimmed;
}

function shortError(text: string) {
  return text.length > 60 ? "No se subió" : text;
}

function draftsTable() {
  const supabase = getSupabaseBrowserClient();
  return supabase ? (supabase as unknown as SupabaseClient).from("listing_drafts") : null;
}

// The share marker is not carried on to any other address (reloads, links, Publicar otro).
function dropSharedParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete(SHARED_PHOTOS_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorage(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing was saved there either.
  }
}
