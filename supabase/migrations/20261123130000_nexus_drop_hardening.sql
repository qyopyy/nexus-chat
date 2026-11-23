-- Bind a Drop to a real file uploaded by its sender. Recipients may only
-- acknowledge a pending Drop; they must never be able to change the file path
-- that the Storage read policy trusts. No changes to Nexus Cloud permissions.

create or replace function public.nexus_drop_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  object_record jsonb;
  object_size text;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'claimed_at') is distinct from (to_jsonb(old) - 'claimed_at') then
      raise exception using errcode = '42501', message = 'Drop details cannot be changed after sending';
    end if;
    if old.to_user is distinct from auth.uid() then
      raise exception using errcode = '42501', message = 'Only the recipient can claim a Drop';
    end if;
    if old.claimed_at is not null or new.claimed_at is null or old.expires_at <= statement_timestamp() then
      raise exception using errcode = '23514', message = 'Only a pending, unexpired Drop can be claimed';
    end if;
    -- Do not trust the recipient's device clock or a supplied timestamp.
    new.claimed_at := statement_timestamp();
    return new;
  end if;

  if new.from_user is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'A Drop must be sent from your own account';
  end if;
  if split_part(new.path, '/', 1) <> new.from_user::text then
    raise exception using errcode = '23514', message = 'A Drop must use a file in the sender''s storage folder';
  end if;
  if new.claimed_at is not null then
    raise exception using errcode = '23514', message = 'A new Drop must be pending';
  end if;
  if not isfinite(new.expires_at) or new.expires_at <= statement_timestamp()
    or new.expires_at > statement_timestamp() + interval '1 day' then
    raise exception using errcode = '23514', message = 'Drops must expire within 24 hours';
  end if;

  select to_jsonb(o) into object_record from storage.objects o
    where o.bucket_id = 'nexus-drops' and o.name = new.path;
  -- owner_id is current Supabase Storage ownership; owner supports older rows.
  -- Service-owned/unowned files are not eligible for a user-created Drop.
  if object_record is null or coalesce(nullif(object_record->>'owner_id', ''), object_record->>'owner')
      is distinct from new.from_user::text then
    raise exception using errcode = '23514', message = 'Upload your file before sending a Drop';
  end if;
  object_size := object_record->'metadata'->>'size';
  if object_size is null or object_size !~ '^[0-9]{1,9}$' then
    raise exception using errcode = '23514', message = 'The uploaded file has no valid size';
  end if;
  if object_size::bigint <> new.bytes or new.bytes not between 1 and 104857600 then
    raise exception using errcode = '23514', message = 'The Drop size must match its uploaded file (up to 100 MB)';
  end if;
  new.mime := nullif(object_record->'metadata'->>'mimetype', '');
  new.created_at := statement_timestamp();
  return new;
end;
$$;

revoke all on function public.nexus_drop_validate() from public, anon, authenticated;
drop trigger if exists nexus_drop_validate on public.nexus_drops;
create trigger nexus_drop_validate before insert or update on public.nexus_drops
  for each row execute function public.nexus_drop_validate();

-- Preserve the existing client's .update({ claimed_at }) API, with only that
-- column writable. The trigger also protects metadata if grants change later.
revoke update on public.nexus_drops from public, anon, authenticated;
grant update (claimed_at) on public.nexus_drops to authenticated;

drop policy if exists nexus_drops_claim on public.nexus_drops;
create policy nexus_drops_claim on public.nexus_drops
  for update to authenticated
  using (to_user = (select auth.uid()) and claimed_at is null and expires_at > now())
  with check (to_user = (select auth.uid()) and claimed_at is not null);

-- Re-check ownership at read time as well, including legacy rows created before
-- the insert guard. A guessed file path alone never grants access to a file.
drop policy if exists nexus_drops_obj_read on storage.objects;
create policy nexus_drops_obj_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'nexus-drops'
    and (
      (split_part(name, '/', 1) = (select auth.uid())::text
        and coalesce(nullif(to_jsonb(objects)->>'owner_id', ''), to_jsonb(objects)->>'owner') = (select auth.uid())::text)
      or exists (
        select 1 from public.nexus_drops d
        where d.path = objects.name and d.to_user = (select auth.uid())
          and d.from_user::text = split_part(objects.name, '/', 1)
          and coalesce(nullif(to_jsonb(objects)->>'owner_id', ''), to_jsonb(objects)->>'owner') = d.from_user::text
          and objects.metadata->>'size' = d.bytes::text
          and d.expires_at > now() and d.created_at <= now()
          and d.expires_at <= d.created_at + interval '1 day'
      )
    )
  );
