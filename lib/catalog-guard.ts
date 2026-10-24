// Emergency containment for optional catalog reads (docs/operations/catalog-recovery.md). With
// LARIA_CATALOG_ENRICHMENT_DISABLED=true every optional live-listing aggregate is skipped before it reaches the
// database: filter counts and price guidance (catalog_facets), empty-search rescue counts and suggestions, the brand
// and type counts behind menus, landings and the home tiles (catalog_brand_counts, catalog_type_counts) and the
// search box's suggestions (catalog_suggest). Listings, filters, sorting, pagination, search itself and the sell
// form's reference-catalog brands keep working. tests/catalog-recovery.test.cjs checks every caller.
export function catalogEnrichmentDisabled() {
  return process.env.LARIA_CATALOG_ENRICHMENT_DISABLED === "true";
}
