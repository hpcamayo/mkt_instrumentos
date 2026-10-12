-- CatalogProductDetail for one product, as the Supabase resolver builds it from the public catalog tables.
with recursive p as (
  select * from catalog_products where id = :'id'::uuid and superseded_at is null
), path as (
  select c.id, c.parent_id, c.label_es, c.laria_category, c.laria_instrument_type, 0 as lvl
  from catalog_categories c join p on c.id = p.category_id
  union all
  select c.id, c.parent_id, c.label_es, c.laria_category, c.laria_instrument_type, path.lvl + 1
  from catalog_categories c join path on c.id = path.parent_id
)
select json_build_object(
  'id', p.id, 'manufacturer', m.canonical_name, 'model', p.canonical_model_name, 'entity_level', p.entity_level,
  'family_product_id', p.family_product_id, 'verification_status', p.verification_status, 'quality_status', p.quality_status,
  'publish_ready', p.publish_ready, 'detail_status', p.detail_status, 'missing_attributes', p.missing_attributes,
  'untrusted_attributes', p.untrusted_attributes, 'variant_attributes', p.variant_attributes,
  'category_path', coalesce((select json_agg(json_build_object('id', id, 'parent_id', parent_id, 'label_es', label_es,
      'laria_category', laria_category, 'laria_instrument_type', laria_instrument_type) order by lvl desc) from path), '[]'),
  'attributes', coalesce((select json_agg(json_build_object('attribute_key', a.attribute_key, 'value', a.value, 'value_es', a.value_es,
      'trusted', a.trusted, 'conflict_values', a.conflict_values)) from catalog_product_attributes a where a.product_id = p.id), '[]'),
  'variants', coalesce((select json_agg(json_build_object('id', v.id, 'variant_name', v.variant_name, 'sku', v.sku, 'finish', v.finish,
      'color', v.color, 'size', v.size, 'configuration', v.configuration) order by v.variant_name)
      from catalog_product_variants v where v.product_id = p.id), '[]'),
  'family_models', coalesce((select json_agg(json_build_object('id', f.id, 'model', f.canonical_model_name) order by f.canonical_model_name)
      from catalog_products f where f.family_product_id = p.id and f.superseded_at is null), '[]'))
from p join catalog_manufacturers m on m.id = p.manufacturer_id;
