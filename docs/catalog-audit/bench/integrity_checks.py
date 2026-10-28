"""Read-only data integrity checks for the canonical catalog (catalog_* tables).

Every check is one bounded SELECT. `kind` says what a hit means, so a missing value is not reported as a defect:
  error       a genuine data error (the catalog contradicts itself)
  incomplete  information is missing; the product is usable but not detailed
  ambiguous   a legitimate ambiguity the matcher must handle (not a defect to repair)
  permissible a known, allowed pattern (variants, aliases) counted so its size is known
  risk        not wrong by itself, but a likely false match or unsafe autofill

`severity` is the auditor's default for a hit (S1 blocks AUTO / autofill, S2 needs a guardrail, S3 data hygiene,
S4 informational). Each check returns `n` (the count) and up to 15 sample rows; `by_brand` checks return a per-brand count.
"""

CHECKS = [
    # ------------------------------------------------------------------ snapshot
    ("snapshot", "Catalog snapshot", "permissible", "S4", """
select (select count(*) from catalog_products) as products,
       (select count(*) from catalog_products where superseded_at is null) as live_products,
       (select count(*) from catalog_products where entity_level = 'family') as family_entities,
       (select count(distinct manufacturer_id) from catalog_products) as brands_with_products,
       (select count(*) from catalog_manufacturers) as manufacturers,
       (select count(*) from catalog_product_aliases) as aliases,
       (select count(*) from catalog_product_variants) as variants,
       (select count(*) from catalog_product_attributes) as attributes,
       (select count(*) from catalog_categories) as categories,
       (select count(*) from catalog_lookup_terms) as lookup_terms,
       (select obj_description('public.catalog_products'::regclass)) as build_comment
"""),
    ("status_distribution", "Verification / quality / publish_ready / detail status", "permissible", "S4", """
select verification_status::text, quality_status, publish_ready, entity_level, detail_status, count(*) as n
from catalog_products where superseded_at is null
group by 1, 2, 3, 4, 5 order by n desc
"""),
    # ------------------------------------------------------------------ duplicates
    ("dup_key_cross_domain", "Same manufacturer + model key in more than one identity domain", "risk", "S2", """
select m.canonical_name as brand, p.model_key, array_agg(distinct p.identity_domain) as domains,
       array_agg(p.canonical_model_name) as names, count(*) as n
from catalog_products p join catalog_manufacturers m on m.id = p.manufacturer_id
where p.superseded_at is null
group by m.canonical_name, p.model_key having count(*) > 1 order by n desc
"""),
    ("dup_key_generic_suffix", "Model keys equal after dropping a generic trailing word (guitar, pedal, amp ...)", "error", "S2", """
with k as (
  select p.id, p.manufacturer_id, p.canonical_model_name, p.model_key,
         regexp_replace(p.model_key, '(guitar|guitarra|bass|bajo|pedal|amplifier|amp|combo|microphone|mic|series|kit|set|cymbal|crash)$', '') as base
  from catalog_products p where p.superseded_at is null and p.entity_level = 'model')
select m.canonical_name as brand, k.base, array_agg(k.canonical_model_name order by k.canonical_model_name) as names, count(*) as n
from k join catalog_manufacturers m on m.id = k.manufacturer_id
where length(k.base) >= 3
group by m.canonical_name, k.base having count(distinct k.model_key) > 1 order by n desc
"""),
    ("dup_review_queue", "Duplicate-review pairs still pending, by kind", "ambiguous", "S3", """
select coalesce(kind, '?') as kind, status::text, count(*) as n
from catalog_review_candidates group by 1, 2 order by n desc
"""),
    # ------------------------------------------------------------------ aliases
    ("alias_collision_cross_brand", "Alias keys shared by products of different manufacturers", "ambiguous", "S2", """
select a.alias_key, count(distinct p.manufacturer_id) as brands, count(distinct a.product_id) as products,
       bool_and(a.is_ambiguous) as all_flagged, (array_agg(distinct m.canonical_name))[1:6] as brand_sample
from catalog_product_aliases a join catalog_products p on p.id = a.product_id and p.superseded_at is null
join catalog_manufacturers m on m.id = p.manufacturer_id
where length(a.alias_key) >= 3
group by a.alias_key having count(distinct p.manufacturer_id) > 1 order by products desc
"""),
    ("alias_collision_same_brand", "Alias keys shared by several products of one manufacturer", "risk", "S2", """
select m.canonical_name as brand, a.alias_key, count(distinct a.product_id) as products, bool_and(a.is_ambiguous) as all_flagged,
       (array_agg(distinct p.canonical_model_name))[1:6] as names
from catalog_product_aliases a join catalog_products p on p.id = a.product_id and p.superseded_at is null
join catalog_manufacturers m on m.id = p.manufacturer_id
group by m.canonical_name, a.alias_key having count(distinct a.product_id) > 1 order by products desc
"""),
    ("alias_ambiguity_flag_wrong", "Shared alias key not flagged is_ambiguous (or flagged but unique)", "error", "S1", """
with s as (select alias_key, count(distinct product_id) as np from catalog_product_aliases group by alias_key)
select case when s.np > 1 then 'shared_not_flagged' else 'unique_but_flagged' end as problem, count(*) as n,
       (array_agg(a.alias order by a.alias))[1:10] as sample
from catalog_product_aliases a join s using (alias_key)
where (s.np > 1 and not a.is_ambiguous) or (s.np = 1 and a.is_ambiguous)
group by 1
"""),
    ("alias_short", "Alias keys of 3 characters or less (exact-match risk: 'c1', 'm2', 'ds1')", "risk", "S3", """
select length(a.alias_key) as key_len, count(*) as n, (array_agg(distinct a.alias))[1:15] as sample
from catalog_product_aliases a join catalog_products p on p.id = a.product_id and p.superseded_at is null
where length(a.alias_key) <= 3 group by 1 order by 1
"""),
    ("alias_is_category_word", "Product aliases that are category / Spanish marketplace words", "error", "S1", """
select a.alias, a.alias_type::text, count(distinct a.product_id) as products
from catalog_product_aliases a join catalog_category_terms t on t.term = a.normalized_alias
group by 1, 2 order by products desc
"""),
    ("alias_type_mix", "Alias types (store-title aliases are weaker evidence)", "permissible", "S4", """
select alias_type::text, (coalesce(source_id, '') like 'retail\\_%') as retail_source, count(*) as n,
       round(avg(confidence), 3) as avg_conf
from catalog_product_aliases group by 1, 2 order by n desc
"""),
    # ------------------------------------------------------------------ manufacturers
    ("mfr_alias_collision", "Manufacturer alias keys that name more than one manufacturer", "error", "S1", """
select alias_key, count(*) as n, array_agg(m.canonical_name) as brands
from catalog_manufacturer_aliases ma join catalog_manufacturers m on m.id = ma.manufacturer_id
group by alias_key having count(*) > 1 order by n desc
"""),
    ("mfr_alias_is_word", "Manufacturer aliases that are ordinary words or model-like codes (<= 3 chars or Spanish words)", "risk", "S2", """
select ma.alias, m.canonical_name, (select count(*) from catalog_products p where p.manufacturer_id = m.id) as products
from catalog_manufacturer_aliases ma join catalog_manufacturers m on m.id = ma.manufacturer_id
where length(ma.alias_key) <= 3
   or ma.alias_key in ('vintage', 'classic', 'custom', 'standard', 'studio', 'pro', 'audio', 'music', 'sound', 'bass',
                       'guitar', 'drum', 'drums', 'tone', 'mono', 'gator', 'nord', 'tama', 'roadrunner', 'sonor', 'mars',
                       'electro', 'digital', 'magic', 'royal', 'stage', 'origin', 'universal')
order by products desc
"""),
    ("mfr_parent_brands", "Sub-brands with a parent manufacturer (Squier/Fender, Epiphone/Gibson, LTD/ESP)", "permissible", "S4", """
select c.canonical_name as brand, p.canonical_name as parent,
       (select count(*) from catalog_products x where x.manufacturer_id = c.id) as products
from catalog_manufacturers c join catalog_manufacturers p on p.id = c.parent_id order by products desc
"""),
    ("mfr_uncurated_with_products", "Manufacturers with products that are not curated", "incomplete", "S3", """
select m.canonical_name, count(p.id) as products
from catalog_manufacturers m join catalog_products p on p.manufacturer_id = m.id and p.superseded_at is null
where not m.is_curated group by 1 order by products desc
"""),
    # ------------------------------------------------------------------ family / model
    ("family_link_broken", "Model linked to a family entity that is not a family / of another brand / superseded", "error", "S1", """
select case when f.id is null then 'missing' when f.entity_level <> 'family' then 'target_not_family'
            when f.manufacturer_id <> p.manufacturer_id then 'other_brand'
            when f.superseded_at is not null then 'superseded' end as problem, count(*) as n,
       (array_agg(p.canonical_model_name || ' -> ' || coalesce(f.canonical_model_name, '?')))[1:10] as sample
from catalog_products p left join catalog_products f on f.id = p.family_product_id
where p.family_product_id is not null and p.superseded_at is null
  and (f.id is null or f.entity_level <> 'family' or f.manufacturer_id <> p.manufacturer_id or f.superseded_at is not null)
group by 1
"""),
    ("family_without_models", "Family entities that no live model points to", "risk", "S2", """
select m.canonical_name as brand, f.canonical_model_name as family, f.entity_level_source
from catalog_products f join catalog_manufacturers m on m.id = f.manufacturer_id
where f.entity_level = 'family' and f.superseded_at is null
  and not exists (select 1 from catalog_products p where p.family_product_id = f.id and p.superseded_at is null)
order by 1, 2
"""),
    ("family_detailed", "Family entities with detail_status detailed/complete or publish_ready (a line is not one product)", "error", "S1", """
select detail_status, publish_ready, count(*) as n, (array_agg(canonical_model_name))[1:10] as sample
from catalog_products where entity_level = 'family' and superseded_at is null
  and (detail_status in ('detailed', 'complete') or publish_ready) group by 1, 2
"""),
    ("model_named_like_family", "Model-level products whose name is a bare line name with no model token (no digit, <= 2 words)", "risk", "S2", """
select m.canonical_name as brand, p.canonical_model_name, p.category_id
from catalog_products p join catalog_manufacturers m on m.id = p.manufacturer_id
where p.superseded_at is null and p.entity_level = 'model' and p.model_code is null
  and p.canonical_model_name !~ '[0-9]' and array_length(string_to_array(p.normalized_model_name, ' '), 1) <= 2
  and exists (select 1 from catalog_products o where o.manufacturer_id = p.manufacturer_id and o.id <> p.id
              and o.superseded_at is null and o.normalized_model_name like p.normalized_model_name || ' %')
order by 1, 2
"""),
    # ------------------------------------------------------------------ variants
    ("variant_sku_collision", "Variant SKU keys shared by different products", "error", "S1", """
select v.sku_key, count(distinct v.product_id) as products, (array_agg(distinct p.canonical_model_name))[1:6] as names
from catalog_product_variants v join catalog_products p on p.id = v.product_id and p.superseded_at is null
where v.sku_key is not null group by 1 having count(distinct v.product_id) > 1 order by products desc
"""),
    ("variant_gtin_collision", "GTINs shared by different products", "error", "S1", """
select v.gtin, count(distinct v.product_id) as products from catalog_product_variants v
where v.gtin is not null group by 1 having count(distinct v.product_id) > 1 order by products desc
"""),
    ("variant_attrs_without_variants", "variant_attributes listed but the product has no variants to decide them", "incomplete", "S2", """
select p.detail_group, unnest(p.variant_attributes) as attribute, count(*) as n
from catalog_products p
where p.superseded_at is null and cardinality(p.variant_attributes) > 0
  and not exists (select 1 from catalog_product_variants v where v.product_id = p.id)
group by 1, 2 order by n desc
"""),
    ("variant_attr_also_product_level", "An attribute both listed in variant_attributes and stored at product level", "error", "S1", """
select a.attribute_key, count(*) as n
from catalog_product_attributes a join catalog_products p on p.id = a.product_id
where a.attribute_key = any(p.variant_attributes) group by 1 order by n desc
"""),
    ("variant_size_as_model", "Products whose name carries a size (cymbals/drums) — size-level granularity", "permissible", "S4", """
select split_part(coalesce(p.category_id, '?'), '.', 1) || '.' || split_part(coalesce(p.category_id, '?'), '.', 2) as cat,
       count(*) filter (where p.normalized_model_name ~ '\\m[0-9]{1,2}in\\M') as with_size_in_name,
       count(*) as products
from catalog_products p where p.superseded_at is null group by 1 order by products desc
"""),
    # ------------------------------------------------------------------ categories
    ("category_missing", "Live model products without a category or with a weak category", "incomplete", "S2", """
select coalesce(category_confidence, 'null') as category_confidence, (category_id is null) as no_category, count(*) as n
from catalog_products where superseded_at is null and entity_level = 'model'
  and (category_id is null or category_confidence is null or category_confidence = 'weak')
group by 1, 2 order by n desc
"""),
    ("category_unmapped", "Products in categories with no Laria marketplace mapping", "incomplete", "S3", """
select c.id as category_id, c.label_es, count(p.id) as products
from catalog_products p join catalog_categories c on c.id = p.category_id
where p.superseded_at is null and c.laria_category is null group by 1, 2 order by products desc
"""),
    ("category_domain_mismatch", "Cross-tab of identity domain x category group (read the off-diagonal rows by hand)", "permissible", "S4", """
select p.identity_domain, split_part(p.category_id, '.', 1) || '.' || split_part(p.category_id, '.', 2) as cat_group,
       count(*) as n, (array_agg(p.canonical_model_name))[1:8] as sample
from catalog_products p where p.superseded_at is null and p.category_id is not null and p.identity_domain is not null
group by 1, 2 order by 1, n desc
"""),
    ("category_name_contradiction", "Model name contains a category word of another Laria category", "error", "S2", """
select c.laria_category, p.canonical_model_name, m.canonical_name as brand
from catalog_products p join catalog_categories c on c.id = p.category_id
join catalog_manufacturers m on m.id = p.manufacturer_id
where p.superseded_at is null and (
   (c.laria_category = 'guitars' and p.normalized_model_name ~ '\\m(bass|bajo)\\M')
or (c.laria_category = 'basses' and p.normalized_model_name ~ '\\m(guitar|guitarra)\\M' and p.normalized_model_name !~ '\\mbass\\M')
or (c.laria_category = 'cymbals' and p.normalized_model_name ~ '\\m(snare|tom|kick|pedal)\\M')
or (c.laria_category = 'pedals' and p.normalized_model_name ~ '\\m(combo|head|cabinet|microphone)\\M')
or (c.laria_category = 'microphones' and p.normalized_model_name ~ '\\m(pedal|amp|interface)\\M'))
order by 1, 3
"""),
    # ------------------------------------------------------------------ attributes
    ("attr_conflict", "Resolved attributes carrying conflicting values from strong sources", "ambiguous", "S2", """
select a.attribute_key, count(*) as n, count(*) filter (where a.trusted) as trusted_despite_conflict
from catalog_product_attributes a where cardinality(a.conflict_values) > 0 group by 1 order by n desc
"""),
    ("attr_trusted_with_conflict", "Attributes marked trusted although a strong source disagrees", "error", "S1", """
select a.attribute_key, a.value, a.conflict_values, p.canonical_model_name
from catalog_product_attributes a join catalog_products p on p.id = a.product_id
where a.trusted and cardinality(a.conflict_values) > 0 order by 1
"""),
    ("attr_provenance", "Attribute provenance and trust (default / name / category are inferred, not stated)", "permissible", "S4", """
select a.provenance, a.trusted, count(*) as n, round(avg(a.weight), 3) as avg_weight
from catalog_product_attributes a group by 1, 2 order by n desc
"""),
    ("attr_missing_required", "Required attributes missing, by attribute group", "incomplete", "S3", """
select p.detail_group, x.attribute, count(*) as n
from catalog_products p cross join lateral unnest(p.missing_attributes) x(attribute)
where p.superseded_at is null group by 1, 2 order by 1, n desc
"""),
    ("attr_untrusted_required", "Required attributes untrusted, by attribute group", "incomplete", "S2", """
select p.detail_group, x.attribute, count(*) as n
from catalog_products p cross join lateral unnest(p.untrusted_attributes) x(attribute)
where p.superseded_at is null group by 1, 2 order by 1, n desc
"""),
    ("attr_status_inconsistent", "detail_status inconsistent with missing/untrusted lists", "error", "S1", """
select detail_status, (cardinality(missing_attributes) > 0) as has_missing, (cardinality(untrusted_attributes) > 0) as has_untrusted,
       publish_ready, count(*) as n
from catalog_products where superseded_at is null
  and ((detail_status = 'detailed' and (cardinality(missing_attributes) > 0 or cardinality(untrusted_attributes) > 0 or not publish_ready))
    or (entity_level = 'model' and detail_status = 'none' and cardinality(missing_attributes) = 0 and detail_group is not null))
group by 1, 2, 3, 4
"""),
    ("attr_value_es_missing", "Attributes without a Spanish display value, or with an untranslated enum code", "incomplete", "S2", """
select a.attribute_key,
       count(*) filter (where a.value_es is null or btrim(a.value_es) = '') as no_value_es,
       count(*) filter (where a.value_es ~ '^[a-z0-9]+(_[a-z0-9]+)+$') as code_as_value_es,
       count(*) filter (where a.value_es = a.value and a.value ~ '[a-z]' and a.value !~ '^[0-9]') as same_as_value,
       count(*) as n
from catalog_product_attributes a group by 1
having count(*) filter (where a.value_es is null or btrim(a.value_es) = '' or a.value_es ~ '^[a-z0-9]+(_[a-z0-9]+)+$') > 0
order by no_value_es desc, n desc
"""),
    ("attr_numeric_outliers", "Numeric attribute values outside plausible ranges", "error", "S2", """
select a.attribute_key, a.value, a.unit, count(*) as n
from catalog_product_attributes a
where a.value_num is not null and (
   (a.attribute_key ~ 'string' and (a.value_num < 1 or a.value_num > 18))
or (a.attribute_key ~ '(size|diameter)' and (a.value_num < 4 or a.value_num > 30))
or (a.attribute_key ~ 'fret' and (a.value_num < 12 or a.value_num > 36))
or (a.attribute_key ~ '(power|watt)' and (a.value_num <= 0 or a.value_num > 3000))
or (a.attribute_key ~ '(input|channel)' and (a.value_num < 1 or a.value_num > 128)))
group by 1, 2, 3 order by n desc
"""),
    # ------------------------------------------------------------------ normalization
    ("norm_parity", "normalized_model_name / model_key differ from catalog_normalize / catalog_compact of the name", "error", "S2", """
select canonical_model_name, normalized_model_name, catalog_normalize(canonical_model_name) as expected_normalized,
       model_key, catalog_compact(canonical_model_name) as expected_key
from catalog_products where superseded_at is null
  and (normalized_model_name <> catalog_normalize(canonical_model_name) or model_key <> catalog_compact(canonical_model_name))
"""),
    ("norm_brand_in_model", "Model name repeats the brand ('Fender Fender Stratocaster')", "error", "S3", """
select m.canonical_name as brand, p.canonical_model_name
from catalog_products p join catalog_manufacturers m on m.id = p.manufacturer_id
where p.superseded_at is null and p.normalized_model_name like m.normalized_name || ' %' order by 1, 2
"""),
    ("norm_noise_in_model", "Model names carrying seller / colour / condition words", "error", "S2", """
select m.canonical_name as brand, p.canonical_model_name
from catalog_products p join catalog_manufacturers m on m.id = p.manufacturer_id
where p.superseded_at is null and p.normalized_model_name ~
  '\\m(nuevo|usado|oferta|original|sellado|negro|negra|blanco|blanca|rojo|sunburst|black|white|red|color|incluye|con|regalo|garantia)\\M'
order by 1, 2
"""),
    ("norm_short_key", "Model keys of 2 characters or less / digits only", "risk", "S2", """
select m.canonical_name as brand, p.canonical_model_name, p.model_key
from catalog_products p join catalog_manufacturers m on m.id = p.manufacturer_id
where p.superseded_at is null and (length(p.model_key) <= 2 or p.model_key ~ '^[0-9]+$') order by 1, 2
"""),
    # ------------------------------------------------------------------ confusable models
    ("confusable_one_char", "Same-brand model keys that differ only by a trailing character (dd3 / dd3t, pac112v / pac112j)", "ambiguous", "S2", """
select m.canonical_name as brand, a.canonical_model_name as model_a, b.canonical_model_name as model_b
from catalog_products a join catalog_products b
  on b.manufacturer_id = a.manufacturer_id and b.id > a.id and b.superseded_at is null
 and left(a.model_key, length(a.model_key) - 1) = left(b.model_key, length(b.model_key) - 1)
 and length(a.model_key) = length(b.model_key) and a.model_key ~ '[0-9]'
join catalog_manufacturers m on m.id = a.manufacturer_id
where a.superseded_at is null and a.entity_level = 'model' and b.entity_level = 'model' order by 1, 2
"""),
    ("confusable_prefix", "Same-brand model key that is a strict prefix of another (sm7 / sm7b, katana50 / katana50mk2)", "ambiguous", "S2", """
select m.canonical_name as brand, a.canonical_model_name as shorter, b.canonical_model_name as longer
from catalog_products a join catalog_products b
  on b.manufacturer_id = a.manufacturer_id and b.id <> a.id and b.superseded_at is null
 and b.model_key like a.model_key || '%' and length(b.model_key) - length(a.model_key) between 1 and 4
join catalog_manufacturers m on m.id = a.manufacturer_id
where a.superseded_at is null and a.entity_level = 'model' and b.entity_level = 'model' and length(a.model_key) >= 3
order by 1, 2
"""),
    ("confusable_cross_brand_key", "Same model key under different brands (Gibson / Epiphone 'Les Paul Standard 50s')", "ambiguous", "S2", """
select p.model_key, count(distinct p.manufacturer_id) as brands, (array_agg(distinct m.canonical_name))[1:6] as brand_sample
from catalog_products p join catalog_manufacturers m on m.id = p.manufacturer_id
where p.superseded_at is null and length(p.model_key) >= 3
group by 1 having count(distinct p.manufacturer_id) > 1 order by brands desc
"""),
]

