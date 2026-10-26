import { citySuggestions, peruRegions } from "@/lib/location";
import { getInstrumentFilterGroup } from "@/lib/instrument-filters";
import { CONDITION_VALUES } from "@/lib/listing-condition";
import { toggleListingOption } from "@/lib/listing-flags";
import type { ListingFilters } from "@/lib/listings";

// BIG 03 (Effortless Laria): a plain phrase in the search box becomes filters the visitor can see and edit. "bajo 5
// cuerdas menos de 2000 en Lima" becomes Bajos · Número de cuerdas: 5 · Hasta S/ 2,000 · Lima, and whatever is left
// ("fender", "stratocaster") stays as the text search. Pure, so the catalog page and the tests share it. A second pass
// over its own output changes nothing, so the page can redirect once.

export function foldText(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// `advanced` names one attribute value, for words that name a subtype ("quena" → Andinos, tipo Quena).
type Kind = { category: string; instrumentType?: string; advanced?: Record<string, string> };

// Words that name a category or a type (folded). Longer phrases are tried first.
const kindWordsAsWritten: readonly (readonly [string, Kind])[] = [
  ["guitarras eléctricas", { category: "guitars", instrumentType: "electric_guitar" }],
  ["guitarra eléctrica", { category: "guitars", instrumentType: "electric_guitar" }],
  ["guitarras acústicas", { category: "guitars", instrumentType: "acoustic_guitar" }],
  ["guitarra acústica", { category: "guitars", instrumentType: "acoustic_guitar" }],
  ["guitarra electroacústica", { category: "guitars", instrumentType: "acoustic_guitar" }],
  ["guitarra clásica", { category: "guitars", instrumentType: "acoustic_guitar" }],
  ["guitarras clásicas", { category: "guitars", instrumentType: "acoustic_guitar" }],
  ["guitarra criolla", { category: "guitars", instrumentType: "acoustic_guitar" }],
  ["interfaz de audio", { category: "audio", instrumentType: "audio_interface" }],
  ["interfaces de audio", { category: "audio", instrumentType: "audio_interface" }],
  ["tarjeta de sonido", { category: "audio", instrumentType: "audio_interface" }],
  ["guitarras", { category: "guitars" }],
  ["guitarra", { category: "guitars" }],
  ["eléctricas", { category: "guitars", instrumentType: "electric_guitar" }],
  ["eléctrica", { category: "guitars", instrumentType: "electric_guitar" }],
  ["acústicas", { category: "guitars", instrumentType: "acoustic_guitar" }],
  ["acústica", { category: "guitars", instrumentType: "acoustic_guitar" }],
  ["bajos", { category: "basses" }],
  ["bajo", { category: "basses" }],
  ["bass", { category: "basses" }],
  ["teclados", { category: "keyboards" }],
  ["teclado", { category: "keyboards" }],
  ["pianos", { category: "keyboards" }],
  ["piano", { category: "keyboards" }],
  ["sintetizador", { category: "keyboards" }],
  ["baterías", { category: "percussion", instrumentType: "drums" }],
  ["batería", { category: "percussion", instrumentType: "drums" }],
  ["platillos", { category: "percussion", instrumentType: "cymbals" }],
  ["platillo", { category: "percussion", instrumentType: "cymbals" }],
  ["cajón", { category: "percussion", instrumentType: "hand_percussion" }],
  ["congas", { category: "percussion", instrumentType: "hand_percussion" }],
  ["percusión", { category: "percussion" }],
  ["vientos", { category: "winds" }],
  ["saxofón", { category: "winds" }],
  ["saxo", { category: "winds" }],
  ["trompeta", { category: "winds" }],
  ["flauta", { category: "winds" }],
  ["violín", { category: "strings" }],
  ["ukulele", { category: "strings" }],
  // disc-04: the Andean instruments have their own category; the cajón stays in Percusión.
  ["bombo andino", { category: "andean", instrumentType: "andean_instrument", advanced: { andean_type: "bombo_andino" } }],
  ["instrumentos andinos", { category: "andean" }],
  ["andinos", { category: "andean" }],
  ["andino", { category: "andean" }],
  ["charangos", { category: "andean", instrumentType: "andean_instrument", advanced: { andean_type: "charango" } }],
  ["charango", { category: "andean", instrumentType: "andean_instrument", advanced: { andean_type: "charango" } }],
  ["ronroco", { category: "andean", instrumentType: "andean_instrument", advanced: { andean_type: "ronroco" } }],
  ["quenas", { category: "andean", instrumentType: "andean_instrument", advanced: { andean_type: "quena" } }],
  ["quena", { category: "andean", instrumentType: "andean_instrument", advanced: { andean_type: "quena" } }],
  ["quenacho", { category: "andean", instrumentType: "andean_instrument", advanced: { andean_type: "quenacho" } }],
  ["zampoñas", { category: "andean", instrumentType: "andean_instrument", advanced: { andean_type: "zampona" } }],
  ["zampoña", { category: "andean", instrumentType: "andean_instrument", advanced: { andean_type: "zampona" } }],
  ["siku", { category: "andean", instrumentType: "andean_instrument", advanced: { andean_type: "zampona" } }],
  ["sikus", { category: "andean", instrumentType: "andean_instrument", advanced: { andean_type: "zampona" } }],
  ["antara", { category: "andean", instrumentType: "andean_instrument", advanced: { andean_type: "antara" } }],
  ["tinya", { category: "andean", instrumentType: "andean_instrument", advanced: { andean_type: "tinya" } }],
  ["pedales", { category: "pedals" }],
  ["pedal", { category: "pedals" }],
  ["pedalera", { category: "pedals" }],
  ["amplificadores", { category: "amplifiers" }],
  ["amplificador", { category: "amplifiers" }],
  ["ampli", { category: "amplifiers" }],
  ["amp", { category: "amplifiers" }],
  ["micrófonos", { category: "microphones" }],
  ["micrófono", { category: "microphones" }],
  ["interfaz", { category: "audio", instrumentType: "audio_interface" }],
];
// Matched against folded text, so folded once here.
const kindWords = kindWordsAsWritten.map(([words, kind]) => [foldText(words), kind] as const);

// "2000", "2,000", "2.000", "2k", "2 mil", "s/ 2000", "2000 soles".
const AMOUNT = String.raw`(?:s\/\.?\s*)?(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(k|mil)?(?:\s*soles)?`;
const amount = (digits: string, suffix?: string) => {
  const value = Number(digits.replace(/[.,]/g, ""));
  return Number.isSafeInteger(value) ? (suffix ? value * 1000 : value) : undefined;
};

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Known places: the cities the catalog has (from its facets) plus the usual ones and every region, folded → display.
function placeIndex(cities: readonly string[]) {
  const index = new Map<string, string>();
  for (const city of [...citySuggestions, ...peruRegions, ...cities]) index.set(foldText(city), city);
  return index;
}

export type PhraseResult = { filters: ListingFilters; changed: boolean };

export function applySearchPhrase(filters: ListingFilters, knownCities: readonly string[] = []): PhraseResult {
  if (!filters.q) return { filters, changed: false };
  let text = ` ${foldText(filters.q).replace(/\s+/g, " ").trim()} `;
  const next: ListingFilters = { ...filters, advanced: { ...filters.advanced } };
  let changed = false;
  const take = (pattern: RegExp, apply: (match: RegExpExecArray) => boolean) => {
    const match = pattern.exec(text);
    if (match && apply(match)) {
      text = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
      changed = true;
    }
  };

  // Price: "entre 500 y 1500", "menos de 2000", "hasta 2k", "desde 500", "más de 1500".
  take(new RegExp(String.raw` entre ${AMOUNT} y ${AMOUNT} `), (m) => {
    const low = amount(m[1], m[2]);
    const high = amount(m[3], m[4]);
    if (low === undefined || high === undefined) return false;
    [next.minPrice, next.maxPrice] = low <= high ? [low, high] : [high, low];
    return true;
  });
  take(new RegExp(foldText(String.raw` (?:menos de|hasta|máximo|max\.?|por debajo de|a lo mucho) `) + AMOUNT + " "), (m) => {
    const value = amount(m[1], m[2]);
    if (value === undefined) return false;
    next.maxPrice = value;
    return true;
  });
  take(new RegExp(foldText(String.raw` (?:más de|desde|mínimo|min\.?|sobre) `) + AMOUNT + " "), (m) => {
    const value = amount(m[1], m[2]);
    if (value === undefined) return false;
    next.minPrice = value;
    return true;
  });

  // Seller: "tienda verificada".
  take(/ (?:de )?tiendas? verificadas? /, () => {
    next.sellerType = "verified_store";
    return true;
  });

  // Condition (sell-10's scale): "seminuevo" is the top used steps, "usado" or "segunda mano" every step but Nuevo,
  // "para reparar" the last step.
  take(/ (?:seminuevos?|seminuevas?|semi nuevos?|semi nuevas?) /, () => {
    next.conditions = ["Como nuevo", "Excelente"];
    return true;
  });
  take(/ (?:nuevos?|nuevas?) /, () => {
    next.conditions = ["Nuevo"];
    return true;
  });
  take(/ (?:para reparar|para repuestos|malogrados?|malogradas?) /, () => {
    next.conditions = ["Para reparar"];
    return true;
  });
  take(/ (?:usados?|usadas?|de segunda mano|segunda mano) /, () => {
    next.conditions = CONDITION_VALUES.filter((value) => value !== "Nuevo");
    return true;
  });

  // listing-details: "con envío a provincia", "acepta cambios", "se puede probar" (lib/listing-flags.ts).
  const option = (flag: string) => () => {
    next.options = toggleListingOption((next.options ?? []).filter((item) => item !== flag), flag);
    return true;
  };
  take(/ (?:con )?(?:envios?|envian?) a (?:provincias?|todo el peru) /, option("envia_provincia"));
  take(/ (?:aceptan?|acepto) (?:cambios?|canjes?) /, option("acepta_cambios"));
  take(/ (?:se puede probar|para probar|puedo probar) /, option("se_puede_probar"));

  // Category and type, when the page has none yet or names the same category.
  for (const [words, kind] of kindWords) {
    const pattern = new RegExp(` ${escape(words)} `);
    if (!pattern.test(text)) continue;
    if (next.category && next.category !== kind.category) break;
    take(pattern, () => {
      next.category = kind.category;
      if (kind.instrumentType && !next.instrumentType) next.instrumentType = kind.instrumentType;
      if (kind.advanced && next.instrumentType === kind.instrumentType) {
        for (const [key, value] of Object.entries(kind.advanced)) if (next.advanced[key] === undefined) next.advanced[key] = value;
      }
      return true;
    });
    break;
  }

  // "5 cuerdas" when the type has a strings attribute (basses, electric guitars).
  const group = next.instrumentType ? getInstrumentFilterGroup(next.instrumentType) : next.category === "basses" ? getInstrumentFilterGroup("bass") : null;
  const strings = group?.filters.find((filter) => filter.key === "strings");
  if (strings) {
    take(/ (\d{1,2}) cuerdas /, (m) => {
      if (!strings.options?.some((option) => option.value === m[1])) return false;
      if (!next.instrumentType && group) next.instrumentType = group.instrumentType;
      next.advanced.strings = m[1];
      return true;
    });
  }

  // Place: "en Lima", "en Arequipa", or a known city named alone.
  const places = placeIndex(knownCities);
  const sorted = [...places.keys()].sort((a, b) => b.length - a.length);
  for (const place of sorted) {
    const pattern = new RegExp(` (?:en |de )?${escape(place)} `);
    if (!pattern.test(text)) continue;
    take(pattern, () => {
      const city = places.get(place) ?? place;
      if (!next.cities.includes(city)) next.cities = [...next.cities, city];
      return true;
    });
    break;
  }

  if (!changed) return { filters, changed: false };
  const rest = text.replace(/\s+/g, " ").trim();
  // Keep the visitor's own spelling for what is left, when it can still be found in the original text.
  const original = filters.q.replace(/\s+/g, " ").trim();
  const kept = rest ? original.split(" ").filter((word) => rest.split(" ").includes(foldText(word))).join(" ") || rest : "";
  if (kept) next.q = kept;
  else delete next.q;
  return { filters: next, changed: true };
}
