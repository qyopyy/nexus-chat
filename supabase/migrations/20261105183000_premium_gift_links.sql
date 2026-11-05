-- Nitro-style premium gift links: admins mint a claim URL; recipients redeem once (or N times).

create table if not exists public.premium_gifts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  tier text not null check (tier in ('lighting','premium','dist','dist_pro','dist_video')),
  days int not null check (days > 0 and days <= 3650),
  max_claims int not null default 1 check (max_claims > 0 and max_claims <= 1000),
  claims int not null default 0 check (claims >= 0),
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists premium_gifts_code_idx on public.premium_gifts (code);
create index if not exists premium_gifts_created_idx on public.premium_gifts (created_at desc);

create table if not exists public.premium_gift_claims (
  id bigserial primary key,
  gift_id uuid not null references public.premium_gifts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  unique (gift_id, user_id)
);

alter table public.premium_gifts enable row level security;
alter table public.premium_gift_claims enable row level security;

drop policy if exists "premium gifts staff read" on public.premium_gifts;
create policy "premium gifts staff read" on public.premium_gifts for select to authenticated
  using (public.my_rank() >= 3 or created_by = auth.uid());

drop policy if exists "premium gift claims own read" on public.premium_gift_claims;
create policy "premium gift claims own read" on public.premium_gift_claims for select to authenticated
  using (user_id = auth.uid() or public.my_rank() >= 3);

-- Public preview (anon + authenticated) — no claim
create or replace function public.premium_gift_preview(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g public.premium_gifts;
  code text := lower(trim(p_code));
begin
  if code is null or code = '' then return null; end if;
  select * into g from public.premium_gifts where premium_gifts.code = code;
  if g.id is null then return null; end if;
  return jsonb_build_object(
    'code', g.code,
    'tier', g.tier,
    'days', g.days,
    'max_claims', g.max_claims,
    'claims', g.claims,
    'expires_at', g.expires_at,
    'remaining', greatest(g.max_claims - g.claims, 0),
    'expired', (g.expires_at is not null and g.expires_at < now()),
    'exhausted', g.claims >= g.max_claims
  );
end;
$$;

grant execute on function public.premium_gift_preview(text) to anon, authenticated;

create or replace function public.create_premium_gift(
  p_tier text,
  p_days int,
  p_max_claims int default 1,
  p_expires_days int default 30,
  p_note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  code text;
  gid uuid;
  exp timestamptz;
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  if p_tier not in ('lighting','premium','dist','dist_pro','dist_video') then raise exception 'Bad tier'; end if;
  if p_days is null or p_days < 1 or p_days > 3650 then raise exception 'Days must be 1–3650'; end if;
  if p_max_claims is null or p_max_claims < 1 or p_max_claims > 1000 then raise exception 'Max claims 1–1000'; end if;
  code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  exp := case when p_expires_days is null or p_expires_days <= 0 then null
              else now() + make_interval(days => p_expires_days) end;
  insert into public.premium_gifts (code, tier, days, max_claims, expires_at, created_by, note)
  values (code, p_tier, p_days, p_max_claims, exp, auth.uid(), nullif(trim(p_note), ''))
  returning id into gid;
  perform public.log_admin(auth.uid(), 'premium_gift_create', jsonb_build_object('code', code, 'tier', p_tier, 'days', p_days, 'max', p_max_claims));
  return jsonb_build_object('id', gid, 'code', code, 'path', '/gift/' || code);
end;
$$;

grant execute on function public.create_premium_gift(text, int, int, int, text) to authenticated;

create or replace function public.redeem_premium_gift(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g public.premium_gifts;
  code text := lower(trim(p_code));
  until_ts timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in to claim this gift'; end if;
  if code is null or code = '' then raise exception 'Missing gift code'; end if;
  select * into g from public.premium_gifts where premium_gifts.code = code for update;
  if g.id is null then raise exception 'Gift not found'; end if;
  if g.expires_at is not null and g.expires_at < now() then raise exception 'This gift link has expired'; end if;
  if g.claims >= g.max_claims then raise exception 'This gift has already been claimed'; end if;
  if exists (select 1 from public.premium_gift_claims where gift_id = g.id and user_id = auth.uid()) then
    raise exception 'You already claimed this gift';
  end if;

  perform set_config('nexus.admin_write', 'on', true);
  update public.profiles set
    premium_tier = case
      when premium_until > now() and public.tier_rank(premium_tier) > public.tier_rank(g.tier) then premium_tier
      else g.tier end,
    premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(days => g.days)
  where id = auth.uid()
  returning premium_until into until_ts;

  insert into public.premium_gift_claims (gift_id, user_id) values (g.id, auth.uid());
  update public.premium_gifts set claims = claims + 1 where id = g.id;
  perform set_config('nexus.admin_write', 'off', true);

  perform public.log_admin(auth.uid(), 'premium_gift_redeem', jsonb_build_object('code', code, 'tier', g.tier, 'days', g.days));
  return jsonb_build_object('ok', true, 'tier', g.tier, 'days', g.days, 'until', until_ts);
end;
$$;

grant execute on function public.redeem_premium_gift(text) to authenticated;

create or replace function public.list_premium_gifts()
returns setof public.premium_gifts language plpgsql security definer set search_path = '' as $$
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  return query select * from public.premium_gifts order by created_at desc limit 100;
end;
$$;

grant execute on function public.list_premium_gifts() to authenticated;
