import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  CatalogCategoryNode,
  CatalogJevInputsRow,
  CatalogLookupRow,
  CatalogMatchRow,
  CatalogProductDetail,
  CatalogSource,
} from "@/lib/catalog-intelligence/types";

// catalog-resolver: the existing DB-backed lookup. It only calls the production catalog functions and reads the
// public catalog tables; it adds no search logic of its own. The catalog tables are not in database.types.ts yet
// (database.md: regenerated in the sprint that first reads them), so this client is untyped and every row is
// normalized here.

export function getCatalogSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

// The query the catalog sees for a seller's brand and model: the brand is repeated as the manufacturer hint, the
// way catalog_match() expects it ("Boss" + "DS1" -> query "Boss DS1", hint "Boss").
export function catalogQuery(brand: string, model: string) {
  const cleanBrand = brand.replace(/\s+/g, " ").trim();
  const cleanModel = model.replace(/\s+/g, " ").trim();
  const modelHasBrand = cleanBrand !== "" && cleanModel.toLowerCase().startsWith(cleanBrand.toLowerCase());
  return {
    query: (modelHasBrand ? cleanModel : `${cleanBrand} ${cleanModel}`).trim().slice(0, 200),
    manufacturerHint: cleanBrand ? cleanBrand.slice(0, 80) : null,
  };
}

const CATEGORY_CACHE_MS = 60 * 60 * 1000;
let categoryCache: { at: number; byId: Map<string, CatalogCategoryNode> } | null = null;

export function createSupabaseCatalogSource(client: SupabaseClient): CatalogSource {
  async function categories() {
    if (categoryCache && Date.now() - categoryCache.at < CATEGORY_CACHE_MS) return categoryCache.byId;
    const { data, error } = await client
      .from("catalog_categories")
      .select("id, parent_id, label_es, laria_category, laria_instrument_type");
    if (error) throw new Error(`catalog_categories: ${error.message}`);
    const byId = new Map<string, CatalogCategoryNode>((data ?? []).map((row) => [row.id as string, row as CatalogCategoryNode]));
    categoryCache = { at: Date.now(), byId };
    return byId;
  }

  return {
    async lookup(query, manufacturerHint, maxResults) {
      const { data, error } = await client.rpc("catalog_lookup", {
        query,
        manufacturer_hint: manufacturerHint,
        max_results: maxResults,
      });
      if (error) throw new Error(`catalog_lookup: ${error.message}`);
      return ((data ?? []) as Record<string, unknown>[]).map(normalizeLookupRow);
    },
    async match(query, manufacturerHint) {
      const { data, error } = await client.rpc("catalog_match", { query, manufacturer_hint: manufacturerHint });
      if (error) throw new Error(`catalog_match: ${error.message}`);
      return normalizeMatchRow(firstRow(data));
    },
    async jevInputs(query, manufacturerHint) {
      const { data, error } = await client.rpc("catalog_jev_inputs", { query, manufacturer_hint: manufacturerHint });
      if (error) throw new Error(`catalog_jev_inputs: ${error.message}`);
      return normalizeJevInputsRow(firstRow(data));
    },
    async productDetail(productId) {
      const { data: product, error } = await client
        .from("catalog_products")
        .select(
          "id, canonical_model_name, entity_level, family_product_id, category_id, verification_status, quality_status, publish_ready, detail_status, missing_attributes, untrusted_attributes, variant_attributes, superseded_at, manufacturer:catalog_manufacturers(canonical_name)",
        )
        .eq("id", productId)
        .maybeSingle();
      if (error) throw new Error(`catalog_products: ${error.message}`);
      if (!product || product.superseded_at) return null;

      const [attributes, variants, familyModels, byId] = await Promise.all([
        client
          .from("catalog_product_attributes")
          .select("attribute_key, value, value_es, trusted, conflict_values")
          .eq("product_id", productId),
        client
          .from("catalog_product_variants")
          .select("id, variant_name, sku, finish, color, size, configuration")
          .eq("product_id", productId)
          .order("variant_name")
          .limit(50),
        product.entity_level === "family"
          ? client
              .from("catalog_products")
              .select("id, canonical_model_name")
              .eq("family_product_id", productId)
              .is("superseded_at", null)
              .order("canonical_model_name")
              .limit(50)
          : Promise.resolve({ data: [], error: null }),
        categories(),
      ]);
      for (const result of [attributes, variants, familyModels]) {
        if (result.error) throw new Error(`catalog detail: ${result.error.message}`);
      }
      const manufacturer = Array.isArray(product.manufacturer) ? product.manufacturer[0] : product.manufacturer;
      return {
        id: product.id,
        manufacturer: manufacturer?.canonical_name ?? "",
        model: product.canonical_model_name,
        entity_level: product.entity_level,
        family_product_id: product.family_product_id,
        verification_status: product.verification_status,
        quality_status: product.quality_status,
        publish_ready: Boolean(product.publish_ready),
        detail_status: product.detail_status,
        missing_attributes: product.missing_attributes ?? [],
        untrusted_attributes: product.untrusted_attributes ?? [],
        variant_attributes: product.variant_attributes ?? [],
        category_path: categoryPath(byId, product.category_id),
        attributes: (attributes.data ?? []).map((row) => ({ ...row, conflict_values: row.conflict_values ?? [] })),
        variants: variants.data ?? [],
        family_models: (familyModels.data ?? []).map((row: { id: string; canonical_model_name: string }) => ({
          id: row.id,
          model: row.canonical_model_name,
        })),
      } satisfies CatalogProductDetail;
    },
  };
}

