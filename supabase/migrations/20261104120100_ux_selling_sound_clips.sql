-- Effortless Laria, selling batch (docs/ux-effortless/selling.md): an optional sound clip per listing (POST 16).
--
-- The seller records or picks up to 20 seconds in the sell form; the browser compresses it and uploads it beside the
-- photos (listing-sound-clips/<owner>/<submission>/sonido-<n>.<ext>), like a photo. The publish route checks the object
-- and records it here after complete_public_submission, so the clip is moderated with its listing: it is readable
-- exactly when the listing is (the policy reads listings under the caller's own row-level security), the Admin queue
-- shows it next to the photos, and an Admin can remove it. Buyers play it only by tapping; nothing autoplays.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-sound-clips', 'listing-sound-clips', true, 1048576,
        array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav'])
on conflict (id) do nothing;

create policy "Authenticated users upload sound clips under own folder"
on storage.objects for insert to authenticated
with check (bucket_id = 'listing-sound-clips'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$');

create table public.listing_sound_clips (
  listing_id        uuid primary key references public.listings(id) on delete cascade,
  clip_url          text not null check (clip_url ~ '^https?://' and char_length(clip_url) <= 500),
  mime_type         text not null check (mime_type in ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav')),
  duration_seconds  numeric(4, 1) not null check (duration_seconds between 0.5 and 20.5),
  created_at        timestamptz not null default now()
);

alter table public.listing_sound_clips enable row level security;

create policy "Sound clips follow their listing's visibility"
on public.listing_sound_clips for select to anon, authenticated
using (exists (select 1 from public.listings l where l.id = listing_id));

create policy "Admins remove sound clips"
on public.listing_sound_clips for delete to authenticated
using (public.is_admin());

revoke all on public.listing_sound_clips from anon, authenticated;
grant select on public.listing_sound_clips to anon, authenticated;
grant delete on public.listing_sound_clips to authenticated;

-- The publicaciones queue shows the clip next to the photos (the Admin hears it before approving).
create function pg_temp.selling_fix(p_function regprocedure, variadic p_edits text[])
returns void
language plpgsql
as $$
declare
  definition text := pg_get_functiondef(p_function);
  edit integer;
begin
  for edit in 1 .. cardinality(p_edits) by 2 loop
    if (length(definition) - length(replace(definition, p_edits[edit], ''))) / length(p_edits[edit]) <> 1 then
      raise exception 'selling_fix(%): expected exactly one occurrence of %', p_function, p_edits[edit];
    end if;
    definition := replace(definition, p_edits[edit], p_edits[edit + 1]);
  end loop;
  execute definition;
end;
$$;

select pg_temp.selling_fix('public.get_admin_moderation_queue(text,integer,integer)',
  'l.category, l.brand, l.model, photos.first_photo_url,',
  'l.category, l.brand, l.model, photos.first_photo_url,
        (select c.clip_url from public.listing_sound_clips c where c.listing_id = l.id) sound_clip_url,');
