-- Custom emojis (server + personal, usable everywhere) · verified servers · free vanity invites for every server

-- ───────────── custom emojis ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('emojis', 'emojis', true, 1073741824, array['image/png', 'image/gif', 'image/webp', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

do $$ begin
  create policy "emoji files public read" on storage.objects for select to anon, authenticated using (bucket_id = 'emojis');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "emoji files own upload" on storage.objects for insert to authenticated
    with check (bucket_id = 'emojis' and (storage.foldername(name))[1] = (select auth.uid())::text);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "emoji files own delete" on storage.objects for delete to authenticated
    using (bucket_id = 'emojis' and (storage.foldername(name))[1] = (select auth.uid())::text);
exception when duplicate_object then null; end $$;

create table if not exists public.custom_emojis (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references public.spaces(id) on delete cascade, -- null = personal emoji
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9_]{2,32}$'),
  url text not null check (char_length(url) <= 500),
  animated boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists custom_emojis_space_name on public.custom_emojis (space_id, name) where space_id is not null;
create unique index if not exists custom_emojis_personal_name on public.custom_emojis (owner_id, name) where space_id is null;
create index if not exists custom_emojis_owner_idx on public.custom_emojis (owner_id);
alter table public.custom_emojis enable row level security;
revoke all on public.custom_emojis from anon, authenticated;
grant select on public.custom_emojis to authenticated;
-- anyone signed in can *see* any emoji so it renders wherever it's used
create policy "emojis readable" on public.custom_emojis for select to authenticated using (true);

create or replace function public.add_custom_emoji(p_space uuid, p_name text, p_path text, p_animated boolean default false)
returns public.custom_emojis language plpgsql security definer set search_path = '' as $$
declare r public.custom_emojis; n text := lower(btrim(coalesce(p_name, ''))); me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first'; end if;
  if n !~ '^[a-z0-9_]{2,32}$' then raise exception 'Emoji names are 2–32 letters, numbers or _'; end if;
  if p_path is null or split_part(p_path, '/', 1) <> me::text or p_path ~ '\.\.' then raise exception 'Upload the image first'; end if;
  if p_space is not null then
    if not public.is_space_staff(p_space) then raise exception 'Only server owners and admins can add server emojis'; end if;
    if (select count(*) from public.custom_emojis where space_id = p_space) >= 200 then raise exception 'Servers can have up to 200 emojis'; end if;
    if exists (select 1 from public.custom_emojis where space_id = p_space and name = n) then raise exception 'This server already has :%:', n; end if;
  else
    if (select count(*) from public.custom_emojis where space_id is null and owner_id = me) >= 100 then raise exception 'You can have up to 100 personal emojis'; end if;
    if exists (select 1 from public.custom_emojis where space_id is null and owner_id = me and name = n) then raise exception 'You already have :%:', n; end if;
  end if;
  insert into public.custom_emojis (space_id, owner_id, name, url, animated)
  values (p_space, me, n, 'https://fcnabeudhdlugruqzezn.supabase.co/storage/v1/object/public/emojis/' || p_path, coalesce(p_animated, false))
  returning * into r;
  return r;
end $$;
revoke execute on function public.add_custom_emoji(uuid, text, text, boolean) from public, anon;
grant execute on function public.add_custom_emoji(uuid, text, text, boolean) to authenticated;

create or replace function public.delete_custom_emoji(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.custom_emojis;
begin
  select * into e from public.custom_emojis where id = p_id;
  if not found then return; end if;
  if e.owner_id <> auth.uid() and not (e.space_id is not null and public.is_space_staff(e.space_id)) and public.my_rank() < 2 then
    raise exception 'You can''t remove this emoji';
  end if;
  delete from public.custom_emojis where id = p_id;
end $$;
revoke execute on function public.delete_custom_emoji(uuid) from public, anon;
grant execute on function public.delete_custom_emoji(uuid) to authenticated;

create or replace function public.rename_custom_emoji(p_id uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.custom_emojis; n text := lower(btrim(coalesce(p_name, '')));
begin
  select * into e from public.custom_emojis where id = p_id;
  if not found then raise exception 'Emoji not found'; end if;
  if e.owner_id <> auth.uid() and not (e.space_id is not null and public.is_space_staff(e.space_id)) then raise exception 'You can''t rename this emoji'; end if;
  if n !~ '^[a-z0-9_]{2,32}$' then raise exception 'Emoji names are 2–32 letters, numbers or _'; end if;
  update public.custom_emojis set name = n where id = p_id;
exception when unique_violation then raise exception 'That name is taken';
end $$;
revoke execute on function public.rename_custom_emoji(uuid, text) from public, anon;
grant execute on function public.rename_custom_emoji(uuid, text) to authenticated;

-- ───────────── verified servers ─────────────
alter table public.spaces add column if not exists verified boolean not null default false;
alter table public.spaces add column if not exists verified_at timestamptz;
-- (authenticated has column-level UPDATE grants only, so members can't flip `verified` themselves)

create table if not exists public.space_verification_requests (
  id bigint generated always as identity primary key,
  space_id uuid not null references public.spaces(id) on delete cascade,
  requested_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 20 and 1000),
  links text[] not null default '{}' check (cardinality(links) <= 5),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text check (char_length(note) <= 500),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists space_verif_one_pending on public.space_verification_requests (space_id) where status = 'pending';
create index if not exists space_verif_status_idx on public.space_verification_requests (status, created_at desc);
create index if not exists space_verif_by_fk on public.space_verification_requests (requested_by);
create index if not exists space_verif_reviewer_fk on public.space_verification_requests (reviewed_by);
alter table public.space_verification_requests enable row level security;
revoke all on public.space_verification_requests from anon, authenticated;
grant select on public.space_verification_requests to authenticated;
create policy "verif read own or admin" on public.space_verification_requests for select to authenticated
  using (requested_by = (select auth.uid()) or public.is_space_staff(space_id) or public.my_rank() >= 3);

create or replace function public.apply_space_verification(p_space uuid, p_reason text, p_links text[] default '{}')
returns public.space_verification_requests language plpgsql security definer set search_path = '' as $$
declare r public.space_verification_requests; sp public.spaces; clean text[];
begin
  select * into sp from public.spaces where id = p_space;
  if not found then raise exception 'Server not found'; end if;
  if sp.owner_id <> auth.uid() then raise exception 'Only the server owner can apply'; end if;
  if sp.verified then raise exception 'This server is already verified'; end if;
  if exists (select 1 from public.space_verification_requests where space_id = p_space and status = 'pending') then raise exception 'Your application is already being reviewed'; end if;
  if exists (select 1 from public.space_verification_requests where space_id = p_space and status = 'rejected' and reviewed_at > now() - interval '14 days') then
    raise exception 'You can apply again 14 days after a decision';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 20 then raise exception 'Tell us a bit more about the server (20+ characters)'; end if;
  select coalesce(array_agg(l), '{}') into clean from (select left(btrim(x), 300) l from unnest(coalesce(p_links, '{}')) x where btrim(x) ~* '^https://' limit 5) s;
  insert into public.space_verification_requests (space_id, requested_by, reason, links) values (p_space, auth.uid(), left(btrim(p_reason), 1000), clean)
  returning * into r;
  return r;
end $$;
revoke execute on function public.apply_space_verification(uuid, text, text[]) from public, anon;
grant execute on function public.apply_space_verification(uuid, text, text[]) to authenticated;

create or replace function public.admin_review_space_verification(p_id bigint, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.space_verification_requests; sp public.spaces; conv uuid;
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  select * into r from public.space_verification_requests where id = p_id;
  if not found or r.status <> 'pending' then raise exception 'That application was already handled'; end if;
  update public.space_verification_requests set status = case when p_approve then 'approved' else 'rejected' end,
    note = nullif(left(btrim(coalesce(p_note, '')), 500), ''), reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  update public.spaces set verified = p_approve, verified_at = case when p_approve then now() else verified_at end where id = r.space_id
  returning * into sp;
  perform public.log_admin(sp.owner_id, case when p_approve then 'server_verified' else 'server_verification_rejected' end, jsonb_build_object('space', sp.id, 'name', sp.name));
  -- let the owner know (Nexus Bot DM)
  begin
    conv := public.nexus_bot_dm(sp.owner_id);
    perform set_config('nexus.admin_write', 'on', true);
    insert into public.messages (conversation_id, author_id, content, bot_name) values (conv, '00000000-0000-4000-8000-00000000b001',
      case when p_approve then format(E'✅ **%s** is now a verified server! The checkmark shows next to its name, and its owner and admins get a verified badge on their profiles.', sp.name)
           else format(E'Your verification application for **%s** wasn''t approved this time.%s\nYou can apply again in 14 days.', sp.name, coalesce(E'\nNote from the team: ' || nullif(btrim(coalesce(p_note, '')), ''), '')) end,
      'Nexus Bot');
    perform set_config('nexus.admin_write', 'off', true);
  exception when others then perform set_config('nexus.admin_write', 'off', true);
  end;
end $$;
revoke execute on function public.admin_review_space_verification(bigint, boolean, text) from public, anon;
grant execute on function public.admin_review_space_verification(bigint, boolean, text) to authenticated;

create or replace function public.admin_set_space_verified(p_space uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  update public.spaces set verified = p_on, verified_at = case when p_on then now() else null end where id = p_space;
  perform public.log_admin(null, case when p_on then 'server_verified' else 'server_unverified' end, jsonb_build_object('space', p_space));
end $$;
revoke execute on function public.admin_set_space_verified(uuid, boolean) from public, anon;
grant execute on function public.admin_set_space_verified(uuid, boolean) to authenticated;

-- verified servers someone owns / admins — shown on their profile
create or replace function public.profile_verified_servers(p_user uuid)
returns json language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(json_build_object('id', s.id, 'name', s.name, 'icon_url', s.icon_url, 'icon_color', s.icon_color, 'role', m.role,
                                             'invite', coalesce(s.vanity_code, s.invite_code)) order by (m.role = 'owner') desc, s.name), '[]'::json)
  from public.space_members m join public.spaces s on s.id = m.space_id
  where m.user_id = p_user and s.verified and m.role in ('owner', 'admin');
$$;
revoke execute on function public.profile_verified_servers(uuid) from public;
grant execute on function public.profile_verified_servers(uuid) to anon, authenticated;

-- invite previews show the checkmark
create or replace function public.space_invite_preview(p_code text)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  raw text := lower(trim(coalesce(p_code, '')));
  inv public.space_invites%rowtype;
  sp public.spaces%rowtype;
  members int := 0;
  online int := 0;
begin
  if raw = '' then return null; end if;
  raw := split_part(raw, '/', array_length(string_to_array(raw, '/'), 1));
  raw := regexp_replace(raw, '[?#].*$', '');
  select * into sp from public.spaces where invite_code = raw or vanity_code = raw limit 1;
  if sp.id is null then
    select * into inv from public.space_invites where code = raw and revoked_at is null limit 1;
    if inv.id is null then return null; end if;
    if inv.expires_at is not null and inv.expires_at < now() then return null; end if;
    if inv.max_uses is not null and inv.uses >= inv.max_uses then return null; end if;
    select * into sp from public.spaces where id = inv.space_id;
    if sp.id is null then return null; end if;
  end if;
  select count(*)::int into members from public.space_members where space_id = sp.id;
  return jsonb_build_object(
    'id', sp.id, 'name', sp.name, 'description', coalesce(sp.description, sp.welcome, ''),
    'icon_color', sp.icon_color, 'icon_url', sp.icon_url, 'banner_url', coalesce(sp.banner_url, sp.background_url),
    'vanity_code', sp.vanity_code, 'invite_code', coalesce(nullif(raw, ''), sp.vanity_code, sp.invite_code),
    'member_count', members, 'online_count', online, 'verified', sp.verified);
end;
$function$;

-- ───────────── vanity invites: free for every server, owners & admins can set them ─────────────
create or replace function public.space_set_vanity(p_space uuid, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare c text := nullif(lower(trim(p_code)), '');
begin
  if not public.is_space_staff(p_space) then raise exception 'Only server owners and admins can set the vanity invite'; end if;
  if c is not null then
    if c !~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$' then raise exception 'Vanity links are 3–32 letters, numbers or dashes'; end if;
    if c = any (array['admin', 'nexus', 'support', 'help', 'staff', 'official', 'login', 'register', 'settings', 'api', 'invite', 'discord']) then
      raise exception 'That vanity link is reserved';
    end if;
    if exists (select 1 from public.spaces where id <> p_space and (vanity_code = c or invite_code = c))
       or exists (select 1 from public.space_invites where code = c and revoked_at is null and space_id <> p_space) then
      raise exception 'That vanity link is taken';
    end if;
  end if;
  update public.spaces set vanity_code = c where id = p_space;
exception when unique_violation then raise exception 'That vanity link is taken';
end $$;
revoke execute on function public.space_set_vanity(uuid, text) from public, anon;
grant execute on function public.space_set_vanity(uuid, text) to authenticated;
-- vanity goes through the checks above only
revoke update (vanity_code) on public.spaces from authenticated;

-- custom emojis work as reactions too (<:name:uuid> tokens)
do $$ declare c text; begin
  select conname into c from pg_constraint where conrelid = 'public.message_reactions'::regclass and pg_get_constraintdef(oid) like '%char_length(emoji) <= 16%';
  if c is not null then execute format('alter table public.message_reactions drop constraint %I', c); end if;
end $$;
alter table public.message_reactions add constraint message_reactions_emoji_len check (char_length(emoji) <= 80);

-- longer server descriptions (up to 1000 characters)
create or replace function public.space_set_appearance(p_space uuid, p_icon_url text default null, p_banner_url text default null, p_background_url text default null,
  p_icon_color text default null, p_description text default null, p_name text default null)
returns void language plpgsql security definer set search_path to '' as $function$
begin
  if not public.is_space_staff(p_space) then raise exception 'Staff only'; end if;
  update public.spaces set
    icon_url = coalesce(p_icon_url, icon_url),
    banner_url = coalesce(p_banner_url, banner_url),
    background_url = coalesce(p_background_url, background_url),
    icon_color = coalesce(nullif(trim(p_icon_color), ''), icon_color),
    description = case when p_description is null then description else nullif(left(trim(p_description), 1000), '') end,
    name = case when p_name is null or trim(p_name) = '' then name else left(trim(p_name), 64) end
  where id = p_space;
end;
$function$;

-- admin: find any server (they aren't members, so RLS hides it from a plain select)
create or replace function public.admin_find_spaces(p_query text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare q text := lower(btrim(coalesce(p_query, '')));
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  if char_length(q) < 2 then return '[]'::json; end if;
  return (select coalesce(json_agg(x), '[]'::json) from (
    select s.id, s.name, s.verified, s.invite_code, s.vanity_code
    from public.spaces s
    where s.invite_code = q or s.vanity_code = q or s.name ilike '%' || replace(replace(q, '%', ''), '_', '\_') || '%'
    order by s.verified desc, s.created_at desc limit 20) x);
end $$;
revoke execute on function public.admin_find_spaces(text) from public, anon;
grant execute on function public.admin_find_spaces(text) to authenticated;

create or replace function public.admin_list_space_verifications(p_status text default 'pending')
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  return (select coalesce(json_agg(x), '[]'::json) from (
    select r.*, json_build_object('name', s.name, 'icon_url', s.icon_url, 'icon_color', s.icon_color, 'verified', s.verified) as space,
           (select count(*) from public.space_members m where m.space_id = r.space_id) as members
    from public.space_verification_requests r left join public.spaces s on s.id = r.space_id
    where r.status = p_status
    order by case when p_status = 'pending' then r.created_at end asc, r.created_at desc
    limit 100) x);
end $$;
revoke execute on function public.admin_list_space_verifications(text) from public, anon;
grant execute on function public.admin_list_space_verifications(text) to authenticated;
