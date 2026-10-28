# Benchmark results: fixture-smoke (SYNTHETIC, not Laria data; jit off)

## Matching (corpus)

| Metric | Value | Denominator |
| --- | ---: | ---: |
| Recall@1 / @3 / @5 (known, resolved model cases) | 92.6 / 96.1 / 97.7 % | 258 |
| Resolution accuracy (all judged cases) | 75.9 % | 311 |
| AUTO coverage on AUTO_OK cases | 73.2 % | 239 |
| Unsafe AUTO (forbidden or wrong product) | 11 | 311 |
| Unsafe AUTO rate on NO_AUTO/INSUFFICIENT cases | 15.3 % | 72 |
| AUTO on a wrong product | 0 | - |
| AUTO that cannot be judged (label unresolved) | 0 | - |
| Family / model confusion | 2 | 311 |
| Model cases whose label did not resolve (excluded) | 0 | - |
| Out-of-catalog tiers | {'AUTO': 6, 'INSUFFICIENT': 36, 'REVIEW': 3} | 45 |
| Conflict cases kept from AUTO | 8 | 18 |

### By origin

| Origin | Cases | R@1 | R@3 | Accuracy | Unsafe AUTO |
| --- | ---: | ---: | ---: | ---: | ---: |
| authored | 234 | 91.7 | 95.0 | 80.3 | 11 |
| perturbation | 77 | 94.8 | 98.7 | 62.3 | 0 |

### By category

| Category | Cases | Resolved model cases | R@1 | R@3 | Accuracy | AUTO coverage | Unsafe AUTO |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| amplifiers | 39 | 34 | 94.1 | 100.0 | 82.1 | 81.2 | 1 |
| audio interfaces | 32 | 26 | 88.5 | 96.2 | 81.2 | 73.9 | 0 |
| basses | 18 | 17 | 88.2 | 100.0 | 72.2 | 70.6 | 0 |
| cymbals | 21 | 18 | 61.1 | 72.2 | 52.4 | 33.3 | 0 |
| drums | 20 | 16 | 93.8 | 93.8 | 90.0 | 86.7 | 0 |
| guitars | 84 | 64 | 96.9 | 98.4 | 76.2 | 71.7 | 3 |
| microphones | 34 | 30 | 100.0 | 100.0 | 94.1 | 100.0 | 2 |
| pedals | 63 | 53 | 96.2 | 96.2 | 63.5 | 63.3 | 5 |

### Latency (ms, client-measured, includes network)

| Function | p50 | p95 | max | n |
| --- | ---: | ---: | ---: | ---: |
| lookup | 23.1 | 43.1 | 5424.6 | 311 |
| match | 23.9 | 44.9 | 4670.7 | 311 |
| jev | 23.9 | 43.8 | 4739.2 | 311 |

### Jev payload

Average 536.7 bytes, max 600.
Decision/tier pairs: {'MATCH/AUTO': 186, 'INSUFFICIENT/REVIEW': 23, 'INSUFFICIENT/INSUFFICIENT': 88, 'FAMILY/REVIEW': 7, 'MATCH/REVIEW': 4, 'CONFLICTING/REVIEW': 2, 'MATCH/INSUFFICIENT': 1}

## Identity resolution

121 of 121 corpus identities resolved to a product; 0 resolved to more than one product.

Unresolved: none

Ambiguous: none

## Integrity checks

Defect checks count problem rows (0 = clean). `permissible` checks are distributions: their count is a number of table rows, not of problems.

