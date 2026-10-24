-- =====================================================================
-- Nexus — v11: reviewers (admins + moderators + Moderator badge), premium tiers & orders,
-- bots + webhooks, Audia ISRC generator, official music-video distribution requests.
-- Applied live as nexus_25_* migrations.
-- =====================================================================

-- ---------------------------------------------------------------- reviewers
insert into public.badges (key, name, icon, color, description, priority)
select 'moderator', 'Moderator', '🛡️', '#3BA55D', 'Reviews music releases', 85
where not exists (select 1 from public.badges where key = 'moderator');

create or replace function public.can_review()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.my_rank() >= 2 or exists (
    select 1 from public.user_badges ub join public.badges b on b.id = ub.badge_id
    where ub.user_id = (select auth.uid()) and ub.revoked_at is null and b.key = 'moderator');
$$;

create or replace function public.release_visible(p_release uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dist_releases r
                 where r.id = p_release and (r.owner_id = (select auth.uid()) or public.can_review()));
$$;
create policy "dist releases reviewers read" on public.dist_releases for select to authenticated using (public.can_review());
create policy "dist files reviewers read" on storage.objects for select to authenticated using (bucket_id = 'dist-files' and public.can_review());

create or replace function public.review_release(p_release uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.dist_releases;
begin
  if not public.can_review() then raise exception 'Only admins and moderators can review releases'; end if;
  select * into r from public.dist_releases where id = p_release;
  if r.id is null then raise exception 'Release not found'; end if;
  if r.status not in ('in_review', 'error') then raise exception 'Release is not waiting for review'; end if;
  perform set_config('nexus.admin_write', 'on', true);
  update public.dist_releases set status = 'changes_requested', staff_note = nullif(trim(coalesce(p_note, '')), ''),
    reviewed_by = auth.uid(), updated_at = now() where id = p_release;
  perform set_config('nexus.admin_write', 'off', true);
  perform public.log_admin(r.owner_id, 'release_changes', jsonb_build_object('release', r.title));
end;
$$;

-- reviewers can move a release to any status (manual override)
create or replace function public.set_release_status(p_release uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.dist_releases;
begin
  if not public.can_review() then raise exception 'Only admins and moderators can change the submission status'; end if;
  if p_status not in ('draft','in_review','changes_requested','sending','pending','approved','rejected','live','takedown_requested','taken_down','error') then raise exception 'Unknown status'; end if;
  select * into r from public.dist_releases where id = p_release;
  if r.id is null then raise exception 'Release not found'; end if;
  perform set_config('nexus.admin_write', 'on', true);
  update public.dist_releases set
    status = p_status,
    staff_note = case when p_status = 'changes_requested' then coalesce(nullif(trim(coalesce(p_note, '')), ''), staff_note) else staff_note end,
    rejection_reason = case when p_status = 'rejected' then coalesce(nullif(trim(coalesce(p_note, '')), ''), rejection_reason) else rejection_reason end,
    reviewed_by = auth.uid(), updated_at = now()
  where id = p_release;
  perform set_config('nexus.admin_write', 'off', true);
  perform public.log_admin(r.owner_id, 'release_status', jsonb_build_object('release', r.title, 'status', p_status));
end;
$$;

-- ---------------------------------------------------------------- premium tiers
alter table public.profiles add column if not exists premium_tier text check (premium_tier in ('lighting','premium','dist','dist_pro','dist_video'));
alter table public.profiles add column if not exists premium_until timestamptz;
alter table public.profiles add column if not exists is_bot boolean not null default false;

create or replace function public.tier_rank(t text)
returns int language sql immutable set search_path = '' as $$
  select case t when 'lighting' then 1 when 'premium' then 2 when 'dist' then 3 when 'dist_pro' then 4 when 'dist_video' then 5 else 0 end;
$$;
create or replace function public.tier_of(p_user uuid)
returns int language sql stable security definer set search_path = '' as $$
  select case when public.rank_of(p_user) >= 3 then 5
              else coalesce((select case when premium_until > now() then public.tier_rank(premium_tier) else 0 end from public.profiles where id = p_user), 0) end;
$$;
create or replace function public.my_tier()
returns int language sql stable security definer set search_path = '' as $$
  select public.tier_of((select auth.uid()));
$$;

create or replace function public.protect_profile_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('nexus.admin_write', true), '') = 'on' then return new; end if;
  if auth.uid() is null then return new; end if;
  if new.site_role is distinct from old.site_role
     or new.banned_until is distinct from old.banned_until
     or new.ban_reason is distinct from old.ban_reason
     or new.muted_until is distinct from old.muted_until
     or new.mute_reason is distinct from old.mute_reason
     or new.member_no is distinct from old.member_no
     or new.username is distinct from old.username
     or new.view_count is distinct from old.view_count
     or new.like_count is distinct from old.like_count
     or new.premium_tier is distinct from old.premium_tier
     or new.premium_until is distinct from old.premium_until
     or new.is_bot is distinct from old.is_bot
     or new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'You are not allowed to change that';
  end if;
  -- animated profile flair is a Nexus Lighting perk
  if public.my_tier() < 1 and (
       (new.profile_effect is distinct from old.profile_effect and new.profile_effect is not null and new.profile_effect <> 'none')
    or (new.profile_border is distinct from old.profile_border and new.profile_border is not null and new.profile_border <> 'none')
    or (new.profile_theme is distinct from old.profile_theme and new.profile_theme is not null and new.profile_theme <> 'none')) then
    raise exception 'Profile animations, borders and themes come with Nexus Lighting — open Premium to get it';
  end if;
  return new;
end;
$$;

create table if not exists public.premium_orders (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  tier        text not null check (tier in ('lighting','premium','dist','dist_pro','dist_video')),
  months      int not null check (months in (1, 3, 6, 12)),
  amount_usd  numeric(8, 2) not null,
  status      text not null default 'pending' check (status in ('pending','awaiting_payment','paid','fulfilled','cancelled')),
  note        text check (char_length(note) <= 500),
  handled_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists premium_orders_user_idx on public.premium_orders (user_id, created_at desc);
create index if not exists premium_orders_status_idx on public.premium_orders (status, created_at desc);
create index if not exists premium_orders_handler_idx on public.premium_orders (handled_by);
alter table public.premium_orders enable row level security;
create policy "orders read" on public.premium_orders for select to authenticated using (user_id = (select auth.uid()) or public.my_rank() >= 3);

create or replace function public.tier_price(t text)
returns numeric language sql immutable set search_path = '' as $$
  select case t when 'lighting' then 3.99 when 'premium' then 5.99 when 'dist' then 19.99 when 'dist_pro' then 49.99 when 'dist_video' then 59.99 end;
$$;
create or replace function public.tier_name(t text)
returns text language sql immutable set search_path = '' as $$
  select case t when 'lighting' then 'Nexus Lighting Sub' when 'premium' then 'Nexus Lighting Premium'
    when 'dist' then 'Nexus Lighting Premium + Music Distribution' when 'dist_pro' then 'Nexus Lighting Premium + Music Distribution Pro'
    when 'dist_video' then 'Nexus Lighting Premium + Music Distribution Pro + Official Music Video Distribution' end;
$$;

-- ---------------------------------------------------------------- bots (system accounts that can't sign in)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', b.id, 'authenticated', 'authenticated', b.email, '', '{"provider":"bot","providers":["bot"]}'::jsonb,
       jsonb_build_object('username', b.username, 'display_name', b.display_name), now(), now()
from (values
  ('00000000-0000-4000-8000-00000000b001'::uuid, 'nexusbot@bots.nexus.invalid', 'nexusbot', 'Nexus Bot'),
  ('00000000-0000-4000-8000-00000000b002'::uuid, 'orderbot@bots.nexus.invalid', 'orderbot', 'Order Bot'),
  ('00000000-0000-4000-8000-00000000b003'::uuid, 'musicbot@bots.nexus.invalid', 'musicbot', 'Music Bot')
) as b(id, email, username, display_name)
where not exists (select 1 from auth.users u where u.id = b.id);

update public.profiles set is_bot = true,
  avatar_color = case id when '00000000-0000-4000-8000-00000000b001' then '#5865F2' when '00000000-0000-4000-8000-00000000b002' then '#3BA55D' else '#EB459E' end,
  bio = case id when '00000000-0000-4000-8000-00000000b001' then 'Type /help in any chat.' when '00000000-0000-4000-8000-00000000b002' then 'Premium orders & receipts.' else 'Music commands: /isrc /song /upc' end
where id in ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-00000000b003');

-- display name override for webhook / bot posts
alter table public.messages add column if not exists bot_name text check (char_length(bot_name) <= 80);
create or replace function public.guard_bot_name()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and coalesce(current_setting('nexus.admin_write', true), '') <> 'on' then new.bot_name := null; end if;
  return new;
end;
$$;
create trigger messages_guard_bot_name before insert on public.messages for each row execute function public.guard_bot_name();

-- internal: DM between any two users (bots, orders) — not callable by clients
create or replace function public.dm_between(a uuid, b uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  conv uuid;
begin
  select c.id into conv from public.conversations c
  join public.conversation_members x on x.conversation_id = c.id and x.user_id = a
  join public.conversation_members y on y.conversation_id = c.id and y.user_id = b
  where c.kind = 'dm' limit 1;
  if conv is null then
    insert into public.conversations (kind, created_by) values ('dm', a) returning id into conv;
    insert into public.conversation_members (conversation_id, user_id) values (conv, a), (conv, b);
  end if;
  return conv;
end;
$$;
create or replace function public.bot_say(p_bot uuid, p_conv uuid, p_text text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  mid uuid;
begin
  insert into public.messages (conversation_id, author_id, content) values (p_conv, p_bot, left(p_text, 4000)) returning id into mid;
  return mid;
end;
$$;
create or replace function public.seller_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce((select id from public.profiles where username = 'qyopy'), (select id from public.profiles where site_role = 'owner' order by created_at limit 1));
$$;

-- ---------------------------------------------------------------- buying a plan
create or replace function public.create_order(p_tier text, p_months int default 1)
returns json language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  seller uuid := public.seller_id();
  amt numeric;
  oid bigint;
  conv uuid;
  bconv uuid;
  uname text;
  hook text;
  bot uuid := '00000000-0000-4000-8000-00000000b002';
begin
  if me is null then raise exception 'Sign in first'; end if;
  if public.is_banned() then raise exception 'You are banned'; end if;
  if me = seller then raise exception 'You own the shop 🙂'; end if;
  if public.tier_price(p_tier) is null or p_months not in (1, 3, 6, 12) then raise exception 'Pick a plan'; end if;
  if (select count(*) from public.premium_orders where user_id = me and status in ('pending', 'awaiting_payment')) >= 3 then
    raise exception 'You already have open orders — finish or cancel those first';
  end if;
  amt := round(public.tier_price(p_tier) * p_months, 2);
  insert into public.premium_orders (user_id, tier, months, amount_usd) values (me, p_tier, p_months, amt) returning id into oid;
  select '@' || username into uname from public.profiles where id = me;

  -- friend request to the seller (unless already connected)
  if not exists (select 1 from public.friendships where (requester_id = me and addressee_id = seller) or (requester_id = seller and addressee_id = me)) then
    insert into public.friendships (requester_id, addressee_id, status) values (me, seller, 'pending');
  end if;

  -- buyer → seller auto message
  conv := public.dm_between(me, seller);
  insert into public.messages (conversation_id, author_id, content)
  values (conv, me, format('Hi! I''d like to buy %s for %s month%s — $%s. (Order #%s) 🛒', public.tier_name(p_tier), p_months, case when p_months > 1 then 's' else '' end, amt, oid));

  -- Order Bot → seller: fulfil
  perform public.bot_say(bot, public.dm_between(bot, seller), format(
    E'🧾 New order #%s\n%s wants %s · %s month%s · $%s\n1) Send them your PayPal address privately in your chat\n2) When the money arrives: Studio → Orders → Mark paid → Activate',
    oid, uname, public.tier_name(p_tier), p_months, case when p_months > 1 then 's' else '' end, amt));
  -- Order Bot → buyer: how to pay
  bconv := public.dm_between(bot, me);
  perform public.bot_say(bot, bconv, format(
    E'Thanks for your order #%s! 💜\n%s · %s month%s · $%s\nqyopy will send you the PayPal address privately in your chat. Send exactly $%s and put "Order #%s" in the note. Your plan turns on as soon as the payment is confirmed — I''ll message you here.',
    oid, public.tier_name(p_tier), p_months, case when p_months > 1 then 's' else '' end, amt, amt, oid));

  -- optional outgoing webhook (e.g. a Discord channel)
  select value into hook from public.dist_settings where key = 'order_webhook';
  if hook is not null and hook like 'https://%' then
    perform net.http_post(url := hook, headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('content', format('🧾 New Nexus order #%s — %s · %s · %s mo · $%s', oid, uname, public.tier_name(p_tier), p_months, amt), 'username', 'Nexus Orders'));
  end if;
  return json_build_object('order_id', oid, 'amount', amt, 'conversation_id', conv, 'bot_conversation_id', bconv);
exception when unique_violation then
  raise exception 'Could not create the order, try again';
end;
$$;

create or replace function public.cancel_my_order(p_order bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.premium_orders set status = 'cancelled', updated_at = now()
  where id = p_order and user_id = auth.uid() and status in ('pending', 'awaiting_payment');
  if not found then raise exception 'Order can''t be cancelled'; end if;
end;
$$;

-- shop owner / admins move orders along; "fulfilled" switches the plan on
create or replace function public.set_order_status(p_order bigint, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  o public.premium_orders;
  bot uuid := '00000000-0000-4000-8000-00000000b002';
  until timestamptz;
  msg text;
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  if p_status not in ('pending','awaiting_payment','paid','fulfilled','cancelled') then raise exception 'Unknown status'; end if;
  select * into o from public.premium_orders where id = p_order;
  if o.id is null then raise exception 'Order not found'; end if;
  update public.premium_orders set status = p_status, note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note), handled_by = auth.uid(), updated_at = now() where id = p_order;
  if p_status = 'fulfilled' and o.status <> 'fulfilled' then
    perform set_config('nexus.admin_write', 'on', true);
    update public.profiles set
      premium_tier = case when premium_until > now() and public.tier_rank(premium_tier) > public.tier_rank(o.tier) then premium_tier else o.tier end,
      premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(days => 30 * o.months)
    where id = o.user_id returning premium_until into until;
    perform set_config('nexus.admin_write', 'off', true);
    msg := format(E'✅ Order #%s is complete — %s is active until %s. Enjoy! ⚡', o.id, public.tier_name(o.tier), to_char(until, 'YYYY-MM-DD'));
  elsif p_status = 'paid' then
    msg := format('💸 Payment for order #%s received — activating your plan now.', o.id);
  elsif p_status = 'awaiting_payment' then
    msg := format('⏳ Order #%s is waiting for your payment of $%s (PayPal details are in your chat with qyopy).', o.id, o.amount_usd);
  elsif p_status = 'cancelled' then
    msg := format('❌ Order #%s was cancelled.%s', o.id, coalesce(' ' || nullif(trim(coalesce(p_note, '')), ''), ''));
  end if;
  if msg is not null then perform public.bot_say(bot, public.dm_between(bot, o.user_id), msg); end if;
end;
$$;

create or replace function public.grant_premium(p_user uuid, p_tier text, p_days int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  perform set_config('nexus.admin_write', 'on', true);
  update public.profiles set premium_tier = case when p_days > 0 then p_tier else null end,
    premium_until = case when p_days > 0 then greatest(coalesce(premium_until, now()), now()) + make_interval(days => p_days) else null end
  where id = p_user;
  perform set_config('nexus.admin_write', 'off', true);
  perform public.log_admin(p_user, 'premium', jsonb_build_object('tier', p_tier, 'days', p_days));
end;
$$;

-- ---------------------------------------------------------------- paid feature gates
create or replace function public.submit_release(p_release uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.dist_releases;
  n int;
begin
  select * into r from public.dist_releases where id = p_release;
  if r.id is null or r.owner_id <> auth.uid() then raise exception 'Release not found'; end if;
  if public.my_tier() < 3 then raise exception 'Sending releases to stores needs Nexus Lighting Premium + Music Distribution — open Premium to upgrade'; end if;
  if r.status not in ('draft', 'changes_requested', 'rejected') then raise exception 'This release is already submitted'; end if;
  if r.artwork_path is null then raise exception 'Add cover artwork (3000×3000 JPG or PNG)'; end if;
  select count(*) into n from public.dist_tracks where release_id = p_release;
  if n = 0 then raise exception 'Add at least one track'; end if;
  if exists (select 1 from public.dist_tracks where release_id = p_release and audio_path is null) then
    raise exception 'Every track needs a WAV or FLAC file';
  end if;
  if r.release_type = 'Single' and n > 3 then raise exception 'A single can have up to 3 tracks — choose EP or Album'; end if;
  perform set_config('nexus.admin_write', 'on', true);
  update public.dist_releases set status = 'in_review', submitted_at = now(), updated_at = now() where id = p_release;
  perform set_config('nexus.admin_write', 'off', true);
end;
$$;

create or replace function public.shield_quota()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t int := public.tier_of(new.owner_id);
  n int;
begin
  if t < 2 then raise exception 'Shield 360 comes with Nexus Lighting Premium — open Premium to get it'; end if;
  select count(*) into n from public.shield_works where owner_id = new.owner_id;
  if t = 2 and n >= 10 then raise exception 'Premium protects up to 10 songs — upgrade for more'; end if;
  if t = 3 and n >= 25 then raise exception 'Music Distribution protects up to 25 songs — Pro is unlimited'; end if;
  return new;
end;
$$;
create trigger shield_works_quota before insert on public.shield_works for each row execute function public.shield_quota();

create policy "smart links need distribution" on public.smart_links as restrictive for insert to authenticated with check (public.my_tier() >= 3);

-- official music video distribution requests (top tier)
alter table public.videos add column if not exists mv_status text check (mv_status in ('requested','approved','rejected','live'));
alter table public.videos add column if not exists mv_note text check (char_length(mv_note) <= 500);
create or replace function public.protect_video_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('nexus.admin_write', true), '') = 'on' then return new; end if;
  if auth.uid() is null then return new; end if;
  if new.views is distinct from old.views or new.likes is distinct from old.likes or new.dislikes is distinct from old.dislikes
     or new.comment_count is distinct from old.comment_count or new.owner_id is distinct from old.owner_id
     or new.removed_at is distinct from old.removed_at or new.mv_status is distinct from old.mv_status or new.mv_note is distinct from old.mv_note then
    raise exception 'Not allowed';
  end if;
  if new.visibility <> 'private' and new.status = 'ready' and new.published_at is null then
    new.published_at := greatest(now(), coalesce(new.publish_at, now()));
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create or replace function public.request_mv_distribution(p_video uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v record;
  bot uuid := '00000000-0000-4000-8000-00000000b002';
begin
  select id, title, owner_id, mv_status into v from public.videos where id = p_video;
  if v.id is null or v.owner_id <> auth.uid() then raise exception 'Not your video'; end if;
  if public.my_tier() < 5 then raise exception 'Official music video distribution is in the top plan — open Premium'; end if;
  if v.mv_status in ('requested', 'approved', 'live') then raise exception 'Already requested'; end if;
  perform set_config('nexus.admin_write', 'on', true);
  update public.videos set mv_status = 'requested', mv_note = null where id = p_video;
  perform set_config('nexus.admin_write', 'off', true);
  perform public.bot_say(bot, public.dm_between(bot, public.seller_id()), format(E'🎬 Music video distribution request\n"%s" by @%s — review it in Studio → Orders.', v.title, (select username from public.profiles where id = v.owner_id)));
end;
$$;
create or replace function public.set_mv_status(p_video uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v record;
  bot uuid := '00000000-0000-4000-8000-00000000b002';
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  if p_status not in ('requested','approved','rejected','live') then raise exception 'Unknown status'; end if;
  select id, title, owner_id into v from public.videos where id = p_video;
  if v.id is null then raise exception 'Video not found'; end if;
  perform set_config('nexus.admin_write', 'on', true);
  update public.videos set mv_status = p_status, mv_note = nullif(trim(coalesce(p_note, '')), '') where id = p_video;
  perform set_config('nexus.admin_write', 'off', true);
  perform public.bot_say(bot, public.dm_between(bot, v.owner_id), format('🎬 Your music video "%s" — distribution %s.%s', v.title, p_status, coalesce(' ' || nullif(trim(coalesce(p_note, '')), ''), '')));
end;
$$;

-- ---------------------------------------------------------------- Audia ISRC generator (prefix QT6HV)
create table if not exists public.isrc_codes (
  code        text primary key check (code ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'),
  yy          int not null,
  seq         int not null,
  title       text check (char_length(title) <= 200),
  artist      text check (char_length(artist) <= 200),
  assigned_to uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists isrc_codes_user_idx on public.isrc_codes (assigned_to, created_at desc);
create index if not exists isrc_codes_year_idx on public.isrc_codes (yy, seq desc);
alter table public.isrc_codes enable row level security;
create policy "isrc read" on public.isrc_codes for select to authenticated using (assigned_to = (select auth.uid()) or public.can_review());

create or replace function public.isrc_config()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'prefix', coalesce((select value from public.dist_settings where key = 'isrc_prefix'), 'QT6HV'),
    'next', coalesce((select value from public.dist_settings where key = 'isrc_next'), '1'),
    'allowed', public.my_tier() >= 3 or public.can_review());
$$;
create or replace function public.set_isrc_config(p_prefix text, p_next int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  if p_prefix !~ '^[A-Z]{2}[A-Z0-9]{3}$' then raise exception 'Prefix looks like QT6HV (country + registrant)'; end if;
  if p_next < 1 or p_next > 99999 then raise exception 'Next number is 1–99999'; end if;
  insert into public.dist_settings (key, value) values ('isrc_prefix', p_prefix), ('isrc_next', p_next::text)
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;
create or replace function public.generate_isrc(p_title text default null, p_artist text default null, p_count int default 1)
returns setof public.isrc_codes language plpgsql security definer set search_path = '' as $$
declare
  pre text := coalesce((select value from public.dist_settings where key = 'isrc_prefix'), 'QT6HV');
  v_yy int := extract(year from now())::int % 100;
  s int;
  c text;
  made int := 0;
begin
  if not (public.my_tier() >= 3 or public.can_review()) then raise exception 'Audia ISRC codes come with Music Distribution — open Premium'; end if;
  if p_count < 1 or p_count > 50 then raise exception 'Generate 1–50 codes at a time'; end if;
  perform pg_advisory_xact_lock(hashtext('nexus-isrc'));
  s := greatest(coalesce((select max(seq) from public.isrc_codes where isrc_codes.yy = v_yy and code like pre || '%'), 0) + 1,
                coalesce((select value::int from public.dist_settings where key = 'isrc_next'), 1));
  while made < p_count loop
    if s > 99999 then raise exception 'No ISRC numbers left for this year'; end if;
    c := pre || lpad(v_yy::text, 2, '0') || lpad(s::text, 5, '0');
    if not exists (select 1 from public.isrc_codes where isrc_codes.code = c) and not exists (select 1 from public.dist_tracks where isrc = c) then
      insert into public.isrc_codes (code, yy, seq, title, artist, assigned_to) values (c, v_yy, s, nullif(trim(coalesce(p_title, '')), ''), nullif(trim(coalesce(p_artist, '')), ''), auth.uid());
      made := made + 1;
      return query select * from public.isrc_codes where isrc_codes.code = c;
    end if;
    s := s + 1;
  end loop;
end;
$$;

-- ---------------------------------------------------------------- chat webhooks
create table if not exists public.chat_webhooks (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  created_by      uuid not null references public.profiles (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),
  token           text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  uses            int not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists chat_webhooks_conv_idx on public.chat_webhooks (conversation_id);
create index if not exists chat_webhooks_creator_idx on public.chat_webhooks (created_by);
alter table public.chat_webhooks enable row level security;
create policy "webhooks read" on public.chat_webhooks for select to authenticated using (public.is_conversation_member(conversation_id));
create policy "webhooks insert" on public.chat_webhooks for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_conversation_member(conversation_id) and not public.is_banned());
create policy "webhooks remove" on public.chat_webhooks for delete to authenticated using (created_by = (select auth.uid()) or public.my_rank() >= 3);

-- ---------------------------------------------------------------- grants
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.expired_messages(int) from authenticated;
revoke execute on function public.dm_between(uuid, uuid) from authenticated;
revoke execute on function public.bot_say(uuid, uuid, text) from authenticated;
