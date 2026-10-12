-- LOCAL FIXTURE ONLY. A handful of catalog rows shaped like the production catalog so the real catalog SQL functions
-- (catalog_lookup / catalog_match / catalog_jev_inputs) can be exercised on a plain local Postgres. The names are
-- real instruments, but these rows are hand-written for the prototype: they are NOT production records, their
-- attributes, flags and confidences are illustrative, and metrics measured on them say nothing about the real catalog.
-- Never load this into a hosted database.

begin;

insert into public.catalog_categories (id, parent_id, label_en, label_es, depth, laria_category, laria_instrument_type, terms_es, sort_order) values
  ('instruments', null, 'Instruments', 'Instrumentos', 0, null, null, '{}', 0),
  ('instruments.guitars', 'instruments', 'Guitars', 'Guitarras', 1, 'guitars', null, '{guitarra}', 1),
  ('instruments.guitars.electric', 'instruments.guitars', 'Electric guitars', 'Guitarras eléctricas', 2, 'guitars', 'electric_guitar', '{"guitarra electrica"}', 1),
  ('effects', null, 'Effects', 'Efectos', 0, 'pedals', 'pedals', '{pedal}', 2),
  ('effects.distortion', 'effects', 'Distortion pedals', 'Pedales de distorsión', 1, 'pedals', 'pedals', '{distorsion}', 1),
  ('microphones', null, 'Microphones', 'Micrófonos', 0, 'microphones', 'microphones', '{microfono}', 3),
  ('microphones.dynamic', 'microphones', 'Dynamic microphones', 'Micrófonos dinámicos', 1, 'microphones', 'microphones', '{"microfono dinamico"}', 1);

insert into public.catalog_manufacturers (id, slug, canonical_name, normalized_name, is_curated, parent_id) values
  ('00000000-0000-4000-a000-000000000001', 'shure', 'Shure', 'shure', true, null),
  ('00000000-0000-4000-a000-000000000002', 'boss', 'Boss', 'boss', true, null),
  ('00000000-0000-4000-a000-000000000003', 'fender', 'Fender', 'fender', true, null),
  ('00000000-0000-4000-a000-000000000004', 'squier', 'Squier', 'squier', true, '00000000-0000-4000-a000-000000000003'),
  ('00000000-0000-4000-a000-000000000005', 'gibson', 'Gibson', 'gibson', true, null);

insert into public.catalog_manufacturer_aliases (manufacturer_id, alias, alias_key)
select id, a, public.catalog_compact(a) from (values
  ('00000000-0000-4000-a000-000000000001'::uuid, 'Shure'),
  ('00000000-0000-4000-a000-000000000002'::uuid, 'Boss'),
  ('00000000-0000-4000-a000-000000000003'::uuid, 'Fender'),
  ('00000000-0000-4000-a000-000000000004'::uuid, 'Squier'),
  ('00000000-0000-4000-a000-000000000004'::uuid, 'Squier by Fender'),
  ('00000000-0000-4000-a000-000000000005'::uuid, 'Gibson')) v(id, a);

-- products: (id, manufacturer, model, code, category, level, family, verification, publish_ready, detail_status,
--            missing, untrusted, variant_attributes)
insert into public.catalog_products (id, manufacturer_id, canonical_model_name, normalized_model_name, model_key, model_code,
  model_code_key, category_id, identity_domain, confidence, verification_status, entity_level, family_product_id,
  publish_ready, detail_group, detail_status, missing_attributes, untrusted_attributes, variant_attributes, category_confidence)
select id, mid, model, public.catalog_normalize(model), public.catalog_compact(model), code, public.catalog_compact(code),
       cat, dom, conf, vs::public.catalog_verification_status, lvl, fam, ready, grp, ds, miss, untr, varattrs, 'strong'
