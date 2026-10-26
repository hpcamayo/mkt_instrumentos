// listing-details: the yes/no filters a buyer can add to any search ("Envía a provincia", "Se puede probar", "Acepta
// cambios"). Each is a flag the database keeps on the listing (listings.listing_flags, 20261202120100) from the
// listing's own columns. Search, facet counts, saved alerts, chips and the filter sheet all follow from this list.
//
// Adding a flag (store-floor's "Con garantía", for one): one entry here, plus in the database one row in
// laria_private.listing_flag_filters and a listings_flags_<batch> trigger that appends it (docs/database.md).
// Pure, with no imports, so the browser, the server and the tests share it.

export type ListingFlagFilter = {
  flag: string;
  label: string;
  // One line under the option in the filter sheet.
  hint: string;
};

// BEGIN listing flag filters (additive: one entry per flag, in the order the filters show them)
export const listingFlagFilters: readonly ListingFlagFilter[] = [
  { flag: "envia_provincia", label: "Envía a provincia", hint: "El vendedor envía por agencia a todo el Perú." },
  { flag: "se_puede_probar", label: "Se puede probar", hint: "Puedes probarlo antes de comprar." },
  { flag: "acepta_cambios", label: "Acepta cambios", hint: "El vendedor considera cambios por otro equipo." },
  // store-floor (reach-09)
  { flag: "con_garantia", label: "Con garantía", hint: "La tienda o la marca dan garantía. La ofrece la tienda, no Laria." },
];
// END listing flag filters

const KNOWN = new Set(listingFlagFilters.map((filter) => filter.flag));
const ORDER = listingFlagFilters.map((filter) => filter.flag);

// The URL spells a flag with hyphens (?opciones=envia-provincia); the database and saved alerts with underscores.
export function flagSlug(flag: string) {
  return flag.replace(/_/g, "-");
}

export function isListingFlag(value: string) {
  return KNOWN.has(value);
}

// URL values (slugs or flags, one per parameter or comma separated) as known flags, each once, in list order.
export function parseListingOptions(values: readonly string[]) {
  const wanted = new Set(
    values
      .flatMap((value) => value.split(","))
      .map((value) => value.trim().toLowerCase().replace(/-/g, "_"))
      .filter((value) => KNOWN.has(value)),
  );
  return ORDER.filter((flag) => wanted.has(flag));
}

export function listingFlagLabel(flag: string) {
  return listingFlagFilters.find((filter) => filter.flag === flag)?.label ?? null;
}

// Adds or removes one flag, keeping list order so a choice gives one URL whatever the click order.
export function toggleListingOption(current: readonly string[], flag: string | null) {
  if (flag === null) return [];
  if (!KNOWN.has(flag)) return [...current];
  const next = current.includes(flag) ? current.filter((item) => item !== flag) : [...current, flag];
  return ORDER.filter((item) => next.includes(item));
}
