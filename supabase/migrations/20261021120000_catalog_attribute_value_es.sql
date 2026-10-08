-- Step 3.17 of the canonical catalog (catalog/docs/roadmap.md): Spanish display values for resolved attributes (3.17c)
-- and the attributes that depend on the variant (3.17d).
--
-- The site and the store listings are Spanish, and listings will be autofilled from a matched catalog product.
-- catalog_product_attributes.value stays canonical (enum codes such as 'bolt_on', the maker's English text such as
-- 'Solid Sitka Spruce') for matching, Jev and navigation; value_es is the text a person reads ('Atornillado',
-- 'Abeto Sitka macizo'), written by the ETL from catalog/config/attribute_labels_es.yaml (src/laria_catalog/spanish.py).
-- Regenerated on every load, like the rest of the table. Local only until production is Henri's call.
--
-- Depends on 20260929120000_catalog_attributes.sql.

alter table public.catalog_product_attributes
  add column if not exists value_es text;

comment on column public.catalog_product_attributes.value_es is
  'Spanish display text of value (enum label, Sí / No, woods and materials in Spanish, proper names as written); numbers unchanged, unit in unit.';

-- 3.17d (random-sample audit): an attribute whose value differs between a product's variants (Meinl's natural / REMO
-- heads, a 1/2 and a 4/4 violin, an EQ and a plain ukulele, an ash and an alder body) is not filled at product level;
-- the product lists it here, so autofill takes it from the variant the listing names, never from the product.
alter table public.catalog_products
  add column if not exists variant_attributes text[] not null default '{}';

comment on column public.catalog_products.variant_attributes is
  'Attributes whose value differs between this product''s variants: not in catalog_product_attributes for the product; the variant decides.';
