-- =====================================================================
-- Nexus — v7: distribution dashboard upgrade
--  • release status history (timeline + activity feed)
--  • smart links (public /l/<slug> pages with pre-save countdown) + view/click analytics
--  • playlist pitch per release
-- Applied live as nexus_18_dist_dashboard.
-- =====================================================================

-- ---------------------------------------------------------------- status history
create table if not exists public.dist_status_log (
  id          bigint generated always as identity primary key,
  release_id  uuid not null references public.dist_releases (id) on delete cascade,
  status      text not null,
  actor       uuid references public.profiles (id) on delete set null,
  note        text check (char_length(note) <= 2000),
  at          timestamptz not null default now()
);
create index if not exists dist_status_log_release_idx on public.dist_status_log (release_id, at desc);
create index if not exists dist_status_log_actor_idx on public.dist_status_log (actor);
alter table public.dist_status_log enable row level security;
create policy "status log read" on public.dist_status_log for select to authenticated using (public.release_visible(release_id));

create or replace function public.log_release_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.dist_status_log (release_id, status, actor, note)
    values (new.id, new.status, auth.uid(),
      case new.status when 'changes_requested' then new.staff_note when 'rejected' then new.rejection_reason when 'error' then new.last_error end);
  end if;
  return new;
end;
$$;
create trigger release_status_log after insert or update of status on public.dist_releases
  for each row execute function public.log_release_status();

insert into public.dist_status_log (release_id, status, at)
select r.id, r.status, coalesce(r.sent_at, r.submitted_at, r.created_at) from public.dist_releases r
where not exists (select 1 from public.dist_status_log l where l.release_id = r.id);

-- ---------------------------------------------------------------- smart links
create or replace function public.release_owned(p_release uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dist_releases r where r.id = p_release and r.owner_id = (select auth.uid()));
$$;

create table if not exists public.smart_links (
  id          uuid primary key default gen_random_uuid(),
  release_id  uuid not null unique references public.dist_releases (id) on delete cascade,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,60}$'),
  enabled     boolean not null default true,
  links       jsonb not null default '{}'::jsonb check (jsonb_typeof(links) = 'object' and pg_column_size(links) <= 6000),
  accent      text check (accent ~ '^#[0-9a-fA-F]{6}$'),
  headline    text check (char_length(headline) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists smart_links_owner_idx on public.smart_links (owner_id);
alter table public.smart_links enable row level security;
create policy "smart links read" on public.smart_links for select to authenticated using (owner_id = (select auth.uid()) or public.my_rank() >= 3);
create policy "smart links insert" on public.smart_links for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.release_owned(release_id) and not public.is_banned());
create policy "smart links update" on public.smart_links for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and public.release_owned(release_id));
create policy "smart links remove" on public.smart_links for delete to authenticated using (owner_id = (select auth.uid()));

create table if not exists public.smart_link_events (
  id       bigint generated always as identity primary key,
  link_id  uuid not null references public.smart_links (id) on delete cascade,
  kind     text not null check (kind in ('view', 'click')),
  service  text check (char_length(service) <= 30),
  country  text check (char_length(country) <= 2),
  at       timestamptz not null default now()
);
create index if not exists smart_link_events_link_idx on public.smart_link_events (link_id, at desc);
alter table public.smart_link_events enable row level security; -- written by the smartlink function only; read via smart_link_stats

create or replace function public.smart_link_stats(p_days int default 30, p_all boolean default false)
returns table (link_id uuid, day date, kind text, service text, country text, n bigint)
language sql stable security definer set search_path = '' as $$
  select e.link_id, (e.at at time zone 'utc')::date, e.kind, coalesce(e.service, ''), coalesce(e.country, ''), count(*)
  from public.smart_link_events e
  join public.smart_links l on l.id = e.link_id
  where e.at > now() - make_interval(days => least(greatest(p_days, 1), 365))
    and (l.owner_id = (select auth.uid()) or (p_all and public.my_rank() >= 3))
  group by 1, 2, 3, 4, 5;
$$;

create or replace function public.smart_link_slug_free(p_slug text, p_link uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.smart_links where slug = lower(p_slug) and id is distinct from p_link);
$$;

-- ---------------------------------------------------------------- playlist pitch
create table if not exists public.release_pitches (
  release_id       uuid primary key references public.dist_releases (id) on delete cascade,
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  focus_track      uuid references public.dist_tracks (id) on delete set null,
  moods            text[] not null default '{}' check (cardinality(moods) <= 6),
  styles           text[] not null default '{}' check (cardinality(styles) <= 6),
  instruments      text[] not null default '{}' check (cardinality(instruments) <= 8),
  description      text check (char_length(description) <= 500),
  similar_artists  text check (char_length(similar_artists) <= 300),
  marketing        text check (char_length(marketing) <= 1000),
  hometown         text check (char_length(hometown) <= 100),
  updated_at       timestamptz not null default now()
);
create index if not exists release_pitches_owner_idx on public.release_pitches (owner_id);
create index if not exists release_pitches_focus_idx on public.release_pitches (focus_track);
alter table public.release_pitches enable row level security;
create policy "pitch read" on public.release_pitches for select to authenticated using (public.release_visible(release_id));
create policy "pitch insert" on public.release_pitches for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.release_owned(release_id));
create policy "pitch update" on public.release_pitches for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and public.release_owned(release_id));

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
