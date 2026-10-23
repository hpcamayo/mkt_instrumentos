-- Effortless Laria, selling batch (docs/ux-effortless/selling.md): listing drafts that follow the seller (POST 02).
--
-- A draft is the sell form saved on the server with its photos already uploaded. Its id is the submission id the
-- publish route signed (lib/submission-token.ts), so its photos live under listing-photos/<owner>/<id>/ and publishing
-- the draft completes that same submission; complete_public_submission deletes the draft in the same transaction.
-- Drafts are private to their owner and never public inventory, so they do not use listings.status = 'draft' (which
-- every listing reader, the store allowance and the moderation queue would then have to learn to skip).

create table public.listing_drafts (
  id              uuid primary key,
  owner_user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind            text not null check (kind in ('listing', 'store_listing')),
  store_id        uuid references public.stores(id) on delete cascade,
  -- The SKU being published, when the draft started from "Publicar este SKU". Checked again at publication.
  inventory_item_id uuid,
  title           text not null default '' check (char_length(title) <= 200),
  -- The form's fields as the seller left them (lib/sell-draft.ts). Never trusted: publication validates everything.
  form            jsonb not null default '{}'::jsonb
                  check (jsonb_typeof(form) = 'object' and pg_column_size(form) <= 65536),
  -- [{path, shot?}] in display order; each path is inside this draft's own folder (checked by the trigger below).
  photos          jsonb not null default '[]'::jsonb
                  check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 10),
  sound_clip      jsonb check (sound_clip is null or jsonb_typeof(sound_clip) = 'object'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((kind = 'store_listing') = (store_id is not null))
);

create index listing_drafts_owner_idx on public.listing_drafts (owner_user_id, updated_at desc);

create trigger listing_drafts_set_updated_at
before update on public.listing_drafts
for each row execute function public.set_updated_at();

-- Paths stay in the draft's folder, a store draft belongs to the caller's own store, a published submission cannot
-- become a draft again, and nobody keeps more than 20 drafts.
create or replace function laria_private.check_listing_draft()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  folder text := new.owner_user_id::text || '/' || new.id::text || '/';
  photo jsonb;
begin
  if tg_op = 'UPDATE' and (new.id <> old.id or new.owner_user_id <> old.owner_user_id or new.kind <> old.kind
      or new.store_id is distinct from old.store_id) then
    raise exception 'A draft keeps its id, owner, kind and store.';
  end if;
  for photo in select value from jsonb_array_elements(new.photos) loop
    if jsonb_typeof(photo) <> 'object' or jsonb_typeof(photo->'path') is distinct from 'string'
      or (photo->>'path') !~ ('^' || folder || '(?:[0-9]|[1-9][0-9])\.(jpg|png|webp)$')
      or (photo ? 'shot' and (jsonb_typeof(photo->'shot') <> 'string' or char_length(photo->>'shot') > 40)) then
      raise exception 'Invalid draft photo.';
    end if;
  end loop;
  if new.sound_clip is not null and (
      jsonb_typeof(new.sound_clip) <> 'object' or jsonb_typeof(new.sound_clip->'path') is distinct from 'string'
      or (new.sound_clip->>'path') !~ ('^' || folder || 'sonido-[0-9]{1,3}\.(webm|ogg|m4a|wav)$')
      or jsonb_typeof(new.sound_clip->'duration') is distinct from 'number'
      or (new.sound_clip->>'duration')::numeric not between 0.5 and 20.5) then
    raise exception 'Invalid draft sound clip.';
  end if;
  if new.kind = 'store_listing' and not exists (
      select 1 from public.stores s where s.id = new.store_id and s.owner_user_id = new.owner_user_id) then
    raise exception 'A store draft belongs to the owner''s store.';
  end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from public.listings where id = new.id) then
      raise exception 'LISTING_DRAFT_ALREADY_PUBLISHED';
    end if;
    -- An upsert of an existing draft also passes here (before-insert triggers run before ON CONFLICT), so it is not
    -- counted against itself.
    if (select count(*) from public.listing_drafts where owner_user_id = new.owner_user_id and id <> new.id) >= 20 then
      raise exception 'LISTING_DRAFT_LIMIT';
    end if;
  end if;
  return new;
end;
$$;

create trigger listing_drafts_check
before insert or update on public.listing_drafts
for each row execute function laria_private.check_listing_draft();

alter table public.listing_drafts enable row level security;

create policy "Owners read own listing drafts"
on public.listing_drafts for select to authenticated
using (owner_user_id = auth.uid());

create policy "Owners create own listing drafts"
on public.listing_drafts for insert to authenticated
with check (owner_user_id = auth.uid());

create policy "Owners update own listing drafts"
on public.listing_drafts for update to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy "Owners delete own listing drafts"
on public.listing_drafts for delete to authenticated
using (owner_user_id = auth.uid());

revoke all on public.listing_drafts from anon, authenticated;
grant select, insert, update, delete on public.listing_drafts to authenticated;
