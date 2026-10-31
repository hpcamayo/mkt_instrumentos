// The sell form's state as it is saved (Effortless Laria, selling batch): on the device as the seller types (POST 01)
// and, on "Guardar borrador", in listing_drafts so it follows them to another device (POST 02). Pure, so the form and
// the tests share it. Nothing here is trusted by the server: publishing validates everything again.
import { currentCondition } from "@/lib/listing-condition";
import { readMakerForm } from "@/lib/maker-details";
import type { Json } from "@/lib/supabase/database.types";
import { deliveryTermsOnly, readSaleTerms } from "@/lib/sale-terms";

export type SellValues = {
  category: string;
  instrumentType: string;
  brand: string;
  model: string;
  title: string;
  // POST 07: the title follows brand and model until the seller edits it.
  titleEdited: boolean;
  condition: string;
  price: string;
  city: string;
  region: string;
  description: string;
  attributes: Record<string, string | string[]>;
  // listing-details: each batch's extra fields by key ("sale_terms": lib/sale-terms.ts), as the form holds them.
  details: Record<string, unknown>;
};

export type SavedPhoto = { path: string; slot: number; shot?: string; dark?: boolean };
export type SavedClip = { path: string; duration: number; type: string };

export type LocalDraft = {
  version: 1;
  savedAt: string;
  submission: { id: string; token: string; folder: string } | null;
  nextSlot: number;
  values: SellValues;
  photos: SavedPhoto[];
  soundClip: SavedClip | null;
  // The listing_drafts row exists, so later changes are saved there too.
  onServer: boolean;
  skuId?: string;
};

export function emptyValues(defaults: Partial<SellValues> = {}): SellValues {
  return {
    category: "",
    instrumentType: "",
    brand: "",
    model: "",
    title: "",
    titleEdited: false,
    condition: "",
    price: "",
    city: "",
    region: "",
    description: "",
    attributes: {},
    details: {},
    ...defaults,
  };
}

// POST 13 "Publicar uno parecido": keep what related gear shares, never photos, price, model or title.
export function similarValues(values: SellValues): SellValues {
  return emptyValues({
    category: values.category,
    instrumentType: values.instrumentType,
    brand: values.brand,
    condition: values.condition,
    city: values.city,
    region: values.region,
    description: values.description,
    attributes: values.attributes,
    // How it is delivered and what trades the seller takes usually hold for the next one too; the price mode, like
    // the price, does not.
    // An artist's note is about one instrument, so it is not carried over either.
    details: {
      ...values.details,
      ...(values.details.sale_terms ? { sale_terms: deliveryTermsOnly(readSaleTerms(values.details.sale_terms)) } : {}),
      ...(values.details.maker ? { maker: { ...readMakerForm(values.details.maker), artist_note: "" } } : {}),
    },
  });
}

// Whether a form holds anything worth offering back.
export function hasContent(draft: Pick<LocalDraft, "values" | "photos" | "soundClip">, base: SellValues) {
  if (draft.photos.length || draft.soundClip) return true;
  const { values } = draft;
  return (Object.keys(values) as (keyof SellValues)[]).some((key) =>
    key !== "titleEdited" && JSON.stringify(values[key]) !== JSON.stringify(base[key]));
}

export function localDraftKey(ownerId: string, kind: "listing" | "store_listing", skuId?: string) {
  return `laria:venta:${ownerId}:${kind}${skuId ? `:${skuId}` : ""}`;
}

export function parseLocalDraft(raw: string | null): LocalDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || typeof value.values !== "object" || !Array.isArray(value.photos)) return null;
    return { ...value, values: savedValues(value.values) } as LocalDraft;
  } catch {
    return null;
  }
}

// Saved values on today's shape: missing keys filled, an old condition ("Usado - buen estado") on today's scale.
function savedValues(input: unknown): SellValues {
  const values = { ...emptyValues(), ...(input && typeof input === "object" && !Array.isArray(input) ? input as Partial<SellValues> : {}) };
  if (!values.details || typeof values.details !== "object" || Array.isArray(values.details)) values.details = {};
  values.condition = typeof values.condition === "string" ? currentCondition(values.condition) : "";
  return values;
}

