-- Laria canonical instrument & gear catalog (product identity database)
--
-- Reference data used to normalize marketplace listings: which manufacturer
-- and model a messy seller title refers to, its category, aliases and the
-- source evidence behind every fact. This is NOT a price database.
--
-- Design notes
-- * Every canonical product is traceable to >= 1 source record
--   (catalog_product_sources); raw adapter output is kept in
--   catalog_source_records so decisions can be re-audited.
-- * Canonical ids are deterministic UUIDv5 values computed by the ETL
--   (catalog/src/laria_catalog/pipeline.py:stable_uuid) so re-running the
--   seed upserts instead of duplicating.
-- * Generations stay distinct: identity is manufacturer + compact model key
--   (+ identity domain). Colors/finishes are catalog_product_variants.
-- * Uncertainty is explicit: verification_status, confidence,
--   catalog_conflicts and catalog_review_candidates.
-- * Existing marketplace tables are untouched. listings.category and
--   listings.instrument_type map through catalog_categories.laria_category /
--   laria_instrument_type.

-- Supabase keeps extensions in the `extensions` schema.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------- enums
do $$ begin
  create type public.catalog_verification_status as enum ('VERIFIED', 'PROBABLE', 'UNVERIFIED', 'CONFLICTING', 'REJECTED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.catalog_authority_level as enum (
    'manufacturer', 'official_catalog', 'structured_public_database', 'encyclopedic_reference',
    'specialist_reference', 'retailer', 'community', 'marketplace');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.catalog_alias_type as enum (
    'official_alias', 'abbreviation', 'legacy_name', 'regional_name', 'seller_common_name', 'model_number',
    'misspelling', 'punctuation_variant', 'manufacturer_prefixed', 'source_title', 'translation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.catalog_review_status as enum ('pending', 'confirmed_same', 'confirmed_distinct', 'dismissed');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------ text normalization
-- SQL mirror of catalog/src/laria_catalog/normalization/text.py (normalize /
-- compact). Keep both in sync; catalog/tests/test_sql_parity.py checks parity.
create or replace function public.catalog_fold(input text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  -- quotes/dashes unified, trademark signs dropped, pi/O-slash spelled out,
  -- accents stripped (n-tilde -> n), lowercase
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary,
    replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(input, ''),
      chr(8220), '"'), chr(8221), '"'), chr(8222), '"'), chr(8243), '"'), chr(171), '"'), chr(187), '"'),
      chr(8216), ''''), chr(8217), ''''), chr(8242), ''''), chr(180), ''''),
      chr(8208), '-'), chr(8209), '-'), chr(8211), '-'), chr(8212), '-'), chr(8722), '-'),
      chr(174), ''), chr(8482), ''), chr(960), 'pi'), chr(216), 'O'), chr(248), 'o')))
$$;