from (values
  ('10000000-0000-4000-a000-000000000001'::uuid, '00000000-0000-4000-a000-000000000001'::uuid, 'SM57', 'SM57',
   'microphones.dynamic', 'microphones', 0.97, 'VERIFIED', 'model', null::uuid, true, 'microphones', 'detailed',
   '{}'::text[], '{}'::text[], '{}'::text[]),
  ('10000000-0000-4000-a000-000000000002'::uuid, '00000000-0000-4000-a000-000000000002'::uuid, 'DS-1 Distortion', 'DS-1',
   'effects.distortion', 'effects', 0.95, 'VERIFIED', 'model', null, true, 'pedals', 'complete',
   '{}', '{true_bypass}', '{}'),
  ('10000000-0000-4000-a000-000000000010'::uuid, '00000000-0000-4000-a000-000000000003'::uuid, 'Player Stratocaster', null,
   'instruments.guitars.electric', 'guitars', 0.9, 'VERIFIED', 'family', null, false, 'electric_guitar', 'partial',
   '{pickups}', '{}', '{}'),
  ('10000000-0000-4000-a000-000000000011'::uuid, '00000000-0000-4000-a000-000000000003'::uuid, 'Player Stratocaster HSS', '0144522',
   'instruments.guitars.electric', 'guitars', 0.92, 'VERIFIED', 'model', '10000000-0000-4000-a000-000000000010', true,
   'electric_guitar', 'detailed', '{}', '{}', '{handedness}'),
  ('10000000-0000-4000-a000-000000000012'::uuid, '00000000-0000-4000-a000-000000000003'::uuid, 'Player Stratocaster SSS', '0144502',
   'instruments.guitars.electric', 'guitars', 0.92, 'VERIFIED', 'model', '10000000-0000-4000-a000-000000000010', true,
   'electric_guitar', 'detailed', '{}', '{}', '{handedness}'),
  ('10000000-0000-4000-a000-000000000020'::uuid, '00000000-0000-4000-a000-000000000004'::uuid, 'Classic Vibe ''60s Stratocaster', '0374010',
   'instruments.guitars.electric', 'guitars', 0.9, 'VERIFIED', 'model', null, true, 'electric_guitar', 'detailed',
   '{}', '{}', '{}'),
  ('10000000-0000-4000-a000-000000000021'::uuid, '00000000-0000-4000-a000-000000000004'::uuid, 'Classic Vibe ''50s Stratocaster', '0374005',
   'instruments.guitars.electric', 'guitars', 0.9, 'VERIFIED', 'model', null, true, 'electric_guitar', 'detailed',
   '{}', '{}', '{}')
) v(id, mid, model, code, cat, dom, conf, vs, lvl, fam, ready, grp, ds, miss, untr, varattrs);

insert into public.catalog_product_aliases (id, product_id, alias, normalized_alias, alias_key, alias_type, confidence, is_ambiguous)
select gen_random_uuid(), pid, a, public.catalog_normalize(a), public.catalog_compact(a), t::public.catalog_alias_type, c, amb
from (values
  ('10000000-0000-4000-a000-000000000001'::uuid, 'SM57', 'official_alias', 0.98, false),
  ('10000000-0000-4000-a000-000000000001'::uuid, 'Shure SM57', 'manufacturer_prefixed', 0.98, false),
  ('10000000-0000-4000-a000-000000000002'::uuid, 'DS-1 Distortion', 'official_alias', 0.97, false),
  ('10000000-0000-4000-a000-000000000002'::uuid, 'DS-1', 'model_number', 0.95, false),
  ('10000000-0000-4000-a000-000000000002'::uuid, 'Boss DS-1', 'manufacturer_prefixed', 0.97, false),
  ('10000000-0000-4000-a000-000000000010'::uuid, 'Player Stratocaster', 'official_alias', 0.95, false),
  ('10000000-0000-4000-a000-000000000010'::uuid, 'Fender Player Stratocaster', 'manufacturer_prefixed', 0.95, false),
  ('10000000-0000-4000-a000-000000000011'::uuid, 'Player Stratocaster HSS', 'official_alias', 0.95, false),
  ('10000000-0000-4000-a000-000000000012'::uuid, 'Player Stratocaster SSS', 'official_alias', 0.95, false),
  ('10000000-0000-4000-a000-000000000020'::uuid, 'Classic Vibe ''60s Stratocaster', 'official_alias', 0.95, false),
  ('10000000-0000-4000-a000-000000000020'::uuid, 'Classic Vibe 60s Stratocaster', 'punctuation_variant', 0.95, false),
  ('10000000-0000-4000-a000-000000000020'::uuid, 'Classic Vibe Stratocaster', 'seller_common_name', 0.8, true),
  ('10000000-0000-4000-a000-000000000021'::uuid, 'Classic Vibe ''50s Stratocaster', 'official_alias', 0.95, false),
  ('10000000-0000-4000-a000-000000000021'::uuid, 'Classic Vibe Stratocaster', 'seller_common_name', 0.8, true)
) v(pid, a, t, c, amb);

