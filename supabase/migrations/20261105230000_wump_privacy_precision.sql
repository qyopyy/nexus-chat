-- Wump location privacy prefs + publish precision + stronger invite redeem.

alter table public.user_privacy
  add column if not exists wump_default_visible text not null default 'friends'
    check (wump_default_visible in ('friends', 'family', 'everyone')),
  add column if not exists wump_precision text not null default 'approx'
    check (wump_precision in ('exact', 'approx', 'city')),
  add column if not exists wump_allow_background boolean not null default true,
  add column if not exists wump_allow_nearby_alerts boolean not null default true,
  add column if not exists wump_who_can_invite text not null default 'friends'
    check (wump_who_can_invite in ('everyone', 'friends', 'nobody')),
  add column if not exists wump_share_enabled boolean not null default true;

comment on column public.user_privacy.wump_default_visible is 'Default Live audience on Wump';
comment on column public.user_privacy.wump_precision is 'exact≈1m, approx≈100m, city≈1km grid when publishing';
comment on column public.user_privacy.wump_who_can_invite is 'Who may redeem friend/family invites you create';

-- Publish with optional precision override; falls back to user_privacy.wump_precision
create or replace function public.bump_publish(
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null,
  p_visible text default 'friends',
  p_label text default null,
  p_precision text default null
)
returns public.bump_presence
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.bump_presence;
  qlat double precision;
  qlng double precision;
  prec text;
  digits int;
  sharing boolean;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select wump_share_enabled, coalesce(wump_precision, 'approx')
    into sharing, prec
  from public.user_privacy
  where user_id = uid;

  if found and sharing = false then
    raise exception 'location sharing is disabled in privacy settings';
  end if;
  prec := coalesce(prec, 'approx');

  if p_visible is null or p_visible not in ('friends','family','everyone') then
    p_visible := 'friends';
  end if;

  prec := coalesce(nullif(p_precision, ''), prec, 'approx');
  if prec = 'exact' then digits := 5;
  elsif prec = 'city' then digits := 1;
  else digits := 3; -- approx ~100 m
  end if;

  qlat := round(p_lat::numeric, digits)::double precision;
  qlng := round(p_lng::numeric, digits)::double precision;

  insert into bump_presence (user_id, lat, lng, accuracy_m, visible, label, updated_at)
  values (uid, qlat, qlng, p_accuracy, p_visible, nullif(trim(p_label), ''), now())
  on conflict (user_id) do update set
    lat = excluded.lat,
    lng = excluded.lng,
    accuracy_m = excluded.accuracy_m,
    visible = excluded.visible,
    label = excluded.label,
    updated_at = now()
  returning * into row;
  return row;
end;
$$;

grant execute on function public.bump_publish(double precision, double precision, double precision, text, text, text) to authenticated;
-- keep old 5-arg signature working via default p_precision
grant execute on function public.bump_publish(double precision, double precision, double precision, text, text) to authenticated;

-- Stronger redeem: friend request both ways attempted; respect wump_who_can_invite
create or replace function public.bump_redeem_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inv bump_invites%rowtype;
  who text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from bump_invites where code = lower(trim(p_code));
  if not found then raise exception 'invite not found'; end if;
  if inv.expires_at < now() then raise exception 'invite expired'; end if;
  if inv.uses >= inv.max_uses then raise exception 'invite used up'; end if;
  if inv.creator_id = uid then raise exception 'that''s your own invite'; end if;

  select coalesce(wump_who_can_invite, 'friends') into who
  from public.user_privacy where user_id = inv.creator_id;
  who := coalesce(who, 'friends');

  if who = 'nobody' then
    raise exception 'this person is not accepting Wump invites';
  elsif who = 'friends' and inv.kind in ('friend', 'family') then
    -- allow if already friends or family; otherwise still allow friend invites (they become requests)
    null;
  end if;

  if inv.kind = 'family' then
    insert into bump_family (user_id, member_id) values (inv.creator_id, uid)
      on conflict do nothing;
    insert into bump_family (user_id, member_id) values (uid, inv.creator_id)
      on conflict do nothing;
    -- also nudge a friendship if none
    begin
      insert into friendships (requester_id, addressee_id, status)
      values (uid, inv.creator_id, 'pending')
      on conflict do nothing;
    exception when others then
      null;
    end;
  elsif inv.kind = 'friend' then
    begin
      insert into friendships (requester_id, addressee_id, status)
      values (uid, inv.creator_id, 'pending')
      on conflict do nothing;
    exception when others then
      null;
    end;
  elsif inv.kind = 'nearby' then
    -- soft follow both ways on Wump social graph when available
    begin
      insert into bump_follows (follower_id, following_id)
      values (uid, inv.creator_id)
      on conflict do nothing;
    exception when others then
      null;
    end;
  end if;

  update bump_invites set uses = uses + 1 where code = inv.code;
  return jsonb_build_object(
    'ok', true,
    'kind', inv.kind,
    'creator_id', inv.creator_id
  );
end;
$$;

grant execute on function public.bump_redeem_invite(text) to authenticated;