create or replace function public.catalog_normalize(input text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select trim(regexp_replace(replace(regexp_replace(regexp_replace(replace(
    -- generation markers: mk ii / mkii / mark 2 -> mk2
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      regexp_replace(
        public.catalog_fold(input),
        -- inch notation: 22" 22'' 22 inch 22in 22 pulgadas -> 22in
        '(^|[^0-9a-z.])([0-9]{1,2}(?:[.,][0-9]{1,2})?)\s*(?:"|''''|-?\s?inch(?:es)?\M|\s?in\M|\s?pulgadas?\M|\s?pulg\.?|\s?plg\.?)',
        '\1\2in', 'g'),
      '\m(?:mk|mark)\s*\.?\s*viii\M', 'mk8', 'g'), '\m(?:mk|mark)\s*\.?\s*vii\M', 'mk7', 'g'),
      '\m(?:mk|mark)\s*\.?\s*iii\M', 'mk3', 'g'), '\m(?:mk|mark)\s*\.?\s*ii\M', 'mk2', 'g'),
      '\m(?:mk|mark)\s*\.?\s*iv\M', 'mk4', 'g'), '\m(?:mk|mark)\s*\.?\s*vi\M', 'mk6', 'g'),
      '\m(?:mk|mark)\s*\.?\s*ix\M', 'mk9', 'g'), '\m(?:mk|mark)\s*\.?\s*v\M', 'mk5', 'g'),
      '\m(?:mk|mark)\s*\.?\s*x\M', 'mk10', 'g'), '\m(?:mk|mark)\s*\.?\s*([0-9]+)\M', 'mk\1', 'g'),
    '&', ' and '),
    -- keep '+' and decimal points between digits; everything else -> space
    '([0-9])\.([0-9])', '\1#\2', 'g'),
    '[^a-z0-9+#]+', ' ', 'g'),
    '#', '.'),
    '\s*\+\s*', '+ ', 'g'))
$$;

create or replace function public.catalog_compact(input text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select replace(replace(replace(
    regexp_replace(public.catalog_normalize(input), '([0-9])\.([0-9])', '\1p\2', 'g'),
    '+', 'plus'), ' ', ''), '.', '')
$$;

-- ---------------------------------------------------------------- sources
create table if not exists public.catalog_sources (
  id text primary key,                                -- adapter source_id, e.g. 'wikidata'
  name text not null,
  publisher text,
  url text,
  source_type text,
  authority_level public.catalog_authority_level not null,
  independence_group text,                            -- correlated sources share a group
  license text,
  access_method text,
  robots_status text,
  retrieved_at text,
  notes text,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------- taxonomy
create table if not exists public.catalog_categories (
  id text primary key,                                -- stable dotted slug from config/taxonomy.yaml
  parent_id text references public.catalog_categories(id),
  label_en text not null,
  label_es text not null,
  depth smallint not null,
  laria_category text,                                -- listings.category value, if any
  laria_instrument_type text,                         -- listings.instrument_type value, if any
  terms_es text[] not null default '{}',              -- Spanish marketplace vocabulary (category hints, never model aliases)
  sort_order integer not null default 0
);
create index if not exists catalog_categories_parent_idx on public.catalog_categories (parent_id);
create index if not exists catalog_categories_terms_idx on public.catalog_categories using gin (terms_es);

-- normalized category vocabulary used by catalog_lookup() to read listing intent
-- ('bateria', 'platillo', 'guitarra electrica' ...); terms shorter than 4 chars are ignored
-- Materialized: normalizing every term per lookup call cost ~150 ms. The ETL loader
-- (load_catalog.sql) refreshes it after loading categories.
drop view if exists public.catalog_category_terms;
drop materialized view if exists public.catalog_category_terms;
create materialized view public.catalog_category_terms as
  select c.id as category_id, public.catalog_normalize(t) as term
  from public.catalog_categories c, unnest(c.terms_es || array[c.label_es, c.label_en]) t
  where length(public.catalog_normalize(t)) >= 4
    -- words that are ordinary Spanish in a listing ('nuevo en caja', 'cuatro cuerpos', 'combo de ofertas')
    and public.catalog_normalize(t) not in ('caja', 'cuatro', 'tres', 'case', 'rack', 'vocal', 'combo', 'kick',
                                            'crash', 'bandeja', 'atril', 'viola', 'efecto', 'soporte', 'pedestal');
create index if not exists catalog_category_terms_term_idx on public.catalog_category_terms (term);

-- --------------------------------------------------------- manufacturers
create table if not exists public.catalog_manufacturers (
  id uuid primary key,
  slug text not null unique,
  canonical_name text not null,                       -- display name: 'Fender'
  normalized_name text not null,
  legal_name text,                                    -- 'Fender Musical Instruments Corporation'
  aliases text[] not null default '{}',               -- 'FMIC', 'Fender Musical Instruments', ...
  country text,
  founded_year smallint,
  active boolean,
  official_url text,
  parent_id uuid references public.catalog_manufacturers(id),
  wikidata_id text,
  is_curated boolean not null default false,          -- false = auto-registered from a source string, needs curation
  fact_source text,                                   -- provenance of country/founded/url
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists catalog_manufacturers_norm_trgm on public.catalog_manufacturers using gin (normalized_name extensions.gin_trgm_ops);
create index if not exists catalog_manufacturers_aliases_idx on public.catalog_manufacturers using gin (aliases);

-- lookup table of every manufacturer spelling (normalized) -> manufacturer
create table if not exists public.catalog_manufacturer_aliases (
  manufacturer_id uuid not null references public.catalog_manufacturers(id) on delete cascade,
  alias text not null,
  alias_key text not null,                            -- catalog_compact(alias)
  primary key (manufacturer_id, alias_key)
);
create index if not exists catalog_manufacturer_aliases_key_idx on public.catalog_manufacturer_aliases (alias_key);

-- -------------------------------------------------------------- families
create table if not exists public.catalog_product_families (
  id uuid primary key,
  manufacturer_id uuid not null references public.catalog_manufacturers(id),
  name text not null,                                 -- 'Stratocaster', 'JUNO', 'Export'
  normalized_name text not null,
  category_id text references public.catalog_categories(id),
  source_ids text[] not null default '{}',
  source_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (manufacturer_id, normalized_name)
);

-- -------------------------------------------------------------- products
create table if not exists public.catalog_products (
  id uuid primary key,
  manufacturer_id uuid not null references public.catalog_manufacturers(id),
  family_id uuid references public.catalog_product_families(id),
  canonical_model_name text not null,                 -- 'JUNO-106' (display: manufacturer + model)
  normalized_model_name text not null,                -- 'juno 106'
  model_key text not null,                            -- 'juno106' (catalog_compact)
  model_code text,                                    -- manufacturer code/part number when known
  model_code_key text,                                -- catalog_compact(model_code), for code lookup
  category_id text references public.catalog_categories(id),
  identity_domain text,                               -- guitars | bass | keys_studio | effects | ... (no cross-domain merges)
  product_type text not null default 'instrument_or_equipment',
  introduction_year smallint,
  discontinuation_year smallint,
  active_status text not null default 'unknown' check (active_status in ('current', 'discontinued', 'unknown')),
  description text,
  country_of_origin text,
  parent_product_id uuid references public.catalog_products(id),   -- set when a product is a variant-model of another
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  verification_status public.catalog_verification_status not null,
  source_count smallint not null default 0,
  independent_source_groups smallint not null default 0,
  flags text[] not null default '{}',
  entity_level text not null default 'model' check (entity_level in ('family', 'model')),
  entity_level_source text,                           -- override | rule:contained_in_N_models
  family_product_id uuid references public.catalog_products(id),  -- model -> its family entity
  category_confidence text check (category_confidence in ('strong', 'rule', 'weak', 'override')),
  quality_status text not null default 'ok' check (quality_status in ('ok', 'needs_review', 'quarantined')),
  quality_flags text[] not null default '{}',
  publish_ready boolean not null default false,       -- ok + VERIFIED/PROBABLE + model level + trusted category
  reject_reason text,
  superseded_at timestamptz,          -- set by the loader when a rebuild no longer produces this id (merged / renamed)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manufacturer_id, model_key, identity_domain)
);
create index if not exists catalog_products_manufacturer_idx on public.catalog_products (manufacturer_id);
create index if not exists catalog_products_category_idx on public.catalog_products (category_id);
create index if not exists catalog_products_model_key_idx on public.catalog_products (model_key);
create index if not exists catalog_products_model_code_idx on public.catalog_products (model_code_key);
create index if not exists catalog_products_status_idx on public.catalog_products (verification_status);
create index if not exists catalog_products_family_idx on public.catalog_products (family_product_id);
create index if not exists catalog_products_quality_idx on public.catalog_products (quality_status, publish_ready);
create index if not exists catalog_products_norm_trgm on public.catalog_products using gin (normalized_model_name extensions.gin_trgm_ops);

-- --------------------------------------------------------------- aliases
create table if not exists public.catalog_product_aliases (
  id uuid primary key,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  alias_key text not null,                            -- catalog_compact(alias): exact lookup key
  alias_type public.catalog_alias_type not null,
  source_id text references public.catalog_sources(id),  -- null = generated deterministically by the ETL
  confidence numeric(4,3) not null default 0.9,
  is_ambiguous boolean not null default false,        -- same alias_key maps to more than one product
  created_at timestamptz not null default now()
);
create index if not exists catalog_product_aliases_product_idx on public.catalog_product_aliases (product_id);
create index if not exists catalog_product_aliases_key_idx on public.catalog_product_aliases (alias_key);
create index if not exists catalog_product_aliases_norm_trgm on public.catalog_product_aliases using gin (normalized_alias extensions.gin_trgm_ops);
create index if not exists catalog_product_aliases_tokens_idx on public.catalog_product_aliases using gin (string_to_array(normalized_alias, ' '));

-- -------------------------------------------------------------- variants
create table if not exists public.catalog_product_variants (
  id uuid primary key,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  variant_name text not null,
  sku text,
  sku_key text,                                       -- catalog_compact(sku), for SKU lookup
  gtin text,
  finish text,
  color text,
  size text,
  configuration text,
  region text,
  year_start smallint,
  year_end smallint,
  source_id text references public.catalog_sources(id),
  created_at timestamptz not null default now()
);
create index if not exists catalog_product_variants_product_idx on public.catalog_product_variants (product_id);
create index if not exists catalog_product_variants_sku_idx on public.catalog_product_variants (sku_key) where sku_key is not null;
create index if not exists catalog_product_variants_gtin_idx on public.catalog_product_variants (gtin) where gtin is not null;

-- ----------------------------------------------------------------- specs
-- Flexible namespaced key/value specs: 'synth.polyphony', 'cymbal.diameter_in',
-- 'microphone.pattern'. One row per (product, key, source) so disagreements survive.
create table if not exists public.catalog_product_specs (
  id uuid primary key,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  spec_key text not null,
  spec_value text not null,
  unit text,
  normalized_value numeric,
  source_id text references public.catalog_sources(id),
  created_at timestamptz not null default now()
);
create index if not exists catalog_product_specs_product_idx on public.catalog_product_specs (product_id);
create index if not exists catalog_product_specs_key_idx on public.catalog_product_specs (spec_key, normalized_value);

-- ------------------------------------------------------------ provenance
create table if not exists public.catalog_product_sources (
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  source_id text not null references public.catalog_sources(id),
  source_record_id text not null,
  source_url text,
  source_model_name text not null,                    -- exactly as the source printed it
  source_manufacturer_name text,
  evidence_type text not null,
  extraction_method text not null,
  confidence numeric(4,3) not null,                   -- authority weight of this evidence
  merge_reason text not null,                         -- cluster_anchor | exact_model_key | shared_wikidata_id | official_alias:... | model_code_descriptive_suffix:...
  retrieved_at text,
  primary key (product_id, source_id, source_record_id)
);
create index if not exists catalog_product_sources_source_idx on public.catalog_product_sources (source_id, source_record_id);

create table if not exists public.catalog_product_external_ids (
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  scheme text not null,                               -- wikidata | enwiki | eswiki | gtin | ...
  value text not null,
  source_id text references public.catalog_sources(id),
  primary key (product_id, scheme, value)
);
create index if not exists catalog_product_external_ids_value_idx on public.catalog_product_external_ids (scheme, value);

-- Raw adapter output (SourceRecord JSON) for every record, including the
-- ones that were skipped, so canonicalization can be re-audited later.
create table if not exists public.catalog_source_records (
  source_id text not null references public.catalog_sources(id),
  source_record_id text not null,
  product_id uuid references public.catalog_products(id) on delete set null,
  status text not null,                               -- attached | skipped:<reason> | unattached
  payload jsonb not null,
  primary key (source_id, source_record_id)
);
create index if not exists catalog_source_records_product_idx on public.catalog_source_records (product_id);

-- ---------------------------------------------- uncertainty / review queue
create table if not exists public.catalog_conflicts (
  id uuid primary key,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  field text not null,                                -- introduction_year | category | manufacturer | spec:<key> ...
  values jsonb not null,                              -- every competing value with its source
  severity text not null check (severity in ('identity', 'low')),
  created_at timestamptz not null default now()
);
create index if not exists catalog_conflicts_product_idx on public.catalog_conflicts (product_id);

create table if not exists public.catalog_review_candidates (
  id uuid primary key,
  kind text not null,                                 -- possible_duplicate | same_core_name | same_model_code | same_name_different_domain | ...
  product_a uuid references public.catalog_products(id) on delete cascade,
  product_b uuid references public.catalog_products(id) on delete cascade,
  score numeric(4,3),
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  status public.catalog_review_status not null default 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists catalog_review_candidates_status_idx on public.catalog_review_candidates (status, kind);

-- ------------------------------------------------------ updated_at trigger
create or replace function public.catalog_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists catalog_products_touch on public.catalog_products;
create trigger catalog_products_touch before update on public.catalog_products
  for each row execute function public.catalog_touch_updated_at();
drop trigger if exists catalog_manufacturers_touch on public.catalog_manufacturers;
create trigger catalog_manufacturers_touch before update on public.catalog_manufacturers
  for each row execute function public.catalog_touch_updated_at();

-- ------------------------------------------------------------------ lookup
-- catalog_lookup('vendo roland juno 106 impecable') -> ranked candidates.
--
-- Strategy (all deterministic, returns several candidates, never forces one):
--   1. manufacturer mentions: any n-gram equal to a manufacturer alias key (>= 3 chars)
--   2. exact alias: a contiguous 1-5 token n-gram whose compact key equals an alias_key
--   3. alias tokens: all tokens of a (multi-token) alias occur in the text, any order
--   4. model code: an n-gram equals a product's compact model_code
--   5. SKU: an n-gram equals a variant's compact SKU / part number
--   6. fuzzy: trigram word_similarity between normalized aliases and the text
-- Warnings: when the token right after a matched span is an identity token the
-- match does not explain ('yamaha cp300 II', 'sennheiser hd 25 mk2', 'nord lead 2+',
-- 'mythos olympus v0'), the hit is marked 'unexplained_token:<tok>' and penalized:
-- the listing names a generation / version the catalog may not have. Likewise
-- 'unexplained_code:<tok>' (a warning only, the ranking is kept) when the text carries a model
-- code and the matched product has none and does not contain it ('yamaha pacifica pa012').
-- Score = base(match type) * alias confidence, + manufacturer agreement bonus,
-- - penalty when the query names a different manufacturer, + small bonus for
-- verified status. Ambiguous aliases (shared by several products) are
-- down-weighted so the caller sees the competition.
drop function if exists public.catalog_lookup(text, text, integer);  -- return columns changed in Phase 1
create or replace function public.catalog_lookup(
  query text,
  manufacturer_hint text default null,
  max_results integer default 8
)
returns table (
  product_id uuid,
  manufacturer text,
  model text,
  category_id text,
  category_label_es text,
  entity_level text,
  introduction_year smallint,
  discontinuation_year smallint,
  verification_status public.catalog_verification_status,
  quality_status text,
  publish_ready boolean,
  confidence numeric,
  match_type text,
  matched_text text,
  category_intent text,
  warning text,
  score numeric
)
language plpgsql
stable
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  -- '10/10' (condition score) is the most common number in Peruvian listings: drop it before matching
  q text := public.catalog_normalize(regexp_replace(query, '(^|\s)(10|9|8)\s*/\s*10(\s|$)', ' ', 'g'));
  toks text[] := string_to_array(q, ' ');
  qtoks text[];
  n int := coalesce(array_length(toks, 1), 0);
  grams text[] := '{}';
  gends int[] := '{}';
  gtexts text[] := '{}';
  pflag text[] := '{}';   -- pflag[i]: identity token right after position i (or null)
  intents text[];
  qcodes text[];          -- model-code-like tokens in the text ('pa012', 'ar529svjg', 's6000')
  nx text; af text;
  i int; j int;
begin
  if n = 0 then
    return;
  end if;
  for i in 1..n loop
    nx := toks[i + 1];
    af := toks[i + 2];
    if nx ~ '^(ii|iii|iv|vi|mk[0-9]+|mkii+|mark[0-9]+|v[0-9]+|[0-9]{1,3}(\.[0-9]+)?\+?|plus|\+|pro\+?|xl|xd|mini|jr|deluxe|dlx)$'
       and not (nx ~ '^[0-9]' and coalesce(af, '') ~ '^(cuerpos|piezas|pzas|pz|cuerdas|teclas|canales|ch|watts|w|wts|metros|m|pulgadas|in|anos|meses|dias|x|unidades|pads|zonas|bandas|botones|pedales|tambores|platillos|octavas|voces|vias|soles|sol|dolares|usd|lucas|mil|s)$') then
      pflag := pflag || ('unexplained_token:' || nx);
    else
      pflag := pflag || null::text;
    end if;
  end loop;
  for i in 1..n loop
    for j in i..least(n, i + 4) loop
      grams := grams || public.catalog_compact(array_to_string(toks[i:j], ' '));
      gends := gends || j;
      if j - i between 1 and 3 then
        gtexts := gtexts || array_to_string(toks[i:j], ' ');
      end if;
    end loop;
  end loop;
  if n <= 2 then
    gtexts := gtexts || q;
  end if;
  select array_agg(distinct t) into qtoks from (
    select unnest(toks) as t
    union all
    select x || 'in' from unnest(toks) x where x ~ '^[0-9]{1,2}(\.[0-9])?$' and x::numeric between 6 and 30
  ) s;
  select array_agg(distinct t) into qcodes
  from unnest(toks) t
  where length(t) >= 4 and t ~ '[a-z]' and t ~ '[0-9]' and t ~ '^[a-z0-9]+$'
    and t !~ '^[0-9]+(v|vac|w|wts|watts|hz|khz|mm|cm|kg|in|ch|x[0-9]+|da|ra|ro|do|to|vo|mo|no|gb|mb)$'
    and not exists (select 1 from public.catalog_manufacturer_aliases ma where ma.alias_key = t);
  -- category intent: most specific taxonomy terms present in the text ('bateria electronica' > 'bateria')
  select array_agg(ct.category_id order by length(ct.term) desc) into intents
  from public.catalog_category_terms ct
  where (' ' || q || ' ') like ('% ' || ct.term || ' %');

  return query
  with mentioned as (
    select distinct ma.manufacturer_id
    from public.catalog_manufacturer_aliases ma
    where length(ma.alias_key) >= 3 and ma.alias_key = any(grams)
    union
    select ma.manufacturer_id from public.catalog_manufacturer_aliases ma
    where manufacturer_hint is not null and ma.alias_key = public.catalog_compact(manufacturer_hint)
  ),
  g as (
    select * from unnest(grams, gends) as g(k, e)
  ),
  exact as (
    select a.product_id, a.alias as matched, a.alias_key,
           case when a.alias_type = 'manufacturer_prefixed' then 'exact_alias_with_brand' else 'exact_alias' end as mtype,
           1.0::numeric as quality, a.confidence, a.is_ambiguous,
           coalesce(array_length(string_to_array(a.normalized_alias, ' '), 1), 1) as ntok, pflag[g.e] as warn
    from g join public.catalog_product_aliases a on a.alias_key = g.k
    where length(a.alias_key) >= 3
  ),
  tokenset as (
    select a.product_id, a.alias as matched, a.alias_key, 'alias_tokens'::text as mtype,
           0.95::numeric as quality, a.confidence, a.is_ambiguous,
           array_length(string_to_array(a.normalized_alias, ' '), 1) as ntok,
           -- position of the alias' last token (its model part ends there, even when the brand came later)
           pflag[array_position(toks, (string_to_array(a.normalized_alias, ' '))[array_length(string_to_array(a.normalized_alias, ' '), 1)])] as warn
    from public.catalog_product_aliases a
    where string_to_array(a.normalized_alias, ' ') <@ qtoks
      and array_length(string_to_array(a.normalized_alias, ' '), 1) >= 2
      and length(a.alias_key) >= 4
  ),
  code as (
    select p.id as product_id, p.model_code as matched, p.model_code_key as alias_key,
           'model_code'::text as mtype, 0.85::numeric as quality, 0.9::numeric as confidence, false as is_ambiguous, 1 as ntok,
           pflag[g.e] as warn
    from g join public.catalog_products p on p.model_code_key = g.k
    where length(p.model_code_key) >= 3
  ),
  sku as (          -- manufacturer SKU / part number of a variant (Zildjian A20532)
    select distinct on (v.product_id) v.product_id, v.sku as matched, v.sku_key as alias_key,
           'sku'::text as mtype, 0.92::numeric as quality, 0.95::numeric as confidence, false as is_ambiguous, 2 as ntok,
           null::text as warn
    from g join public.catalog_product_variants v on v.sku_key = g.k
    where length(v.sku_key) >= 5
  ),
  fuzzy as (
    select f.product_id, f.matched, f.alias_key, 'fuzzy'::text as mtype,
           (0.75 * f.sim)::numeric as quality, f.confidence, f.is_ambiguous, f.ntok, null::text as warn
    from (
      select distinct on (a.id) a.product_id, a.alias as matched, a.alias_key, a.confidence, a.is_ambiguous,
             coalesce(array_length(string_to_array(a.normalized_alias, ' '), 1), 1) as ntok,
             greatest(similarity(a.normalized_alias, g), word_similarity(a.normalized_alias, q)) as sim
      from unnest(gtexts) g
      join public.catalog_product_aliases a on a.normalized_alias % g
      order by a.id, similarity(a.normalized_alias, g) desc
    ) f
    order by f.sim desc
    limit 150
  ),
  hits as (
    select h.*,
           (h.quality * h.confidence * case when h.is_ambiguous then 0.9 else 1 end
             + 0.05 * least(h.ntok, 8) + 0.01 * least(length(h.alias_key), 20))::numeric as base
    from (select * from exact union all select * from tokenset union all select * from code
          union all select * from sku union all select * from fuzzy) h
  ),
  best as (
    -- a product's evidence is its best strong hit when it has one (a fuzzy hit must not hide a warning)
    select distinct on (h.product_id) h.product_id, h.matched, h.alias_key, h.mtype, h.warn, h.base,
           coalesce(h.is_ambiguous, false) and h.mtype <> 'fuzzy' as ambiguous
    from hits h
    order by h.product_id, (h.mtype = 'fuzzy'), h.base desc
  )
  select p.id, m.canonical_name, p.canonical_model_name, p.category_id, c.label_es, p.entity_level,
         p.introduction_year, p.discontinuation_year, p.verification_status, p.quality_status, p.publish_ready,
         p.confidence, b.mtype, b.matched, intents[1], coalesce(b.warn, 'unexplained_code:' || uc.tok),
         round((b.base
           -- a generation / version token the match does not explain: most likely another product
           - case when b.warn is not null then 0.45 when uc.tok is not null then 0.03 else 0 end
           + case when exists (select 1 from mentioned) and p.manufacturer_id in (select manufacturer_id from mentioned) then 0.25
                  when exists (select 1 from mentioned) then -0.30 else 0 end
           -- an ambiguous alias ('Tremolo', 'III', a name shared by several products) needs its brand in the text
           - case when b.ambiguous and p.manufacturer_id not in (select manufacturer_id from mentioned) then 0.25 else 0 end
           -- listing says what kind of thing it is: reward agreement, punish contradiction
           + case when intents is null or p.category_id is null then 0
                  when exists (select 1 from unnest(intents) it
                               where p.category_id like it || '%' or it like p.category_id || '%'
                                  -- instruments.* must agree on the instrument (guitar / bass / drums / keys ...)
                                  or (split_part(it, '.', 1) = 'instruments'
                                      and split_part(it, '.', 1) || '.' || split_part(it, '.', 2)
                                        = split_part(p.category_id, '.', 1) || '.' || split_part(p.category_id, '.', 2))
                                  -- other groups (amplification, effects, pro_audio, studio, dj...) agree on the group
                                  or (split_part(it, '.', 1) <> 'instruments'
                                      and split_part(it, '.', 1) = split_part(p.category_id, '.', 1))
                                  -- a 'sintetizador' can be a groovebox / drum machine / sampler
                                  or (it like 'instruments.keyboards%' and p.category_id like 'studio.%')
                                  or (it like 'studio.%' and p.category_id like 'instruments.keyboards%')) then 0.08
                  else -0.25 end
           + case p.entity_level when 'family' then -0.12 else 0 end
           + case p.quality_status when 'quarantined' then -0.6 when 'needs_review' then -0.04 else 0 end
           + case p.verification_status when 'VERIFIED' then 0.04 when 'PROBABLE' then 0.02
                  when 'REJECTED' then -0.5 else 0 end)::numeric, 4) as score
  from best b
  join public.catalog_products p on p.id = b.product_id and p.superseded_at is null
  join public.catalog_manufacturers m on m.id = p.manufacturer_id
  left join public.catalog_categories c on c.id = p.category_id
  -- the listing names a model code but the matched product has none and its name does not contain it:
  -- 'yamaha pacifica pa012' is probably not the line 'Pacifica', but 'meinl msm3cu rawhide maracas'
  -- is just a retail SKU. Ranking is kept (the product stays the best candidate to show the
  -- seller); the warning tells the caller not to auto-approve.
  left join lateral (
    select x as tok from unnest(qcodes) x
    where p.model_code_key is null and b.mtype <> 'fuzzy'
      and position(x in b.alias_key) = 0 and position(x in p.model_key) = 0
    limit 1
  ) uc on true
  order by score desc, p.confidence desc
  limit max_results;
end $$;

comment on function public.catalog_lookup(text, text, integer) is
  'Candidate retrieval for listing classification. Ranked candidates (exact alias, alias with brand, alias tokens, model code, SKU, fuzzy) with entity level, quality status, publish_ready and the category intent read from the text. Callers decide CANDIDATE_x / FAMILY_ONLY / INSUFFICIENT / CONFLICTING.';

-- --------------------------------------------------------------------- RLS
-- Catalog reference data is public read-only; writes happen through the
-- service role (ETL) only.
alter table public.catalog_sources enable row level security;
alter table public.catalog_categories enable row level security;
alter table public.catalog_manufacturers enable row level security;
alter table public.catalog_manufacturer_aliases enable row level security;
alter table public.catalog_product_families enable row level security;
alter table public.catalog_products enable row level security;
alter table public.catalog_product_aliases enable row level security;
alter table public.catalog_product_variants enable row level security;
alter table public.catalog_product_specs enable row level security;
alter table public.catalog_product_sources enable row level security;
alter table public.catalog_product_external_ids enable row level security;
alter table public.catalog_source_records enable row level security;
alter table public.catalog_conflicts enable row level security;
alter table public.catalog_review_candidates enable row level security;

do $$
declare t text;
begin
  foreach t in array array['catalog_sources', 'catalog_categories', 'catalog_manufacturers', 'catalog_manufacturer_aliases',
    'catalog_product_families', 'catalog_products', 'catalog_product_aliases', 'catalog_product_variants',
    'catalog_product_specs', 'catalog_product_sources', 'catalog_product_external_ids']
  loop
    execute format('drop policy if exists "%s public read" on public.%I', t, t);
    execute format('create policy "%s public read" on public.%I for select to anon, authenticated using (true)', t, t);
  end loop;
end $$;

-- Raw records, conflicts and the review queue are admin-only.
drop policy if exists "catalog_source_records admin read" on public.catalog_source_records;
create policy "catalog_source_records admin read" on public.catalog_source_records
  for select to authenticated using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false));
drop policy if exists "catalog_conflicts admin read" on public.catalog_conflicts;
create policy "catalog_conflicts admin read" on public.catalog_conflicts
  for select to authenticated using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false));
drop policy if exists "catalog_review_candidates admin all" on public.catalog_review_candidates;
create policy "catalog_review_candidates admin all" on public.catalog_review_candidates
  for all to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false))
  with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false));

grant execute on function public.catalog_lookup(text, text, integer) to anon, authenticated;
grant select on public.catalog_category_terms to anon, authenticated;
grant execute on function public.catalog_normalize(text) to anon, authenticated;
grant execute on function public.catalog_fold(text) to anon, authenticated;
grant execute on function public.catalog_compact(text) to anon, authenticated;
