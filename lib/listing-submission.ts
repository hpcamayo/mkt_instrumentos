import {
  getInstrumentFilterGroup,
  instrumentFilterGroups,
  type InstrumentFilterConfig,
} from "./instrument-filters";

export const MIN_LISTING_PHOTOS = 2;
export const MAX_LISTING_PHOTOS = 10;
export const MAX_LISTING_PHOTO_BYTES = 5 * 1024 * 1024;

// Mirrors public.listing_taxonomy_is_valid (supabase/migrations/20261207120000_feat_discovery.sql).
export const instrumentTypesByCategory: Record<string, readonly string[]> = {
  guitars: ["electric_guitar", "acoustic_guitar", "other"],
  basses: ["bass", "other"],
  keyboards: ["keyboards", "other"],
  percussion: ["drums", "cymbals", "hand_percussion", "other"],
  winds: ["winds", "other"],
  strings: ["string_instrument", "other"],
  pedals: ["pedals", "other"],
  amplifiers: ["amplifiers", "other"],
  microphones: ["microphones", "other"],
  audio: ["audio_interface", "audio_gear", "other"],
  andean: ["andean_instrument", "other"],
};

export type ListingAttributeValue = string | string[] | number | boolean;
export type ListingSubmissionAttributes = Record<string, ListingAttributeValue>;

export function getInstrumentTypeOptions(category: string) {
  const allowed = instrumentTypesByCategory[category] ?? [];
  return instrumentFilterGroups
    .filter((group) => allowed.includes(group.instrumentType))
    .map((group) => ({ value: group.instrumentType, label: group.label }));
}

export function isInstrumentTypeValid(category: string, instrumentType: string) {
  const allowed = instrumentTypesByCategory[category];
  return Boolean(allowed?.length && allowed.includes(instrumentType));
}

export function isListingPhotoCountValid(count: number) {
  return count >= MIN_LISTING_PHOTOS && count <= MAX_LISTING_PHOTOS;
}

export function sanitizeListingAttributes(
  instrumentType: string,
  value: unknown,
): ListingSubmissionAttributes | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const group = getInstrumentFilterGroup(instrumentType);
  if (!group) return null;

  const input = value as Record<string, unknown>;
  const output: ListingSubmissionAttributes = {};

  for (const filter of group.filters) {
    const sanitized = sanitizeAttribute(filter, input[filter.key]);
    if (sanitized === null) return null;
    if (sanitized !== undefined) output[filter.key] = sanitized;
  }

  if (Object.keys(input).some((key) => !group.filters.some((item) => item.key === key))) {
    return null;
  }

  return output;
}

function sanitizeAttribute(filter: InstrumentFilterConfig, raw: unknown) {
  if (raw === undefined || raw === null || raw === "") return undefined;

  if (filter.type === "number") {
    const number = Number(raw);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  if (filter.type === "multiselect") {
    if (!Array.isArray(raw)) return null;
    const values = [...new Set(raw.filter((item): item is string => typeof item === "string"))];
    if (values.length === 0) return undefined;
    return values.every((item) => isAllowedOption(filter, item)) ? values : null;
  }

  if (typeof raw !== "string") return null;
  return isAllowedOption(filter, raw) ? raw : null;
}

function isAllowedOption(filter: InstrumentFilterConfig, value: string) {
  return Boolean(filter.options?.some((option) => option.value === value));
}