# per-brand rollup of the checks that name a product (for "quantify by brand")
BY_BRAND = """
with issues as (
  select p.manufacturer_id, 'family_detailed' as check_id from catalog_products p
   where p.entity_level = 'family' and p.superseded_at is null and (p.detail_status in ('detailed', 'complete') or p.publish_ready)
  union all
  select p.manufacturer_id, 'missing_required' from catalog_products p
   where p.superseded_at is null and cardinality(p.missing_attributes) > 0
  union all
  select p.manufacturer_id, 'untrusted_required' from catalog_products p
   where p.superseded_at is null and cardinality(p.untrusted_attributes) > 0
  union all
  select p.manufacturer_id, 'no_category' from catalog_products p
   where p.superseded_at is null and p.entity_level = 'model' and p.category_id is null
  union all
  select p.manufacturer_id, 'needs_review_or_quarantined' from catalog_products p
   where p.superseded_at is null and p.quality_status <> 'ok'
  union all
  select p.manufacturer_id, 'attr_conflict' from catalog_products p
   join catalog_product_attributes a on a.product_id = p.id where cardinality(a.conflict_values) > 0
  union all
  select p.manufacturer_id, 'shared_alias' from catalog_products p
   join catalog_product_aliases a on a.product_id = p.id and a.is_ambiguous
)
select m.canonical_name as brand, (select count(*) from catalog_products x where x.manufacturer_id = m.id and x.superseded_at is null) as products,
       count(*) filter (where check_id = 'missing_required') as missing_required,
       count(*) filter (where check_id = 'untrusted_required') as untrusted_required,
       count(*) filter (where check_id = 'attr_conflict') as attr_conflicts,
       count(*) filter (where check_id = 'shared_alias') as shared_aliases,
       count(*) filter (where check_id = 'no_category') as no_category,
       count(*) filter (where check_id = 'needs_review_or_quarantined') as quality_flagged,
       count(*) filter (where check_id = 'family_detailed') as family_detailed
from issues i join catalog_manufacturers m on m.id = i.manufacturer_id
group by m.id, m.canonical_name order by count(*) desc limit 40
"""