insert into public.catalog_product_variants (id, product_id, variant_name, sku, sku_key, finish, color, size, configuration) values
  ('20000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000011', 'Player Stratocaster HSS, Black', '0144522506', '0144522506', 'Gloss', 'Black', null, 'right_handed'),
  ('20000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000011', 'Player Stratocaster HSS Left-Handed, Black', '0144532506', '0144532506', 'Gloss', 'Black', null, 'left_handed'),
  ('20000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000012', 'Player Stratocaster SSS, Polar White', '0144502515', '0144502515', 'Gloss', 'Polar White', null, 'right_handed');

-- attributes (value canonical, value_es Spanish display). Untrusted rows show what autofill must leave out.
insert into public.catalog_product_attributes (id, product_id, attribute_key, value, value_es, provenance, sources, weight, trusted)
select gen_random_uuid(), pid, k, v, ves, 'spec', '{fixture}', w, t
from (values
  ('10000000-0000-4000-a000-000000000001'::uuid, 'microphone_type', 'dynamic', 'Dinámico', 0.9, true),
  ('10000000-0000-4000-a000-000000000001'::uuid, 'polar_pattern', 'cardioid', 'Cardioide', 0.9, true),
  ('10000000-0000-4000-a000-000000000001'::uuid, 'connection', 'xlr', 'XLR', 0.9, true),
  ('10000000-0000-4000-a000-000000000001'::uuid, 'use_case', '["instrument","voice"]', 'Instrumento, Voz', 0.5, false),
  ('10000000-0000-4000-a000-000000000002'::uuid, 'pedal_type', 'distortion', 'Distorsión', 0.9, true),
  ('10000000-0000-4000-a000-000000000002'::uuid, 'format', 'compact', 'Compacto', 0.9, true),
  ('10000000-0000-4000-a000-000000000002'::uuid, 'true_bypass', 'false', 'No', 0.4, false),
  ('10000000-0000-4000-a000-000000000010'::uuid, 'shape', 'strat', 'Strat', 0.9, true),
  ('10000000-0000-4000-a000-000000000011'::uuid, 'body_type', 'solid_body', 'Cuerpo sólido', 0.9, true),
  ('10000000-0000-4000-a000-000000000011'::uuid, 'shape', 'strat', 'Strat', 0.9, true),
  ('10000000-0000-4000-a000-000000000011'::uuid, 'strings', '6', '6', 0.9, true),
  ('10000000-0000-4000-a000-000000000011'::uuid, 'bridge', 'tremolo', 'Trémolo', 0.85, true),
  ('10000000-0000-4000-a000-000000000011'::uuid, 'pickups', '["hss"]', 'HSS', 0.9, true),
  ('10000000-0000-4000-a000-000000000011'::uuid, 'frets', '22', '22', 0.9, true),
  ('10000000-0000-4000-a000-000000000011'::uuid, 'neck_wood', 'maple', 'Arce', 0.9, true),
  ('10000000-0000-4000-a000-000000000012'::uuid, 'shape', 'strat', 'Strat', 0.9, true),
  ('10000000-0000-4000-a000-000000000012'::uuid, 'pickups', '["sss"]', 'SSS', 0.9, true),
  ('10000000-0000-4000-a000-000000000012'::uuid, 'frets', '22', '22', 0.9, true),
  ('10000000-0000-4000-a000-000000000020'::uuid, 'shape', 'strat', 'Strat', 0.9, true),
  ('10000000-0000-4000-a000-000000000020'::uuid, 'pickups', '["sss"]', 'SSS', 0.9, true),
  ('10000000-0000-4000-a000-000000000020'::uuid, 'frets', '21', '21', 0.9, true),
  ('10000000-0000-4000-a000-000000000021'::uuid, 'shape', 'strat', 'Strat', 0.9, true),
  ('10000000-0000-4000-a000-000000000021'::uuid, 'frets', '21', '21', 0.9, true)
) v(pid, k, v, ves, w, t);

