-- Catalog step 3.6 (Henri's E4, 2026-09-30): an attribute value can be a default ('6 strings' on an electric guitar,
-- '4 strings' on a bass) that holds unless a source or the product's name says otherwise. It is stored with
-- provenance 'default' so autofill and Jev can tell it from a value a source states.
-- Local only; production with the other catalog migrations after Henri's review.

alter table public.catalog_product_attributes
  drop constraint if exists catalog_product_attributes_provenance_check;

alter table public.catalog_product_attributes
  add constraint catalog_product_attributes_provenance_check
  check (provenance in ('spec', 'category', 'name', 'derived', 'default'));

comment on column public.catalog_product_attributes.provenance is
  'spec | category | name | derived | default (3.6: the norm, held unless a source or the name says otherwise)';