# autofill readiness: per attribute group x attribute
AUTOFILL = """
with g as (
  select coalesce(detail_group, '-') as detail_group, count(*) as group_products
  from catalog_products where superseded_at is null and entity_level = 'model' group by 1),
va as (
  select coalesce(detail_group, '-') as detail_group, x.attribute_key, count(*) as variant_dependent
  from catalog_products, unnest(variant_attributes) x(attribute_key) where superseded_at is null group by 1, 2),
a as (
  select coalesce(p.detail_group, '-') as detail_group, a.attribute_key,
         count(*) as products_with_value,
         count(*) filter (where a.trusted) as trusted,
         count(*) filter (where a.trusted and cardinality(a.conflict_values) = 0 and a.provenance = 'spec') as trusted_spec,
         count(*) filter (where a.provenance = 'default') as from_default,
         count(*) filter (where a.provenance = 'name') as from_name,
         count(*) filter (where a.provenance = 'category') as from_category,
         count(*) filter (where cardinality(a.conflict_values) > 0) as conflicting,
         count(*) filter (where a.value_es is null) as no_value_es
  from catalog_product_attributes a join catalog_products p on p.id = a.product_id
  where p.superseded_at is null and p.entity_level = 'model' group by 1, 2)
select coalesce(a.detail_group, va.detail_group) as detail_group, coalesce(a.attribute_key, va.attribute_key) as attribute_key,
       g.group_products, coalesce(a.products_with_value, 0) as products_with_value, a.trusted, a.trusted_spec, a.from_default,
       a.from_name, a.from_category, a.conflicting, a.no_value_es, coalesce(va.variant_dependent, 0) as variant_dependent,
       round(100.0 * coalesce(a.trusted_spec, 0) / nullif(g.group_products, 0), 1) as safe_prefill_pct
from a full join va on va.detail_group = a.detail_group and va.attribute_key = a.attribute_key
left join g on g.detail_group = coalesce(a.detail_group, va.detail_group)
order by 1, 2
"""
