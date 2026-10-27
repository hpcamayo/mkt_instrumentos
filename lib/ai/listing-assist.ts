import { categoryOptions } from "@/lib/listings";
import { getInstrumentTypeOptions, instrumentTypesByCategory, isInstrumentTypeValid } from "@/lib/listing-submission";
import type { SellValues } from "@/lib/sell-draft";
import { titleFromBrandModel } from "@/lib/sell-guidance";

// big-07 (docs/ux-effortless/maybes-ai.md), "Completar con IA": from up to four photos, a suggestion of what the item
// is (category and instrument type from the site's registries, brand, model, a title, details seen in the photos and
// an honest description), each used only when the seller taps it. No condition, price or specifications: specs stay
// with the catalog autofill. Pure, so the route, the sell form and the tests share it.

export const LISTING_ASSIST_MAX_PHOTOS = 4;
// The browser sends JPEGs of at most this many pixels on the long side, and the route refuses larger files.
export const LISTING_ASSIST_PHOTO_SIDE = 1024;
export const LISTING_ASSIST_MAX_PHOTO_BYTES = 600 * 1024;
// Four photos in base64 (4/3 of their size) and the JSON around them.
export const LISTING_ASSIST_MAX_BODY_BYTES = Math.ceil(LISTING_ASSIST_MAX_PHOTOS * LISTING_ASSIST_MAX_PHOTO_BYTES * 4 / 3) + 4096;

// Width and height from a JPEG's frame header, or null when the bytes are not a JPEG.
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    // Start of frame (baseline, progressive and the rare others), not the tables that share the range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (bytes[at + 5] << 8) | bytes[at + 6], width: (bytes[at + 7] << 8) | bytes[at + 8] };
    }
    if (length < 2) return null;
    at += 2 + length;
  }
  return null;
}

export type ListingSuggestion = {
  recognized: boolean;
  category: string;
  instrumentType: string;
  brand: string;
  model: string;
  title: string;
  details: string[];
  description: string;
  confidence: "high" | "medium" | "low";
};

const CONFIDENCE = ["high", "medium", "low"] as const;
const CATEGORIES: string[] = categoryOptions.map((option) => option.value);
const INSTRUMENT_TYPES = [...new Set(Object.values(instrumentTypesByCategory).flat())];

export function listingAssistSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["recognized", "category", "instrument_type", "brand", "model", "title", "details", "description", "confidence"],
    properties: {
      recognized: { type: "boolean" },
      category: { type: "string", enum: ["", ...CATEGORIES] },
      instrument_type: { type: "string", enum: ["", ...INSTRUMENT_TYPES] },
      brand: { type: "string" },
      model: { type: "string" },
      title: { type: "string" },
      details: { type: "array", items: { type: "string" } },
      description: { type: "string" },
      confidence: { type: "string", enum: [...CONFIDENCE] },
    },
  };
}

export function listingAssistSystemPrompt() {
  const registry = categoryOptions
    .map((option) => `- ${option.value} (${option.label}): ${getInstrumentTypeOptions(option.value).map((type) => `${type.value} (${type.label})`).join(", ")}`)
    .join("\n");
  return `You help a seller on Laria, a Peruvian marketplace for musical instruments and audio gear, say what they are selling from its photos. The seller sees each suggestion next to the form and uses only what they choose, so leave a field empty rather than guess.

From the photos only:
- recognized: false when the photos don't show a musical instrument or audio gear; then leave every text field empty, details empty and confidence low.
- category and instrument_type: from Laria's lists below; the type must belong to the category. Empty when unsure.
- brand and model: as printed on the instrument or gear (headstock, panel, badge, label), or identified from an unmistakable design. Empty when you can't tell.
- title: in Spanish, at most 80 characters: brand, model and what sets it apart (color, finish, series, a year printed on it). No condition, price or sales words.
- details: up to 6 short Spanish phrases, at most 60 characters each, of what a buyer would want to know and the photos clearly show: features, finish, controls, included accessories, visible wear or damage. Don't repeat the brand and model.
- description: 2 to 4 honest Spanish sentences, at most 600 characters, about what the photos show, written for buyers. Don't rate the overall condition, don't say how it sounds or whether it works, don't mention a price, and don't invent history, accessories or specifications you can't see. Don't list the details again.
- confidence: high when brand and model are clearly readable, medium when identified from the design, low otherwise.

Laria's categories and their instrument types:
${registry}

Write the text fields in neutral Peruvian Spanish.`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// One line of plain text: no control characters or markup, spaces collapsed, cut at a word when over max.
function line(value: string, max: number) {
  const text = value.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return (cut.lastIndexOf(" ") > max * 0.6 ? cut.slice(0, cut.lastIndexOf(" ")) : cut).trim();
}

function paragraph(value: string, max: number) {
  const text = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f<>]/g, " ")
    .split("\n").map((part) => part.replace(/\s+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut).trim();
}