// "guardado hace 3 min".
export function savedAgo(savedAt: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(savedAt).getTime()) / 60000));
  if (minutes < 1) return "guardado hace un momento";
  if (minutes < 60) return `guardado hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `guardado hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `guardado hace ${days} ${days === 1 ? "día" : "días"}`;
}

// Launch audit A18: files nothing points at are removed after 48 hours, and a draft kept only on the device points at
// none, so it can come back without some of them. `present` lists by bucket the files still in its folder
// (app/api/submissions, "renew"); the draft's photos and clip not among them are gone.
export function removedDraftFiles(draft: Pick<LocalDraft, "photos" | "soundClip">, present: Record<string, string[]>) {
  const photos = new Set(present["listing-photos"] ?? []);
  const clips = new Set(present["listing-sound-clips"] ?? []);
  return {
    photos: draft.photos.map((photo) => photo.path).filter((path) => !photos.has(path)),
    clip: Boolean(draft.soundClip && !clips.has(draft.soundClip.path)),
  };
}

export function removedFilesMessage(photos: number, clip: boolean) {
  const counted = photos === 1 ? "Una foto" : `${photos} fotos`;
  const lost = photos && clip
    ? `${counted} y el sonido de este borrador ya no estaban guardados. Agrégalos otra vez.`
    : photos
      ? `${counted} de este borrador ya no ${photos === 1 ? "estaba guardada. Agrégala" : "estaban guardadas. Agrégalas"} otra vez.`
      : "El sonido de este borrador ya no estaba guardado. Grábalo otra vez.";
  return `${lost} Un borrador que solo está en este dispositivo conserva sus archivos 48 horas; con Guardar borrador se quedan en tu cuenta.`;
}

// The listing_drafts row for a local draft (RLS sets and checks the owner).
export function serverDraftRow(draft: LocalDraft, kind: "listing" | "store_listing", storeId: string | null) {
  if (!draft.submission) return null;
  return {
    id: draft.submission.id,
    kind,
    store_id: kind === "store_listing" ? storeId : null,
    inventory_item_id: draft.skuId ?? null,
    title: draft.values.title.slice(0, 200),
    // Plain JSON, as the copy on the device: the details are what the form's fields hold.
    form: draft.values as Json,
    photos: draft.photos.map(({ path, shot }) => (shot ? { path, shot } : { path })),
    sound_clip: draft.soundClip,
  };
}

// A listing_drafts row back into a local draft; the token comes from the resume request.
export function draftFromServer(
  row: { id: string; form: unknown; photos: unknown; sound_clip: unknown; inventory_item_id: string | null; updated_at: string },
  submission: LocalDraft["submission"],
): LocalDraft {
  const photos = Array.isArray(row.photos)
    ? row.photos.filter((photo): photo is { path: string; shot?: string } => typeof photo?.path === "string")
    : [];
  const slots = photos.map((photo) => Number(/\/(\d+)\.\w+$/.exec(photo.path)?.[1] ?? 0));
  const clip = row.sound_clip && typeof row.sound_clip === "object" ? row.sound_clip as SavedClip : null;
  const clipSlot = clip ? Number(/sonido-(\d+)/.exec(clip.path)?.[1] ?? 0) : 0;
  return {
    version: 1,
    savedAt: row.updated_at,
    submission,
    nextSlot: Math.max(-1, clipSlot, ...slots) + 1,
    values: savedValues(row.form),
    photos: photos.map((photo, index) => ({ path: photo.path, slot: slots[index], ...(photo.shot ? { shot: photo.shot } : {}) })),
    soundClip: clip,
    onServer: true,
    ...(row.inventory_item_id ? { skuId: row.inventory_item_id } : {}),
  };
}

// The fields the publish route expects, from the form's values.
export function submissionFields(values: SellValues, priceValue: number | null, regionValue: string | null, attributes: Record<string, string | string[]>) {
  return {
    title: values.title.trim(),
    category: values.category,
    instrument_type: values.instrumentType,
    attributes,
    brand: values.brand.trim(),
    model: values.model.trim(),
    condition: values.condition,
    price_pen: priceValue,
    city: values.city.trim(),
    region: regionValue,
    description: values.description.trim(),
    marketplace_rules_accepted: true,
  };
}
