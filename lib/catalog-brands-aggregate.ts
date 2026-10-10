// Brands per marketplace category from catalog rows (lib/catalog-brands.ts reads them). Pure, so tests pin it.

export type CategoryBrand = { name: string; models: number };
// Listing category value ("guitars", "pedals"…) → its brands, the ones with the most catalog models first.
export type CatalogBrandsByCategory = Record<string, CategoryBrand[]>;

export function aggregateCatalogBrands(
  categories: readonly { id: string; laria_category: string | null }[],
  products: readonly { category_id: string | null; manufacturer_id: string }[],
  manufacturers: readonly { id: string; canonical_name: string }[],
): CatalogBrandsByCategory {
  const listingCategory = new Map(categories.flatMap((row) => (row.laria_category ? [[row.id, row.laria_category] as const] : [])));
  const names = new Map(manufacturers.map((row) => [row.id, row.canonical_name.trim()]));
  const counts = new Map<string, Map<string, number>>();
  for (const product of products) {
    const category = product.category_id ? listingCategory.get(product.category_id) : undefined;
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