-- Rows for the catalog audit's unsafe-AUTO cases (docs/catalog-audit/jev-autofill-handoff.md, PR #4): a copy of a
-- named product, a category that contradicts the product, two products in one title, a multi-generation line whose
-- oldest generation carries the bare name, and size-level cymbals.
insert into public.catalog_categories (id, parent_id, label_en, label_es, depth, laria_category, laria_instrument_type, terms_es, sort_order) values
  ('amplifiers', null, 'Amplifiers', 'Amplificadores', 0, 'amplifiers', 'amplifiers', '{amplificador}', 4),
  ('cymbals', null, 'Cymbals', 'Platillos', 0, 'cymbals', 'cymbals', '{platillo}', 5);

insert into public.catalog_manufacturers (id, slug, canonical_name, normalized_name, is_curated, parent_id) values
  ('00000000-0000-4000-a000-000000000006', 'zildjian', 'Zildjian', 'zildjian', true, null);
insert into public.catalog_manufacturer_aliases (manufacturer_id, alias, alias_key)
values ('00000000-0000-4000-a000-000000000006', 'Zildjian', public.catalog_compact('Zildjian'));

insert into public.catalog_products (id, manufacturer_id, canonical_model_name, normalized_model_name, model_key, model_code,
  model_code_key, category_id, identity_domain, confidence, verification_status, entity_level, family_product_id,
  publish_ready, detail_group, detail_status, missing_attributes, untrusted_attributes, variant_attributes, category_confidence)
select id, mid, model, public.catalog_normalize(model), public.catalog_compact(model), code, public.catalog_compact(code),
       cat, dom, 0.93, 'VERIFIED'::public.catalog_verification_status, 'model', null, true, grp, 'detailed', '{}', '{}', '{}', 'strong'
from (values
  ('10000000-0000-4000-a000-000000000003'::uuid, '00000000-0000-4000-a000-000000000001'::uuid, 'SM58', 'SM58', 'microphones.dynamic', 'microphones', 'microphones'),
  ('10000000-0000-4000-a000-000000000030'::uuid, '00000000-0000-4000-a000-000000000005'::uuid, 'Les Paul Standard ''50s', null, 'instruments.guitars.electric', 'guitars', 'electric_guitar'),
  ('10000000-0000-4000-a000-000000000040'::uuid, '00000000-0000-4000-a000-000000000002'::uuid, 'Katana-50', 'KTN-50', 'amplifiers', 'amplifiers', 'amplifiers'),
  ('10000000-0000-4000-a000-000000000041'::uuid, '00000000-0000-4000-a000-000000000002'::uuid, 'Katana-50 MkII', 'KTN-50 2', 'amplifiers', 'amplifiers', 'amplifiers'),
  ('10000000-0000-4000-a000-000000000050'::uuid, '00000000-0000-4000-a000-000000000006'::uuid, 'A Custom Crash 16"', 'A20514', 'cymbals', 'cymbals', 'cymbals'),
  ('10000000-0000-4000-a000-000000000051'::uuid, '00000000-0000-4000-a000-000000000006'::uuid, 'A Custom Crash 17"', 'A20515', 'cymbals', 'cymbals', 'cymbals'),
  ('10000000-0000-4000-a000-000000000052'::uuid, '00000000-0000-4000-a000-000000000006'::uuid, 'A Custom Crash 18"', 'A20516', 'cymbals', 'cymbals', 'cymbals')
) v(id, mid, model, code, cat, dom, grp);

