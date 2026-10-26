// Brands per marketplace category from catalog rows (lib/catalog-brands.ts reads them). Pure, so tests pin it.

// listings: how many listings have the brand (FIND 06), when known.
export type CategoryBrand = { name: string; models: number; listings?: number };
// Listing category value ("guitars", "pedals"…) → its brands, the ones with the most catalog models first.
export type CatalogBrandsByCategory = Record<string, CategoryBrand[]>;

// Catalog category (its dotted id, docs/database.md § Canonical instrument catalog) → marketplace category; the longest
// matching prefix wins ("pro_audio.microphones.usb" → microphones, "pro_audio.mixers" → audio). Kept here instead of
// reading catalog_categories.laria_category, which the catalog build still writes with the eight categories used before
// 12 Oct 2026. Catalog categories no marketplace category covers (DJ, studio, accessories) map to none.
const catalogCategoryPrefixes: readonly (readonly [string, string])[] = [
  ["instruments.guitars", "guitars"],
  ["instruments.bass", "basses"],
  ["instruments.keyboards", "keyboards"],
  ["studio.midi_controllers", "keyboards"],
  ["instruments.drums", "percussion"],
  ["instruments.folk.cajon", "percussion"],
  // disc-04: the other folk instruments (charango, quena, zampoña…) are the Andinos y tradicionales category.
  ["instruments.folk", "andean"],
  ["instruments.wind", "winds"],
  ["instruments.strings", "strings"],
  ["effects", "pedals"],
  ["amplification", "amplifiers"],
  ["pro_audio.microphones", "microphones"],
  ["pro_audio.wireless", "microphones"],
  ["pro_audio", "audio"],
];

export function marketplaceCategoryOf(catalogCategoryId: string) {
  let match: readonly [string, string] | null = null;
  for (const entry of catalogCategoryPrefixes) {
    const [prefix] = entry;
    const covers = catalogCategoryId === prefix || catalogCategoryId.startsWith(`${prefix}.`);
    if (covers && (!match || prefix.length > match[0].length)) match = entry;
  }
  return match ? match[1] : null;
}

export function aggregateCatalogBrands(
  products: readonly { category_id: string | null; manufacturer_id: string }[],
  manufacturers: readonly { id: string; canonical_name: string }[],
): CatalogBrandsByCategory {
  const names = new Map(manufacturers.map((row) => [row.id, row.canonical_name.trim()]));
  const counts = new Map<string, Map<string, number>>();
  for (const product of products) {
    const category = product.category_id ? marketplaceCategoryOf(product.category_id) : null;
    const name = names.get(product.manufacturer_id);
    if (!category || !name) continue;
    const brands = counts.get(category) ?? new Map<string, number>();
    brands.set(name, (brands.get(name) ?? 0) + 1);
    counts.set(category, brands);
  }
  return Object.fromEntries(
    [...counts].map(([category, brands]) => [
      category,
      [...brands]
        .map(([name, models]) => ({ name, models }))
        .sort((a, b) => b.models - a.models || a.name.localeCompare(b.name, "es")),
    ]),
  );
}

// The landing lists every brand alphabetically; the strip takes the first ones of the count order.
export function brandsAlphabetical(brands: readonly CategoryBrand[]) {
  return [...brands].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
}

// The catalog's brands kept to those with listings, plus listing brands the catalog does not know; most listings first.
// The catalog's spelling wins when both have the brand.
export function brandsWithListings(catalog: CatalogBrandsByCategory, listings: readonly { category: string; brand: string; listings: number }[]): CatalogBrandsByCategory {
  const result: CatalogBrandsByCategory = {};
  const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  for (const row of listings) {
    const known = (catalog[row.category] ?? []).find((brand) => fold(brand.name) === fold(row.brand));
    (result[row.category] ??= []).push({ name: known?.name ?? row.brand.trim(), models: known?.models ?? 0, listings: Number(row.listings) });
  }
  for (const brands of Object.values(result)) brands.sort((a, b) => (b.listings ?? 0) - (a.listings ?? 0) || a.name.localeCompare(b.name, "es"));
  return result;
}