// The model's answer, checked against the site's registries and cut to the form's sizes. A wrong shape is null (the
// route logs it as invalid); a category or type outside the lists, or a type of another category, is left empty.
export function parseListingSuggestion(data: unknown): ListingSuggestion | null {
  if (!isObject(data) || typeof data.recognized !== "boolean" || !Array.isArray(data.details)) return null;
  const texts = [data.category, data.instrument_type, data.brand, data.model, data.title, data.description, data.confidence];
  if (texts.some((value) => typeof value !== "string") || data.details.some((detail) => typeof detail !== "string")) return null;
  const confidence = (CONFIDENCE as readonly string[]).includes(data.confidence as string) ? data.confidence as ListingSuggestion["confidence"] : "low";
  if (!data.recognized) {
    return { recognized: false, category: "", instrumentType: "", brand: "", model: "", title: "", details: [], description: "", confidence: "low" };
  }
  const category = CATEGORIES.includes(data.category as string) ? data.category as string : "";
  const types = getInstrumentTypeOptions(category);
  const instrumentType = category && isInstrumentTypeValid(category, data.instrument_type as string)
    ? data.instrument_type as string
    : types.length === 1 ? types[0].value : "";
  const brand = line(data.brand as string, 60);
  const model = line(data.model as string, 80);
  const details = [...new Set((data.details as string[]).map((detail) => line(detail, 80)).filter(Boolean))]
    .filter((detail) => detail.toLowerCase() !== brand.toLowerCase() && detail.toLowerCase() !== model.toLowerCase())
    .slice(0, 6);
  return {
    recognized: true,
    category,
    instrumentType,
    brand,
    model,
    title: line(data.title as string, 100),
    details,
    description: paragraph(data.description as string, 900),
    confidence,
  };
}

// ------------------------------------------------------------------ using a suggestion in the sell form

export type AssistField = "type" | "brand" | "model" | "title" | "details" | "description";

// empty: nothing of the seller's would change; same: the form already says this; different: using it replaces what
// the seller wrote or chose, so only that row's own button does it, never "Usar todo".
export type AssistRow = { field: AssistField; label: string; value: string; current: string; state: "empty" | "same" | "different" };

export function categoryTypeLabel(category: string, instrumentType: string) {
  const categoryLabel = categoryOptions.find((option) => option.value === category)?.label ?? "";
  const types = getInstrumentTypeOptions(category);
  const typeLabel = types.length > 1 ? types.find((option) => option.value === instrumentType)?.label ?? "" : "";
  // "Pedales", not "Pedales · Pedales".
  return [categoryLabel, typeLabel.toLowerCase() === categoryLabel.toLowerCase() ? "" : typeLabel].filter(Boolean).join(" · ");
}

// The seller's own description: without the store's standard text at the end (SHOP 06).
export function ownDescription(description: string, footer: string) {
  const trimmed = description.trim();
  return footer && trimmed.endsWith(footer) ? trimmed.slice(0, trimmed.length - footer.length).trim() : trimmed;
}

function withFooter(text: string, footer: string) {
  return footer ? (text ? `${text}\n\n${footer}` : `\n\n${footer}`) : text;
}

export function detailsParagraph(details: readonly string[]) {
  return details.length ? `Detalles:\n${details.map((detail) => `- ${detail}`).join("\n")}` : "";
}