export function categoryPath(byId: Map<string, CatalogCategoryNode>, categoryId: string | null) {
  const path: CatalogCategoryNode[] = [];
  let current = categoryId ? byId.get(categoryId) : undefined;
  while (current && path.length < 8) {
    path.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return path;
}

function firstRow(data: unknown) {
  return (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
}

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const text = (value: unknown) => (typeof value === "string" ? value : null);
const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

export function normalizeLookupRow(row: Record<string, unknown>): CatalogLookupRow {
  return {
    product_id: String(row.product_id),
    manufacturer: String(row.manufacturer ?? ""),
    model: String(row.model ?? ""),
    category_id: text(row.category_id),
    category_label_es: text(row.category_label_es),
    entity_level: row.entity_level === "family" ? "family" : "model",
    introduction_year: num(row.introduction_year),
    discontinuation_year: num(row.discontinuation_year),
    verification_status: row.verification_status as CatalogLookupRow["verification_status"],
    quality_status: String(row.quality_status ?? ""),
    publish_ready: Boolean(row.publish_ready),
    confidence: Number(row.confidence ?? 0),
    match_type: String(row.match_type ?? ""),
    matched_text: text(row.matched_text),
    category_intent: text(row.category_intent),
    warning: text(row.warning),
    score: Number(row.score ?? 0),
  };
}

// catalog_match() always returns one row; a missing row is treated as "no candidate".
export function normalizeMatchRow(row: Record<string, unknown> | undefined): CatalogMatchRow {
  if (!row) return { ...emptyMatch(), reasons: ["no_candidate"] };
  return {
    decision: (row.decision as CatalogMatchRow["decision"]) ?? "INSUFFICIENT",
    tier: (row.tier as CatalogMatchRow["tier"]) ?? "INSUFFICIENT",
    reasons: list(row.reasons),
    product_id: text(row.product_id),
    manufacturer: text(row.manufacturer),
    model: text(row.model),
    category_id: text(row.category_id),
    category_label_es: text(row.category_label_es),
    entity_level: row.entity_level === "family" ? "family" : row.entity_level === "model" ? "model" : null,
    verification_status: (row.verification_status as CatalogMatchRow["verification_status"]) ?? null,
    quality_status: text(row.quality_status),
    publish_ready: row.publish_ready === null || row.publish_ready === undefined ? null : Boolean(row.publish_ready),
    match_type: text(row.match_type),
    matched_text: text(row.matched_text),
    category_intent: text(row.category_intent),
    warning: text(row.warning),
    score: num(row.score),
    runner_up_product_id: text(row.runner_up_product_id),
    runner_up_score: num(row.runner_up_score),
    brand_mentioned: Boolean(row.brand_mentioned),
  };
}

export function normalizeJevInputsRow(row: Record<string, unknown> | undefined): CatalogJevInputsRow {
  const match = normalizeMatchRow(row);
  return {
    decision: match.decision,
    tier: match.tier,
    reasons: match.reasons,
    score: match.score,
    match_type: match.match_type,
    warning: match.warning,
    brand_mentioned: match.brand_mentioned,
    product_id: match.product_id,
    manufacturer: match.manufacturer,
    model: match.model,
    category_id: match.category_id,
    entity_level: match.entity_level,
    verification_status: match.verification_status,
    publish_ready: match.publish_ready,
    detail_status: text(row?.detail_status),
    detailed: row?.detailed === null || row?.detailed === undefined ? null : Boolean(row.detailed),
    missing_attributes: row ? list(row.missing_attributes) : null,
    untrusted_attributes: row ? list(row.untrusted_attributes) : null,
    runner_up_product_id: match.runner_up_product_id,
    runner_up_score: match.runner_up_score,
  };
}

function emptyMatch(): CatalogMatchRow {
  return {
    decision: "INSUFFICIENT",
    tier: "INSUFFICIENT",
    reasons: [],
    product_id: null,
    manufacturer: null,
    model: null,
    category_id: null,
    category_label_es: null,
    entity_level: null,
    verification_status: null,
    quality_status: null,
    publish_ready: null,
    match_type: null,
    matched_text: null,
    category_intent: null,
    warning: null,
    score: null,
    runner_up_product_id: null,
    runner_up_score: null,
    brand_mentioned: false,
  };
}
