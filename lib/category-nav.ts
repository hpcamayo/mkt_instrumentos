import { catalogHref } from "@/lib/catalog-filters";
import { attributeValueLabel, getInstrumentFilterGroup } from "@/lib/instrument-filters";
import type { ListingFilters } from "@/lib/listings";

// The detailed category navigation (docs/ux-redesign/category-navigation.md): under each instrument type, the
// subtypes a buyer browses by (Strat, Tele, Clásicas, Delay…), and under each category the brands the instrument
// catalog carries. Subtypes are values of the listing attributes the catalog filters already accept, so every link is
// a working filter of today's catalog query; brands use the catalog's brand filter. Pure and browser-safe: the strip
// (client) and the category landings (server) build the same links.

export type NavLink = { label: string; href: string };

// The values shown per type, in menu order. `label` names the subtype in the menu where the attribute's own option
// label would read oddly on its own ("Zurdo" → "Para zurdos"); otherwise the option label is used.
type NavValue = { key: string; value: string; label?: string };

const LEFT_HANDED: NavValue = { key: "handedness", value: "left_handed", label: "Para zurdos" };

const subtypeValues: Record<string, readonly NavValue[]> = {
  electric_guitar: [
    { key: "shape", value: "strat" },
    { key: "shape", value: "tele" },
    { key: "shape", value: "les_paul" },
    { key: "shape", value: "sg" },
    { key: "shape", value: "offset" },
    { key: "shape", value: "superstrat" },
    { key: "body_type", value: "semi_hollow", label: "Semihuecas" },
    { key: "body_type", value: "hollow_body", label: "Huecas" },
    LEFT_HANDED,
  ],
  acoustic_guitar: [
    { key: "acoustic_type", value: "classical", label: "Clásicas" },
    { key: "acoustic_type", value: "acoustic", label: "Acústicas" },
    { key: "acoustic_type", value: "electro_acoustic", label: "Electroacústicas" },
    { key: "body_shape", value: "dreadnought" },
    { key: "body_shape", value: "jumbo" },
    { key: "body_shape", value: "concert" },
    { key: "body_shape", value: "parlor" },
    LEFT_HANDED,
  ],
  bass: [
    { key: "strings", value: "4" },
    { key: "strings", value: "5" },
    { key: "strings", value: "6" },
    { key: "bass_type", value: "jazz_bass" },
    { key: "bass_type", value: "precision" },
    { key: "bass_type", value: "stingray" },
    { key: "bass_type", value: "hollow" },
    LEFT_HANDED,
  ],
  drums: [
    { key: "drum_type", value: "acoustic", label: "Acústicas" },
    { key: "drum_type", value: "electronic", label: "Electrónicas" },
    { key: "configuration", value: "complete", label: "Completas" },
    { key: "configuration", value: "shell_pack" },
  ],
  cymbals: [
    { key: "cymbal_type", value: "hi_hat" },
    { key: "cymbal_type", value: "crash" },
    { key: "cymbal_type", value: "ride" },
    { key: "cymbal_type", value: "china" },
    { key: "cymbal_type", value: "splash" },
    { key: "cymbal_type", value: "stack" },
  ],
  microphones: [
    { key: "microphone_type", value: "dynamic", label: "Dinámicos" },
    { key: "microphone_type", value: "condenser", label: "De condensador" },
    { key: "microphone_type", value: "ribbon" },
    { key: "microphone_type", value: "lavalier", label: "Corbateros" },
    { key: "microphone_type", value: "shotgun", label: "De cañón" },
    { key: "connection", value: "usb", label: "USB" },
  ],
  pedals: [
    { key: "pedal_type", value: "overdrive" },
    { key: "pedal_type", value: "distortion" },
    { key: "pedal_type", value: "fuzz" },
    { key: "pedal_type", value: "delay" },
    { key: "pedal_type", value: "reverb" },
    { key: "pedal_type", value: "chorus" },
    { key: "pedal_type", value: "wah" },
    { key: "pedal_type", value: "compressor", label: "Compresores" },
    { key: "pedal_type", value: "tuner", label: "Afinadores" },
    { key: "pedal_type", value: "multi_fx" },
  ],
  amplifiers: [
    { key: "use_case", value: "guitar", label: "Para guitarra" },
    { key: "use_case", value: "bass", label: "Para bajo" },
    { key: "use_case", value: "keyboard", label: "Para teclado" },
    { key: "amplifier_type", value: "combo", label: "Combos" },
    { key: "amplifier_type", value: "head", label: "Cabezales" },
    { key: "amplifier_type", value: "cabinet", label: "Gabinetes" },
    { key: "technology", value: "tube", label: "De tubos" },
    { key: "technology", value: "modeling", label: "De modelado" },
  ],
  audio_interface: [
    { key: "inputs", value: "1", label: "1 entrada" },
    { key: "inputs", value: "2" },
    { key: "inputs", value: "4" },
    { key: "inputs", value: "8_plus" },
    { key: "connection", value: "usb" },
    { key: "connection", value: "usb_c" },
    { key: "connection", value: "thunderbolt" },
  ],
};

const noFilters = (filters: Partial<ListingFilters>): ListingFilters => ({ cities: [], conditions: [], advanced: {}, sort: "newest", ...filters });

// One link per subtype: the catalog with the category, the type and that attribute value. A value the type's filters
// no longer list is skipped, so the menu cannot offer a filter the catalog would ignore.
export function subtypeLinks(category: string, instrumentType: string): NavLink[] {
  const group = getInstrumentFilterGroup(instrumentType);
  return (subtypeValues[instrumentType] ?? []).flatMap((item) => {
    const filter = group?.filters.find((candidate) => candidate.key === item.key);
    if (!filter?.options?.some((option) => option.value === item.value)) return [];
    const value = filter.type === "multiselect" ? [item.value] : item.value;
    return [{
      label: item.label ?? attributeValueLabel(filter, item.key, item.value),
      href: catalogHref(noFilters({ category, instrumentType, advanced: { [item.key]: value } })),
    }];
  });
}

// A brand inside a category: the catalog's brand filter (brand ILIKE '%name%', as the search box) with the category.
export function categoryBrandHref(category: string, brand: string) {
  return catalogHref(noFilters({ category, brand }));
}

// How many brands the strip panel lists; the landing lists them all.
export const MENU_BRAND_COUNT = 8;
// The landing's brand section, the strip's "Ver todas las marcas" target.
export const BRANDS_ANCHOR = "marcas";
