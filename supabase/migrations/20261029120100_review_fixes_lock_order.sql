-- Review fixes A3, A4 and A6 (docs/store-operations/review-fixes.md; Codex review items 1 and 5).
--
-- A3. Inventory writes lock the listing, then the SKU, then insert ledger, audit or receipt rows whose foreign key to
--     stores takes a KEY SHARE lock on the store row. Publication, the publish form, the Admin store settings and the V1
--     store review functions took the store row FOR UPDATE first and could then wait for that listing or SKU: when both
--     met, PostgreSQL aborted one of them (40P01). They now take FOR NO KEY UPDATE, which still serializes them with
--     each other and with every update of the store row (none of them changes the store's id or slug, its only keys)
--     but lets foreign-key checks through. Publication also locks an unlinked SKU before reading its price, so a price
--     change committed meanwhile is the one published, never overwritten by the old one.
-- A4. link_inventory_listing locked the SKU through lock_inventory_item, which first locks the SKU's current listing.
--     A stale request holding the requested listing could then wait for another listing, out of order. It now locks
--     the SKU directly and refuses an already linked SKU without touching its listing.
-- A6. The import photo guard takes the asset row FOR NO KEY UPDATE, so attachments of one photo queue behind each
--     other, and refuses a photo that another listing, or a revision of another listing, already uses. Revisions and
--     promotion of the same listing keep working.
--
-- Most of these are a few words in long functions written by earlier migrations, some of them V1 functions already in
-- production. Instead of copying those functions whole, review_fix() below rewrites each one from its current
-- definition with exact old → new replacements, each of which must match exactly once, so a function that changed
-- since this was written is never patched blindly. tests/store-ops-review-fixes.sql checks the result.

create function pg_temp.review_fix(p_function regprocedure, variadic p_edits text[])
returns void
language plpgsql
as $$
declare
  definition text := pg_get_functiondef(p_function);
  edit integer;
begin
  if cardinality(p_edits) % 2 <> 0 then
    raise exception 'review_fix(%): edits come in old/new pairs', p_function;
  end if;
  for edit in 1 .. cardinality(p_edits) by 2 loop
    if (length(definition) - length(replace(definition, p_edits[edit], ''))) / length(p_edits[edit]) <> 1 then
      raise exception 'review_fix(%): expected exactly one occurrence of %', p_function, p_edits[edit];
    end if;
    definition := replace(definition, p_edits[edit], p_edits[edit + 1]);
  end loop;
  execute definition;
end;
$$;

-- ------------------------------------------------------------------ A3: store row locks that let foreign keys through

select pg_temp.review_fix('public.complete_public_submission(uuid,text,jsonb,jsonb)',
  E'      and s.status in (''pending'', ''active'')\n    for update;',
  E'      and s.status in (''pending'', ''active'')\n    for no key update;');

select pg_temp.review_fix('public.resubmit_store_application(uuid)',
  E'    and owner_user_id = auth.uid()\n  for update;',
  E'    and owner_user_id = auth.uid()\n  for no key update;');

select pg_temp.review_fix('public.review_store_application(uuid,text,text)',
  'from public.stores where id = p_store_id for update;',
  'from public.stores where id = p_store_id for no key update;');

select pg_temp.review_fix('public.set_store_verification(uuid,boolean)',
  'from public.stores where id = p_store_id for update;',
  'from public.stores where id = p_store_id for no key update;');

select pg_temp.review_fix('public.submit_listing_for_publication(uuid)',
  E'status in (''pending'', ''active'')\n    for update;',
  E'status in (''pending'', ''active'')\n    for no key update;');

select pg_temp.review_fix('public.admin_set_store_inventory_enabled(uuid,boolean,text)',
  'perform 1 from public.stores where id = p_store_id for update;',
  'perform 1 from public.stores where id = p_store_id for no key update;');

select pg_temp.review_fix('public.admin_set_store_listing_allowance(uuid,integer,text)',
  'perform 1 from public.stores where id = p_store_id for update;',
  'perform 1 from public.stores where id = p_store_id for no key update;');

select pg_temp.review_fix('public.publish_store_import_rows(uuid,uuid,jsonb,boolean)',
  E'    and s.status in (''pending'', ''active'')\n  for update of s;',
  E'    and s.status in (''pending'', ''active'')\n  for no key update of s;',
  E'    select * into item from public.store_inventory_items i where i.id = staged.applied_item_id;\n'
  || E'    if staged.commit_status <> ''applied'' or staged.applied_item_id is null or not found then',
  E'    select * into item from public.store_inventory_items i where i.id = staged.applied_item_id;\n'
  || E'    -- Lock an unlinked SKU before reading its price (review fix A3), so a price change committed meanwhile is the\n'
  || E'    -- one published, and linking does not copy the old price back to the SKU. A linked SKU is refused below\n'
  || E'    -- without waiting for it.\n'
  || E'    if item.id is not null and item.listing_id is null then\n'
  || E'      select * into item from public.store_inventory_items i where i.id = staged.applied_item_id for update;\n'
  || E'    end if;\n'
  || E'    if staged.commit_status <> ''applied'' or staged.applied_item_id is null or item.id is null then');

-- ------------------------------------------------------------------ A4: link locks the SKU directly

select pg_temp.review_fix('public.link_inventory_listing(uuid,uuid,integer,integer)',
  E'  item := laria_private.lock_inventory_item(p_item_id);\n',
  E'  -- The SKU itself, never its current listing (review fix A4): this request already holds the requested listing, and\n'
  || E'  -- an already linked SKU is refused just below.\n'
  || E'  select * into item from public.store_inventory_items where id = p_item_id for update;\n'
  || E'  if not found then\n'
  || E'    perform laria_private.raise_inventory_error(''INVENTORY_ITEM_NOT_OWNED'', ''No puedes administrar este SKU.'');\n'
  || E'  end if;\n');

drop function pg_temp.review_fix(regprocedure, text[]);

-- ------------------------------------------------------------------ A6: one listing per import photo

-- Any listing photo or proposed photo that uses an import photo URL must point at a validated asset of the same store
-- that no other listing uses (photos of the same listing and of its revisions are fine: an edit proposal and its
-- promotion reuse them). The asset row is taken FOR NO KEY UPDATE: a second attachment of the same photo waits for the
-- first, and discard_import_photo_assets() (FOR UPDATE, then a reference check) still waits for both. The reference
-- check runs in its own statement after the lock, so it sees what an attachment that held the lock committed.
create or replace function laria_private.guard_import_photo_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parts text[];
  asset public.store_import_photo_assets;
  target_listing uuid;
  listing_store uuid;
  listing_owner uuid;
begin
  parts := regexp_match(new.image_url, '^/api/listing-images/[^/]+/import-photos/');
  if parts is null then return new; end if;
  parts := regexp_match(new.image_url,
    '^/api/listing-images/([0-9a-f-]{36})/import-photos/([0-9a-f-]{36})/([0-9a-f-]{36})[.](jpg|png|webp)$');
  if parts is null then raise exception 'LISTING_PHOTO_INVALID'; end if;
  if tg_table_name = 'listing_photos' then
    target_listing := new.listing_id;
  else
    select r.listing_id into target_listing from public.listing_revisions r where r.id = new.revision_id;
  end if;
  select l.store_id, l.owner_user_id into listing_store, listing_owner from public.listings l where l.id = target_listing;
  select * into asset from public.store_import_photo_assets a where a.id::text = parts[3] for no key update;
  if not found or asset.status <> 'validated' or asset.session_id::text <> parts[2] or asset.created_by::text <> parts[1]
     or asset.file_ext <> parts[4] or listing_store is null or asset.store_id <> listing_store
     or asset.created_by <> listing_owner then
    raise exception 'LISTING_PHOTO_INVALID';
  end if;
  if exists (select 1 from public.listing_photos p where p.image_url = new.image_url and p.listing_id <> target_listing)
     or exists (select 1 from public.listing_revision_photos rp join public.listing_revisions r on r.id = rp.revision_id
                where rp.image_url = new.image_url and r.listing_id <> target_listing) then
    raise exception 'LISTING_PHOTO_INVALID';
  end if;
  return new;
end;
$$;
