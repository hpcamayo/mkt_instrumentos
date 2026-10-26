-- Feature ideas, discovery batch (docs/feature-ideas/discovery.md), disc-04: the eleventh category, Andinos y
-- tradicionales (andean), with one type, andean_instrument, and its attribute andean_type. lib/listing-submission.ts and
-- lib/instrument-filters.ts mirror it.
--
-- Shared function rule (docs/feature-ideas/build-plan.md, rule 7): this file redefines one function and nothing else.
-- It also adds Andean search synonyms, and rebuilds the trigram index that stores the function's result.

-- The words a listing is found by (unchanged from 20261101120000_ux_find_search.sql except for andean). The trigram
-- index stores this function's result, so it is rebuilt right after (20261111120000's maintenance note).
create or replace function public.listing_search_text(
  p_title text, p_brand text, p_model text, p_category text, p_instrument_type text
)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select public.catalog_fold(concat_ws(' ',
    p_title, p_brand, p_model, replace(coalesce(p_instrument_type, ''), '_', ' '),
    case p_category
      when 'guitars' then 'guitarra guitarras'
      when 'basses' then 'bajo bajos'
      when 'keyboards' then 'teclado teclados piano pianos'
      when 'percussion' then 'percusion bateria baterias'
      when 'winds' then 'viento vientos'
      when 'strings' then 'cuerdas'
      when 'pedals' then 'pedal pedales efecto efectos'
      when 'amplifiers' then 'amplificador amplificadores'
      when 'microphones' then 'microfono microfonos'
      when 'audio' then 'audio'
      when 'andean' then 'andino andinos tradicional tradicionales folklore folclore'
    end))
$$;

reindex index public.listings_search_text_trgm_idx;

insert into public.search_synonyms (term, expansions) values
  ('siku', array['zampona']), ('sikus', array['zampona']), ('sicu', array['zampona', 'siku']),
  ('zampona', array['siku']), ('zamponas', array['zampona']), ('quenas', array['quena']),
  ('charangos', array['charango']), ('tinyas', array['tinya']), ('wankara', array['bombo']),
  ('folklore', array['andino']), ('folclore', array['andino']), ('folklorico', array['andino'])
on conflict (term) do update set expansions = excluded.expansions;
