-- Feature ideas, discovery batch (docs/feature-ideas/discovery.md), disc-04: the eleventh category, Andinos y
-- tradicionales (andean), with one type, andean_instrument, and its attribute andean_type. lib/listing-submission.ts and
-- lib/instrument-filters.ts mirror it.
--
-- Shared function rule (docs/feature-ideas/build-plan.md, rule 7): this file redefines one function and nothing else.
-- Unchanged from 20261022120000_marketplace_categories.sql except for the andean_instrument line.

create or replace function public.listing_attribute_keys_are_valid(
  p_instrument_type text,
  p_attributes jsonb
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(coalesce(p_attributes, '{}'::jsonb)) = 'object'
    and not exists (
      select 1
      from jsonb_object_keys(coalesce(p_attributes, '{}'::jsonb)) key
      where case p_instrument_type
        when 'electric_guitar' then key <> all(array['body_type','shape','strings','bridge','pickups','handedness','frets'])
        when 'bass' then key <> all(array['strings','bass_type','pickups','scale_length','handedness'])
        when 'acoustic_guitar' then key <> all(array['acoustic_type','body_shape','strings_material','handedness','has_preamp'])
        when 'drums' then key <> all(array['drum_type','configuration','pieces','material','includes_hardware','includes_cymbals','kick_size'])
        when 'cymbals' then key <> all(array['cymbal_type','size','alloy','finish'])
        when 'hand_percussion' then key <> all(array['percussion_type'])
        when 'keyboards' then key <> all(array['keyboard_type','keys','weighted_keys'])
        when 'winds' then key <> all(array['wind_type'])
        when 'string_instrument' then key <> all(array['string_type'])
        when 'microphones' then key <> all(array['microphone_type','use_case','polar_pattern','connection'])
        when 'audio_interface' then key <> all(array['inputs','connection','phantom_power','midi'])
        when 'audio_gear' then key <> all(array['audio_type'])
        when 'pedals' then key <> all(array['pedal_type','format','true_bypass'])
        when 'amplifiers' then key <> all(array['amplifier_type','technology','power','use_case'])
        when 'andean_instrument' then key <> all(array['andean_type'])
        when 'other' then true
        else true
      end
    );
$$;
