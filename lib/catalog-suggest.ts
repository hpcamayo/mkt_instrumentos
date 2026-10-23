import { categoryLandingPath, categoryTypePath } from "@/lib/category-pages";
import { CATALOG_PATH } from "@/lib/catalog-filters";
import { foldText } from "@/lib/catalog-query";
import { instrumentFilterGroups } from "@/lib/instrument-filters";
import { instrumentTypesByCategory } from "@/lib/listing-submission";
import { categoryOptions } from "@/lib/listings";

// FIND 01 (Effortless Laria): what the search box suggests while typing. Categories and types whose names start with
// (or contain) the words typed, brands and models from public.catalog_suggest, each with how many listings it has, so
// nothing suggested leads to an empty page. Pure, apart from the counts the route passes in.

export type Suggestion = { kind: "category" | "type" | "brand" | "model"; label: string; detail: string; href: string; count: number };
export type TypeCount = { category: string; instrument_type: string | null; listings: number };
export type BrandModel = { kind: string; brand: string; model: string | null; listings: number };

const typeCategory = new Map<string, string>();
for (const [category, types] of Object.entries(instrumentTypesByCategory)) for (const type of types) if (type !== "other" && !typeCategory.has(type)) typeCategory.set(type, category);

function matches(label: string, query: string) {
  const folded = foldText(label);
  return folded.startsWith(query) || folded.split(/\s+/).some((word) => word.startsWith(query));
}

export function suggestionQuery(value: string) {
  return foldText(value).replace(/\s+/g, " ").trim().slice(0, 60);
}

export function buildSuggestions(rawQuery: string, typeCounts: readonly TypeCount[], brandModels: readonly BrandModel[], limit = 8): Suggestion[] {
  const query = suggestionQuery(rawQuery);
  if (query.length < 2) return [];
  const byCategory = new Map<string, number>();
  const byType = new Map<string, number>();
  for (const row of typeCounts) {
    byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.listings);
    if (row.instrument_type) byType.set(`${row.category}:${row.instrument_type}`, row.listings);
  }
  const result: Suggestion[] = [];
  for (const option of categoryOptions) {
    const count = byCategory.get(option.value) ?? 0;
    if (count > 0 && matches(option.label, query)) result.push({ kind: "category", label: option.label, detail: "Categoría", href: categoryLandingPath(option.value), count });
  }
  for (const group of instrumentFilterGroups) {
    const category = typeCategory.get(group.instrumentType);
    if (!category) continue;
    const count = byType.get(`${category}:${group.instrumentType}`) ?? 0;
    const label = group.label;
    if (count > 0 && matches(label, query) && !result.some((item) => item.label === label)) {
      result.push({ kind: "type", label, detail: categoryOptions.find((option) => option.value === category)?.label ?? "", href: categoryTypePath(category, group.instrumentType), count });
    }
  }
  for (const row of brandModels) {
    if (row.listings <= 0) continue;
    if (row.kind === "model" && row.model) {
      result.push({ kind: "model", label: `${row.brand} ${row.model}`, detail: "Modelo", href: `${CATALOG_PATH}?${new URLSearchParams({ q: `${row.brand} ${row.model}` })}`, count: row.listings });
    } else {
      result.push({ kind: "brand", label: row.brand, detail: "Marca", href: `${CATALOG_PATH}?${new URLSearchParams({ brand: row.brand })}`, count: row.listings });
    }
  }
  return result.slice(0, limit);
}
