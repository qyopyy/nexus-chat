-- Independent Nexus pre-save campaigns: no plan, release-distribution or count quota.
-- Public data is exposed through a narrow projection; fan tokens are service-role only.
begin;

create or replace function public.presave_valid_https(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p is null or (char_length(p) <= 2048 and p ~ '^https://[^/@[:space:]<>"\\]+([/?#][^[:space:]<>"\\]*)?$');
$$;

create or replace function public.presave_valid_links(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return false; end if;
  if jsonb_array_length(p) > 12 then return false; end if;
  for item in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(item) <> 'object'
      or jsonb_typeof(item->'label') is distinct from 'string'
      or char_length(btrim(item->>'label')) not between 1 and 60
      or jsonb_typeof(item->'url') is distinct from 'string'
      or not public.presave_valid_https(item->>'url') then return false;
    end if;
  end loop;
  return true;
end;
$$;

-- Verified sessions still need their second factor when the Nexus account has one.
create or replace function public.presave_owner(p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() = p_owner and (
    auth.jwt()->>'aal' = 'aal2' or not exists (
      select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified'
    )
  );
$$;

create table public.presave_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (char_length(slug) between 3 and 64 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and slug not in ('admin','api','app','auth','callback','config','dashboard','login','new','presave','settings')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  artist text not null check (char_length(btrim(artist)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1200),
  release_at timestamptz,
  artwork_url text check (public.presave_valid_https(artwork_url)),
  theme text not null default 'midnight' check (theme in ('midnight','paper','aurora','sunset')),
  layout text not null default 'centered' check (layout in ('centered','split')),
  accent text not null default '#a78bfa' check (accent ~ '^#[0-9a-fA-F]{6}$'),
  button_label text not null default 'Pre-save on Spotify' check (char_length(btrim(button_label)) between 1 and 40),
  spotify_uri text check (spotify_uri ~ '^spotify:(track|album):[A-Za-z0-9]{22}$'),
  links jsonb not null default '[]' check (public.presave_valid_links(links)),
  show_countdown boolean not null default true,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (spotify_uri is null or release_at is not null),
  check (release_at is null or isfinite(release_at))
);
create index presave_campaign_owner_created on public.presave_campaigns(owner_id, created_at desc, id);
alter table public.presave_campaigns enable row level security;
revoke all on public.presave_campaigns from anon, authenticated;
grant select, insert, update, delete on public.presave_campaigns to authenticated;
grant all on public.presave_campaigns to service_role;
create policy "campaign owners only" on public.presave_campaigns for all to authenticated
  using (public.presave_owner(owner_id)) with check (public.presave_owner(owner_id));

create table public.presave_metrics (
  campaign_id uuid primary key references public.presave_campaigns(id) on delete cascade,
  views bigint not null default 0 check (views >= 0),
  clicks bigint not null default 0 check (clicks >= 0)
);
alter table public.presave_metrics enable row level security;
revoke all on public.presave_metrics from public, anon, authenticated;
grant all on public.presave_metrics to service_role;

create table public.presave_authorizations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.presave_campaigns(id) on delete cascade,
  spotify_user_hash text not null check (spotify_user_hash ~ '^[a-f0-9]{64}$'),
  target_uri text not null check (target_uri ~ '^spotify:(track|album):[A-Za-z0-9]{22}$'),
  scheduled_for timestamptz not null check (isfinite(scheduled_for)),
  refresh_token_ciphertext text,
  status text not null default 'pending' check (status in ('pending','processing','saved','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  claim_token uuid,
  cancel_hash text not null unique check (cancel_hash ~ '^[a-f0-9]{64}$'),
  token_expires_at timestamptz not null default (now() + interval '6 months'),
  consented_at timestamptz not null default now(),
  saved_at timestamptz,
  error_code text,
  unique (campaign_id, spotify_user_hash),
  check (status not in ('pending','processing') or refresh_token_ciphertext is not null)
);
create index presave_due on public.presave_authorizations(status, next_attempt_at, scheduled_for);
create index presave_authorization_campaign on public.presave_authorizations(campaign_id, status);
alter table public.presave_authorizations enable row level security;
revoke all on public.presave_authorizations from public, anon, authenticated;
grant all on public.presave_authorizations to service_role;

create table public.presave_oauth_states (
  ticket_hash text primary key check (ticket_hash ~ '^[a-f0-9]{64}$'),
  state_hash text unique check (state_hash ~ '^[a-f0-9]{64}$'),
  browser_hash text check (browser_hash ~ '^[a-f0-9]{64}$'),
  verifier_ciphertext text not null,
  campaign_id uuid not null references public.presave_campaigns(id) on delete cascade,
  target_uri text not null check (target_uri ~ '^spotify:(track|album):[A-Za-z0-9]{22}$'),
  scheduled_for timestamptz not null,
  return_url text not null check (public.presave_valid_https(return_url)),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);
create index presave_oauth_expiry on public.presave_oauth_states(expires_at);
alter table public.presave_oauth_states enable row level security;
revoke all on public.presave_oauth_states from public, anon, authenticated;
grant all on public.presave_oauth_states to service_role;

create table public.presave_rate_buckets (
  key text not null check (char_length(key) <= 100),
  bucket timestamptz not null,
  hits integer not null default 1,
  primary key (key, bucket)
);
alter table public.presave_rate_buckets enable row level security;
revoke all on public.presave_rate_buckets from public, anon, authenticated;
grant all on public.presave_rate_buckets to service_role;

create or replace function public.presave_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id or new.id is distinct from old.id then
    raise exception 'Campaign ownership cannot be transferred' using errcode = '23514';
  end if;
  -- Fans authorized this specific recording. Create a new campaign for another.
  if new.spotify_uri is distinct from old.spotify_uri and exists (
    select 1 from public.presave_authorizations where campaign_id = old.id
  ) then
    raise exception 'Spotify recording is locked after the first pre-save; duplicate the campaign for a different release' using errcode = '23514';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
create trigger presave_update before update on public.presave_campaigns for each row execute function public.presave_before_update();

create or replace function public.presave_public(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'slug', c.slug, 'title', c.title, 'artist', c.artist, 'description', c.description,
    'release_at', c.release_at, 'artwork_url', c.artwork_url, 'theme', c.theme,
    'layout', c.layout, 'accent', c.accent, 'button_label', c.button_label,
    'spotify_uri', c.spotify_uri, 'links', c.links, 'show_countdown', c.show_countdown
  ) from public.presave_campaigns c where c.slug = p_slug and c.published;
$$;

create or replace function public.presave_list(p_owner uuid, p_page int default 1, p_page_size int default 12, p_search text default '', p_status text default 'all')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; total bigint; summary jsonb; size int := greatest(1, least(50, p_page_size)); page int := greatest(1, least(1000000, p_page));
begin
  select count(*) into total from public.presave_campaigns c where c.owner_id = p_owner
    and (p_search = '' or strpos(lower(c.title || ' ' || c.artist || ' ' || c.slug), lower(left(p_search,120))) > 0)
    and (p_status = 'all' or (p_status = 'published' and c.published) or (p_status = 'draft' and not c.published));
  select coalesce(jsonb_agg(to_jsonb(page_row) order by page_row.created_at desc, page_row.id), '[]') into result from (
    select c.*, jsonb_build_object(
      'views', coalesce(m.views,0), 'clicks', coalesce(m.clicks,0),
      'pre_saves', (select count(*) from public.presave_authorizations a where a.campaign_id = c.id and a.status in ('pending','processing','saved')),
      'saved', (select count(*) from public.presave_authorizations a where a.campaign_id = c.id and a.status = 'saved'),
      'failed', (select count(*) from public.presave_authorizations a where a.campaign_id = c.id and a.status = 'failed')
    ) as stats
    from public.presave_campaigns c left join public.presave_metrics m on m.campaign_id = c.id
    where c.owner_id = p_owner
      and (p_search = '' or strpos(lower(c.title || ' ' || c.artist || ' ' || c.slug), lower(left(p_search,120))) > 0)
      and (p_status = 'all' or (p_status = 'published' and c.published) or (p_status = 'draft' and not c.published))
    order by c.created_at desc, c.id limit size offset ((page::bigint - 1) * size)
  ) page_row;
  select jsonb_build_object(
    'campaigns', count(*), 'published', count(*) filter (where c.published),
    'views', coalesce(sum(m.views),0),
    'pre_saves', (select count(*) from public.presave_authorizations a join public.presave_campaigns ca on ca.id = a.campaign_id where ca.owner_id = p_owner and a.status in ('pending','processing','saved'))
  ) into summary from public.presave_campaigns c left join public.presave_metrics m on m.campaign_id = c.id where c.owner_id = p_owner;
  return jsonb_build_object('campaigns',result,'total',total,'page',page,'page_size',size,'summary',summary);
end;
$$;

create or replace function public.presave_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n int; start_at timestamptz;
begin
  if char_length(p_key) > 100 or p_limit not between 1 and 1000 or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit';
  end if;
  start_at := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.presave_rate_buckets as b (key,bucket,hits) values (p_key,start_at,1)
    on conflict (key,bucket) do update set hits = least(b.hits + 1, p_limit + 1) returning hits into n;
  return n <= p_limit;
end;
$$;

create or replace function public.presave_record_event(p_campaign uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_kind not in ('view','click') then raise exception 'Invalid event'; end if;
  insert into public.presave_metrics as m (campaign_id,views,clicks)
    select id, case when p_kind='view' then 1 else 0 end, case when p_kind='click' then 1 else 0 end
    from public.presave_campaigns where id=p_campaign and published
    on conflict (campaign_id) do update set views=m.views+excluded.views, clicks=m.clicks+excluded.clicks;
end;
$$;

create or replace function public.presave_accept_authorization(p_campaign uuid, p_user_hash text, p_target text, p_scheduled_for timestamptz, p_token text, p_cancel_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare c public.presave_campaigns; result text;
begin
  select * into c from public.presave_campaigns where id=p_campaign for update;
  if c.id is null or not c.published or c.spotify_uri is distinct from p_target then
    raise exception 'Campaign is no longer available' using errcode='23514';
  end if;
  insert into public.presave_authorizations as a (campaign_id,spotify_user_hash,target_uri,scheduled_for,refresh_token_ciphertext,cancel_hash)
    values (c.id,p_user_hash,p_target,p_scheduled_for,p_token,p_cancel_hash)
    on conflict (campaign_id,spotify_user_hash) do update set
      status=case when a.status='saved' then 'saved' else 'pending' end,
      refresh_token_ciphertext=case when a.status='saved' then null else excluded.refresh_token_ciphertext end,
      target_uri=excluded.target_uri,scheduled_for=excluded.scheduled_for,cancel_hash=excluded.cancel_hash,
      attempts=0,next_attempt_at=now(),lease_until=null,claim_token=null,error_code=null,
      consented_at=now(),token_expires_at=now()+interval '6 months'
    returning status into result;
  return result;
end;
$$;

-- The scheduler is bounded per invocation, not per user. No campaign count cap.
-- A unique lease prevents two workers from claiming the same due authorization.
create or replace function public.presave_claim_due(p_limit int default 10)
returns setof public.presave_authorizations language plpgsql security definer set search_path = '' as $$
begin
  delete from public.presave_oauth_states where expires_at < now();
  delete from public.presave_rate_buckets where bucket < now() - interval '2 days';
  update public.presave_authorizations set status='failed',refresh_token_ciphertext=null,lease_until=null,claim_token=null,error_code='authorization_expired'
    where status in ('pending','processing') and token_expires_at <= now();
  update public.presave_authorizations set status='failed',refresh_token_ciphertext=null,lease_until=null,claim_token=null,error_code='release_unavailable'
    where status in ('pending','processing') and scheduled_for < now() - interval '7 days';
  return query
    with due as (
      select a.id from public.presave_authorizations a join public.presave_campaigns c on c.id=a.campaign_id
      where c.published and a.scheduled_for<=now() and a.next_attempt_at<=now() and a.token_expires_at>now()
        and (a.status='pending' or (a.status='processing' and a.lease_until<now()))
      order by a.next_attempt_at,a.id for update of a skip locked limit greatest(1,least(50,p_limit))
    )
    update public.presave_authorizations a set status='processing',attempts=a.attempts+1,lease_until=now()+interval '2 minutes',claim_token=gen_random_uuid()
      from due where a.id=due.id returning a.*;
end;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default. Restrict every privileged RPC.
revoke all on function public.presave_valid_https(text), public.presave_valid_links(jsonb), public.presave_owner(uuid), public.presave_before_update() from public, anon;
grant execute on function public.presave_valid_https(text), public.presave_valid_links(jsonb), public.presave_owner(uuid) to authenticated, service_role;
revoke all on function public.presave_public(text) from public;
grant execute on function public.presave_public(text) to anon, authenticated, service_role;
revoke all on function public.presave_list(uuid,int,int,text,text), public.presave_rate_limit(text,int,int), public.presave_record_event(uuid,text), public.presave_claim_due(int), public.presave_accept_authorization(uuid,text,text,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.presave_list(uuid,int,int,text,text), public.presave_rate_limit(text,int,int), public.presave_record_event(uuid,text), public.presave_claim_due(int), public.presave_accept_authorization(uuid,text,text,timestamptz,text,text) to service_role;

-- Public artwork, with MIME/size enforced by Storage and per-account write paths.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
  values ('presave-artwork','presave-artwork',true,5242880,array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "presave artwork insert" on storage.objects for insert to authenticated
  with check (bucket_id='presave-artwork' and split_part(name,'/',1)=auth.uid()::text and public.presave_owner(auth.uid()));
create policy "presave artwork update" on storage.objects for update to authenticated
  using (bucket_id='presave-artwork' and split_part(name,'/',1)=auth.uid()::text and public.presave_owner(auth.uid()))
  with check (bucket_id='presave-artwork' and split_part(name,'/',1)=auth.uid()::text and public.presave_owner(auth.uid()));
create policy "presave artwork delete" on storage.objects for delete to authenticated
  using (bucket_id='presave-artwork' and split_part(name,'/',1)=auth.uid()::text and public.presave_owner(auth.uid()));
create policy "presave artwork owner list" on storage.objects for select to authenticated
  using (bucket_id='presave-artwork' and split_part(name,'/',1)=auth.uid()::text and public.presave_owner(auth.uid()));

commit;
