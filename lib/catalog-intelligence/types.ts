// Row shapes of the production catalog functions, copied from their latest migrations:
//   catalog_lookup       supabase/migrations/20261020120000_catalog_lookup_clean_candidates.sql
//   catalog_match        supabase/migrations/20261007120000_catalog_match_tiers.sql
//   catalog_jev_inputs   supabase/migrations/20261010120000_catalog_jev_inputs.sql
// Post-V1 prototype (docs/catalog-autofill-jev-prototype.md). Nothing in V1 reads these yet.

export type CatalogVerificationStatus = "VERIFIED" | "PROBABLE" | "UNVERIFIED" | "CONFLICTING" | "REJECTED";
export type CatalogDecision = "MATCH" | "FAMILY" | "CONFLICTING" | "INSUFFICIENT";
export type CatalogTier = "AUTO" | "REVIEW" | "INSUFFICIENT";

export type CatalogLookupRow = {
  product_id: string;
  manufacturer: string;
  model: string;
  category_id: string | null;
  category_label_es: string | null;
  entity_level: "model" | "family";
  introduction_year: number | null;
  discontinuation_year: number | null;
  verification_status: CatalogVerificationStatus;
  quality_status: string;
  publish_ready: boolean;
  confidence: number;
  match_type: string;
  matched_text: string | null;
  category_intent: string | null;
  warning: string | null;
  score: number;
};

export type CatalogMatchRow = {
  decision: CatalogDecision;
  tier: CatalogTier;
  reasons: string[];
  product_id: string | null;
  manufacturer: string | null;
  model: string | null;
  category_id: string | null;
  category_label_es: string | null;
  entity_level: "model" | "family" | null;
  verification_status: CatalogVerificationStatus | null;
  quality_status: string | null;
  publish_ready: boolean | null;
  match_type: string | null;
  matched_text: string | null;
  category_intent: string | null;
  warning: string | null;
  score: number | null;
  runner_up_product_id: string | null;
  runner_up_score: number | null;
  brand_mentioned: boolean;
};

export type CatalogJevInputsRow = {
  decision: CatalogDecision;
  tier: CatalogTier;
  reasons: string[];
  score: number | null;
  match_type: string | null;
  warning: string | null;
  brand_mentioned: boolean;
  product_id: string | null;
  manufacturer: string | null;
  model: string | null;
  category_id: string | null;
  entity_level: "model" | "family" | null;
  verification_status: CatalogVerificationStatus | null;
  publish_ready: boolean | null;
  detail_status: string | null;
  detailed: boolean | null;
  missing_attributes: string[] | null;
  untrusted_attributes: string[] | null;
  runner_up_product_id: string | null;
  runner_up_score: number | null;
};

// One catalog product with what autofill needs. Read from the public catalog tables (RLS: public read-only).
export type CatalogCategoryNode = {
  id: string;
  parent_id: string | null;
  label_es: string;
  laria_category: string | null;
  laria_instrument_type: string | null;
};

export type CatalogAttributeRow = {
  attribute_key: string;
  value: string;
  value_es: string | null;
  trusted: boolean;
  conflict_values: string[];
};

export type CatalogVariantRow = {
  id: string;
  variant_name: string;
  sku: string | null;
  finish: string | null;
  color: string | null;
  size: string | null;
  configuration: string | null;
};

export type CatalogProductDetail = {
  id: string;
  manufacturer: string;
  model: string;
  entity_level: "model" | "family";
  family_product_id: string | null;
  verification_status: CatalogVerificationStatus;
  quality_status: string;
  publish_ready: boolean;
  detail_status: string;
  missing_attributes: string[];
  untrusted_attributes: string[];
  variant_attributes: string[];
  // Root-first path of the product's category (empty when the product has none).
  category_path: CatalogCategoryNode[];
  attributes: CatalogAttributeRow[];
  variants: CatalogVariantRow[];
  // Models of a family entity (empty for a model).
  family_models: { id: string; model: string }[];
};

// What the rest of Laria needs from the catalog. The Supabase implementation calls the real RPCs; tests and the
// local benchmark plug in their own.
export type CatalogSource = {
  lookup(query: string, manufacturerHint: string | null, maxResults: number): Promise<CatalogLookupRow[]>;
  match(query: string, manufacturerHint: string | null): Promise<CatalogMatchRow>;
  jevInputs(query: string, manufacturerHint: string | null): Promise<CatalogJevInputsRow>;
  productDetail(productId: string): Promise<CatalogProductDetail | null>;
};