insert into public.catalog_product_aliases (id, product_id, alias, normalized_alias, alias_key, alias_type, confidence, is_ambiguous)
select gen_random_uuid(), pid, a, public.catalog_normalize(a), public.catalog_compact(a), t::public.catalog_alias_type, 0.95, false
from (values
  ('10000000-0000-4000-a000-000000000003'::uuid, 'SM58', 'official_alias'),
  ('10000000-0000-4000-a000-000000000030'::uuid, 'Les Paul Standard ''50s', 'official_alias'),
  ('10000000-0000-4000-a000-000000000030'::uuid, 'Les Paul Standard 50s', 'punctuation_variant'),
  ('10000000-0000-4000-a000-000000000040'::uuid, 'Katana-50', 'official_alias'),
  ('10000000-0000-4000-a000-000000000040'::uuid, 'Katana 50', 'punctuation_variant'),
  ('10000000-0000-4000-a000-000000000041'::uuid, 'Katana-50 MkII', 'official_alias'),
  ('10000000-0000-4000-a000-000000000041'::uuid, 'Katana 50 MkII', 'punctuation_variant'),
  ('10000000-0000-4000-a000-000000000050'::uuid, 'A Custom Crash 16', 'punctuation_variant'),
  ('10000000-0000-4000-a000-000000000051'::uuid, 'A Custom Crash 17', 'punctuation_variant'),
  ('10000000-0000-4000-a000-000000000052'::uuid, 'A Custom Crash 18', 'punctuation_variant')
) v(pid, a, t);

insert into public.catalog_product_attributes (id, product_id, attribute_key, value, value_es, provenance, sources, weight, trusted)
select gen_random_uuid(), pid, k, v, ves, 'spec', '{fixture}', 0.9, true
from (values
  ('10000000-0000-4000-a000-000000000003'::uuid, 'microphone_type', 'dynamic', 'Dinámico'),
  ('10000000-0000-4000-a000-000000000003'::uuid, 'polar_pattern', 'cardioid', 'Cardioide'),
  ('10000000-0000-4000-a000-000000000030'::uuid, 'body_type', 'solid_body', 'Cuerpo sólido'),
  ('10000000-0000-4000-a000-000000000030'::uuid, 'shape', 'les_paul', 'Les Paul'),
  ('10000000-0000-4000-a000-000000000040'::uuid, 'amplifier_type', 'combo', 'Combo'),
  ('10000000-0000-4000-a000-000000000040'::uuid, 'technology', 'modeling', 'Modelado'),
  ('10000000-0000-4000-a000-000000000041'::uuid, 'amplifier_type', 'combo', 'Combo'),
  ('10000000-0000-4000-a000-000000000041'::uuid, 'technology', 'modeling', 'Modelado'),
  ('10000000-0000-4000-a000-000000000050'::uuid, 'cymbal_type', 'crash', 'Crash'),
  ('10000000-0000-4000-a000-000000000050'::uuid, 'size', '16', '16'),
  ('10000000-0000-4000-a000-000000000051'::uuid, 'cymbal_type', 'crash', 'Crash'),
  ('10000000-0000-4000-a000-000000000051'::uuid, 'size', '17', '17'),
  ('10000000-0000-4000-a000-000000000052'::uuid, 'cymbal_type', 'crash', 'Crash'),
  ('10000000-0000-4000-a000-000000000052'::uuid, 'size', '18', '18')
) v(pid, k, v, ves);

refresh materialized view public.catalog_category_terms;

commit;