| Check | Kind | Severity | Rows |
| --- | --- | --- | ---: |
| snapshot: Catalog snapshot | permissible | S4 | 1 |
| status_distribution: Verification / quality / publish_ready / detail status | permissible | S4 | 5 |
| dup_key_cross_domain: Same manufacturer + model key in more than one identity domain | risk | S2 | 0 |
| dup_key_generic_suffix: Model keys equal after dropping a generic trailing word (guitar, pedal, amp ...) | error | S2 | 0 |
| dup_review_queue: Duplicate-review pairs still pending, by kind | ambiguous | S3 | 0 |
| alias_collision_cross_brand: Alias keys shared by products of different manufacturers | ambiguous | S2 | 4 |
| alias_collision_same_brand: Alias keys shared by several products of one manufacturer | risk | S2 | 1 |
| alias_ambiguity_flag_wrong: Shared alias key not flagged is_ambiguous (or flagged but unique) | error | S1 | 1 |
| alias_short: Alias keys of 3 characters or less (exact-match risk: 'c1', 'm2', 'ds1') | risk | S3 | 2 |
| alias_is_category_word: Product aliases that are category / Spanish marketplace words | error | S1 | 0 |
| alias_type_mix: Alias types (store-title aliases are weaker evidence) | permissible | S4 | 5 |
| mfr_alias_collision: Manufacturer alias keys that name more than one manufacturer | error | S1 | 1 |
| mfr_alias_is_word: Manufacturer aliases that are ordinary words or model-like codes (<= 3 chars or Spanish words) | risk | S2 | 10 |
| mfr_parent_brands: Sub-brands with a parent manufacturer (Squier/Fender, Epiphone/Gibson, LTD/ESP) | permissible | S4 | 2 |
| mfr_uncurated_with_products: Manufacturers with products that are not curated | incomplete | S3 | 0 |
| family_link_broken: Model linked to a family entity that is not a family / of another brand / superseded | error | S1 | 0 |
| family_without_models: Family entities that no live model points to | risk | S2 | 0 |
| family_detailed: Family entities with detail_status detailed/complete or publish_ready (a line is not one product) | error | S1 | 1 |
| model_named_like_family: Model-level products whose name is a bare line name with no model token (no digit, <= 2 words) | risk | S2 | 2 |
| variant_sku_collision: Variant SKU keys shared by different products | error | S1 | 0 |
| variant_gtin_collision: GTINs shared by different products | error | S1 | 0 |
| variant_attrs_without_variants: variant_attributes listed but the product has no variants to decide them | incomplete | S2 | 6 |
| variant_attr_also_product_level: An attribute both listed in variant_attributes and stored at product level | error | S1 | 1 |
| variant_size_as_model: Products whose name carries a size (cymbals/drums) — size-level granularity | permissible | S4 | 8 |
| category_missing: Live model products without a category or with a weak category | incomplete | S2 | 1 |
| category_unmapped: Products in categories with no Laria marketplace mapping | incomplete | S3 | 0 |
| category_domain_mismatch: Cross-tab of identity domain x category group (read the off-diagonal rows by hand) | permissible | S4 | 9 |
| category_name_contradiction: Model name contains a category word of another Laria category | error | S2 | 1 |
| attr_conflict: Resolved attributes carrying conflicting values from strong sources | ambiguous | S2 | 1 |
| attr_trusted_with_conflict: Attributes marked trusted although a strong source disagrees | error | S1 | 1 |
| attr_provenance: Attribute provenance and trust (default / name / category are inferred, not stated) | permissible | S4 | 2 |
| attr_missing_required: Required attributes missing, by attribute group | incomplete | S3 | 6 |
| attr_untrusted_required: Required attributes untrusted, by attribute group | incomplete | S2 | 0 |
| attr_status_inconsistent: detail_status inconsistent with missing/untrusted lists | error | S1 | 0 |
| attr_value_es_missing: Attributes without a Spanish display value, or with an untranslated enum code | incomplete | S2 | 2 |
| attr_numeric_outliers: Numeric attribute values outside plausible ranges | error | S2 | 0 |
| norm_parity: normalized_model_name / model_key differ from catalog_normalize / catalog_compact of the name | error | S2 | 0 |
| norm_brand_in_model: Model name repeats the brand ('Fender Fender Stratocaster') | error | S3 | 0 |
| norm_noise_in_model: Model names carrying seller / colour / condition words | error | S2 | 1 |
| norm_short_key: Model keys of 2 characters or less / digits only | risk | S2 | 2 |
| confusable_one_char: Same-brand model keys that differ only by a trailing character (dd3 / dd3t, pac112v / pac112j) | ambiguous | S2 | 9 |
| confusable_prefix: Same-brand model key that is a strict prefix of another (sm7 / sm7b, katana50 / katana50mk2) | ambiguous | S2 | 10 |
| confusable_cross_brand_key: Same model key under different brands (Gibson / Epiphone 'Les Paul Standard 50s') | ambiguous | S2 | 2 |