// The seller's text split from the "Detalles:" list at its end, which "Completar con IA" adds and keeps.
function splitDetails(own: string) {
  const at = own.lastIndexOf("Detalles:\n");
  return at >= 0 ? { text: own.slice(0, at).trim(), details: own.slice(at) } : { text: own, details: "" };
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function assistRows(suggestion: ListingSuggestion, values: SellValues, footer: string): AssistRow[] {
  if (!suggestion.recognized) return [];
  const rows: AssistRow[] = [];
  const row = (field: AssistField, label: string, value: string, current: string, state?: AssistRow["state"]) => {
    if (value) rows.push({ field, label, value, current, state: state ?? (!current.trim() ? "empty" : same(value, current) ? "same" : "different") });
  };
  if (suggestion.category) {
    const current = values.category ? categoryTypeLabel(values.category, values.instrumentType) : "";
    const matches = values.category === suggestion.category && (!suggestion.instrumentType || values.instrumentType === suggestion.instrumentType);
    row("type", "Categoría", categoryTypeLabel(suggestion.category, suggestion.instrumentType), current,
      !values.category ? "empty" : matches ? "same" : "different");
  }
  row("brand", "Marca", suggestion.brand, values.brand);
  row("model", "Modelo", suggestion.model, values.model);
  // A title the form wrote from brand and model is not the seller's own (POST 07).
  row("title", "Título", suggestion.title, values.title, !values.titleEdited || !values.title.trim() ? (same(suggestion.title, values.title) ? "same" : "empty") : undefined);
  const own = ownDescription(values.description, footer);
  if (suggestion.details.length) {
    const missing = suggestion.details.filter((detail) => !own.toLowerCase().includes(detail.toLowerCase()));
    row("details", "Detalles", suggestion.details.join(" · "), "", missing.length ? "empty" : "same");
  }
  row("description", "Descripción", suggestion.description, splitDetails(own).text);
  return rows;
}

// One row used. Brand and model rewrite the title only while the form still writes it (titleEdited false); the
// details go below the seller's own text, above the store's standard text.
export function applyAssistField(values: SellValues, suggestion: ListingSuggestion, field: AssistField, footer: string): SellValues {
  switch (field) {
    case "type": {
      const types = getInstrumentTypeOptions(suggestion.category);
      const instrumentType = suggestion.instrumentType || (types.length === 1 ? types[0].value : values.category === suggestion.category ? values.instrumentType : "");
      return {
        ...values,
        category: suggestion.category,
        instrumentType,
        attributes: values.category === suggestion.category && values.instrumentType === instrumentType ? values.attributes : {},
      };
    }
    case "brand":
    case "model": {
      const next = { ...values, [field]: suggestion[field] };
      return values.titleEdited ? next : { ...next, title: titleFromBrandModel(next.brand, next.model) };
    }
    case "title":
      return { ...values, title: suggestion.title, titleEdited: true };
    case "details": {
      const own = ownDescription(values.description, footer);
      const missing = suggestion.details.filter((detail) => !own.toLowerCase().includes(detail.toLowerCase()));
      if (!missing.length) return values;
      return { ...values, description: withFooter([own, detailsParagraph(missing)].filter(Boolean).join("\n\n"), footer) };
    }
    case "description": {
      // Details added earlier stay after the new text.
      const { details } = splitDetails(ownDescription(values.description, footer));
      return { ...values, description: withFooter([suggestion.description, details].filter(Boolean).join("\n\n"), footer) };
    }
  }
}

// "Usar todo": every row whose field is empty, in the form's order; rows that would replace what the seller wrote are
// kept as they are and named, so the seller can use them one by one. The details join a description only when it
// was empty too. When the seller's brand or model differs from the suggestion's, the rows that say which instrument
// it is (brand, model, title, description) are held for their own buttons as well, so "Usar todo" never leaves a
// listing that says Behringer in the brand and Boss in the title. `used` empty: the button has nothing to do.
export function applyAllAssist(values: SellValues, suggestion: ListingSuggestion, footer: string) {
  const rows = assistRows(suggestion, values, footer);
  const kept = rows.filter((item) => item.state === "different").map((item) => item.label);
  const otherInstrument = rows.some((item) => (item.field === "brand" || item.field === "model") && item.state === "different");
  const descriptionWasEmpty = !splitDetails(ownDescription(values.description, footer)).text;
  const used: AssistField[] = [];
  const held: AssistField[] = [];
  let next = values;
  // The title last, so the suggested one wins over the one the form writes from brand and model.
  for (const field of ["type", "brand", "model", "description", "details", "title"] as const) {
    const item = rows.find((candidate) => candidate.field === field);
    if (item?.state !== "empty") continue;
    if (otherInstrument && field !== "type" && field !== "details") {
      held.push(field);
      continue;
    }
    if (field === "details" && !descriptionWasEmpty) {
      kept.push(item.label);
      continue;
    }
    next = applyAssistField(next, suggestion, field, footer);
    used.push(field);
  }
  const labels = (fields: AssistField[]) => rows.filter((item) => fields.includes(item.field)).map((item) => item.label);
  const note = held.length
    ? `Completamos lo que estaba vacío, menos lo que dice qué equipo es (${labels(held).join(", ")}): sugerimos ${titleFromBrandModel(suggestion.brand, suggestion.model)} y tú escribiste ${titleFromBrandModel(values.brand, values.model)}. Usa el botón de cada sugerencia si corresponde.`
    : kept.length
      ? `Completamos lo que estaba vacío. No cambiamos lo que ya escribiste (${kept.join(", ")}): usa su botón si prefieres la sugerencia.`
      : "Completamos los campos. Revísalos antes de seguir.";
  return { values: next, kept, held: labels(held), used: labels(used), note };
}
