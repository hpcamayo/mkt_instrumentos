-- Feature ideas, discovery batch (docs/feature-ideas/discovery.md), disc-04: the eleventh category, Andinos y
-- tradicionales (andean), with one type, andean_instrument, and its attribute andean_type. lib/listing-submission.ts and
-- lib/instrument-filters.ts mirror it.
--
-- Shared function rule (docs/feature-ideas/build-plan.md, rule 7): this file redefines one function and nothing else.
-- Unchanged from 20261022120000_marketplace_categories.sql except for the andean lines.

create or replace function public.listing_taxonomy_is_valid(
  p_category text,
  p_instrument_type text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    (p_instrument_type = 'other' and p_category in (
      'guitars', 'basses', 'keyboards', 'percussion', 'winds',
      'strings', 'pedals', 'amplifiers', 'microphones', 'audio', 'andean'
    ))
    or (p_category = 'guitars' and p_instrument_type in ('electric_guitar', 'acoustic_guitar'))
    or (p_category = 'basses' and p_instrument_type = 'bass')
    or (p_category = 'keyboards' and p_instrument_type = 'keyboards')
    or (p_category = 'percussion' and p_instrument_type in ('drums', 'cymbals', 'hand_percussion'))
    or (p_category = 'winds' and p_instrument_type = 'winds')
    or (p_category = 'strings' and p_instrument_type = 'string_instrument')
    or (p_category = 'pedals' and p_instrument_type = 'pedals')
    or (p_category = 'amplifiers' and p_instrument_type = 'amplifiers')
    or (p_category = 'microphones' and p_instrument_type = 'microphones')
    or (p_category = 'audio' and p_instrument_type in ('audio_interface', 'audio_gear'))
    or (p_category = 'andean' and p_instrument_type = 'andean_instrument');
$$;