## Issues by brand (top 40)

```
[
{
"brand": "Gibson",
"products": 4,
"missing_required": 0,
"untrusted_required": 0,
"attr_conflicts": 0,
"shared_aliases": 4,
"no_category": 0,
"quality_flagged": 0,
"family_detailed": 0
},
{
"brand": "Epiphone",
"products": 3,
"missing_required": 0,
"untrusted_required": 0,
"attr_conflicts": 0,
"shared_aliases": 4,
"no_category": 0,
"quality_flagged": 0,
"family_detailed": 0
},
{
"brand": "Squier",
"products": 5,
"missing_required": 3,
"untrusted_required": 0,
"attr_conflicts": 0,
"shared_aliases": 0,
"no_category": 0,
"quality_flagged": 0,
"family_detailed": 0
},
{
"brand": "Boss",
"products": 21,
"missing_required": 2,
"untrusted_required": 0,
"attr_conflicts": 0,
"shared_aliases": 0,
"no_category": 0,
"quality_flagged": 0,
"family_detailed": 1
},
{
"brand": "Electro-Harmonix",
"products": 3,
"missing_required": 2,
"untrusted_required": 0,
"attr_conflicts": 0,
"shared_aliases": 0,
"no_category": 0,
"quality_flagged": 0,
"family_detailed": 0
},
{
"brand": "Shure",
"products": 6,
"missing_required": 0,
"untrusted_required": 0,
"attr_conflicts": 1,
"shared_aliases": 0,
"no_category": 0,
"quality_flagged": 0,
"family_detailed": 0
},
{
"brand": "Yamaha",
"products": 9,
"missing_required": 1,
"untrusted_required": 0,
"attr_conflicts": 0,
"shared_aliases": 0,
"no_category": 0,
"quality_flagged": 0,
"family_detailed": 0
},
{
"brand": "MXR",
"products": 1,
"missing_required": 1,
"untrusted_required": 0,
"attr_conflicts": 0,
"shared_aliases": 0,
"no_category": 0,
"quality_flagged": 0,
"family_detailed": 0
},
{
"brand": "Fender",
"products": 22,
"missing_required": 1,
"untrusted_required": 0,
"attr_conflicts": 0,
"shared_aliases": 0,
"no_category": 0,
"quality_flagged": 0,
"family_detailed": 0
},
{
"brand": "Jackson",
"products": 1,
"missing_required": 1,
"untrusted_required": 0,
"attr_conflicts": 0,
"shared_aliases": 0,
"no_category": 0,
"quality_flagged": 0,
"family_detailed": 0
},
{
"brand": "Gretsch",
"products": 1,
"missing_required": 1,
"untrusted_required": 0,
"attr_conflicts": 0,
"shared_aliases": 0,
"no_category": 0,
"quality_flagged": 0,
"family_detailed": 0
},
{
"brand": "Dunlop",
"products": 1,
"missing_required": 1,
"untrusted_required": 0,
"attr_conflicts": 0,
"shared_aliases": 0,
"no_category": 0,
"quality_flagged": 0,
"family_detailed": 0
},
{
"brand": "PRS",
"products": 1,
"missing_required": 1,
"untrusted_required": 0,
"attr_conflicts": 0,
"shared_aliases": 0,
"no_category": 0,
"quality_flagged": 0,
"family_detailed": 0
},
{
"brand": "Ampeg",
"products": 1,
"missing_required": 1,
"untrusted_required": 0,
"attr_conflicts": 0,
"shared_aliases": 0,
"no_category": 0,
"quality_flagged": 0,
"family_detailed": 0
}
]
```
