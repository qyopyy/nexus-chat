-- Public invite preview (OG embeds) + announcement channels
alter table public.conversations
  add column if not exists is_announcement boolean not null default false;

create or replace function public.space_invite_preview(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw text := lower(trim(coalesce(p_code, '')));
  sid uuid;
  inv public.space_invites%rowtype;
  sp public.spaces%rowtype;
  members int := 0;
  online int := 0;
begin
  if raw = '' then return null; end if;
  -- allow /i/CODE or full URLs pasted into the RPC
  raw := split_part(raw, '/', array_length(string_to_array(raw, '/'), 1));
  raw := regexp_replace(raw, '[?#].*$', '');

  select * into sp from public.spaces
  where invite_code = raw or vanity_code = raw
  limit 1;

  if sp.id is null then
    select * into inv from public.space_invites
    where code = raw and revoked_at is null
    limit 1;
    if inv.id is null then return null; end if;
    if inv.expires_at is not null and inv.expires_at < now() then return null; end if;
    if inv.max_uses is not null and inv.uses >= inv.max_uses then return null; end if;
    select * into sp from public.spaces where id = inv.space_id;
    if sp.id is null then return null; end if;
  end if;

  select count(*)::int into members from public.space_members where space_id = sp.id;

  return jsonb_build_object(
    'id', sp.id,
    'name', sp.name,
    'description', coalesce(sp.description, sp.welcome, ''),
    'icon_color', sp.icon_color,
    'icon_url', sp.icon_url,
    'banner_url', coalesce(sp.banner_url, sp.background_url),
    'vanity_code', sp.vanity_code,
    'invite_code', coalesce(nullif(raw, ''), sp.vanity_code, sp.invite_code),
    'member_count', members,
    'online_count', online
  );
end;
$$;

revoke all on function public.space_invite_preview(text) from public;
grant execute on function public.space_invite_preview(text) to anon, authenticated;

-- Staff can toggle announcement flag on text channels
create or replace function public.space_set_announcement(p_conv uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare sid uuid;
begin
  select space_id into sid from public.conversations where id = p_conv;
  if sid is null then raise exception 'Channel not found'; end if;
  if not public.is_space_staff(sid) then raise exception 'Staff only'; end if;
  update public.conversations
    set is_announcement = coalesce(p_on, false)
  where id = p_conv and kind = 'text';
end;
$$;

revoke all on function public.space_set_announcement(uuid, boolean) from public;
grant execute on function public.space_set_announcement(uuid, boolean) to authenticated;
