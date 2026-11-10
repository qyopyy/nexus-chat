-- Acetate studio: track status, folders, and a private listen log.
-- Additive. Sits after 20261110190000_acetate.sql.

alter table public.acetate_tracks
  add column if not exists starred boolean not null default false,
  add column if not exists status text not null default 'demo'
    check (status in ('idea', 'demo', 'mix', 'master')),
  add column if not exists bpm integer
    check (bpm is null or bpm between 20 and 400),
  add column if not exists musical_key text
    check (musical_key is null or char_length(musical_key) between 1 and 16),
  add column if not exists folder text
    check (folder is null or char_length(folder) between 1 and 40);

create index if not exists acetate_tracks_starred_idx
  on public.acetate_tracks (owner_id, updated_at desc)
  where starred;

create table if not exists public.acetate_listens (
  id           bigint generated always as identity primary key,
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  track_id     uuid references public.acetate_tracks (id) on delete cascade,
  share_id     uuid references public.acetate_shares (id) on delete set null,
  listener_id  uuid references public.profiles (id) on delete set null,
  who          text,
  created_at   timestamptz not null default now()
);
create index if not exists acetate_listens_owner_idx on public.acetate_listens (owner_id, created_at desc);
create index if not exists acetate_listens_track_who_idx on public.acetate_listens (track_id, who, created_at desc);

alter table public.acetate_listens enable row level security;

drop policy if exists acetate_listens_owner_read on public.acetate_listens;
create policy acetate_listens_owner_read on public.acetate_listens
  for select
  using (owner_id = (select auth.uid()));

-- Inserts go through acetate_record_listen so guests cannot write arbitrary rows.
revoke all on public.acetate_listens from anon, authenticated;
grant select on public.acetate_listens to authenticated;

create or replace function public.acetate_record_listen(
  p_track uuid,
  p_token text default null,
  p_password text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tr public.acetate_tracks;
  s public.acetate_shares;
  share_id uuid := null;
  who text := public.pw_caller();
begin
  select * into tr from public.acetate_tracks where id = p_track;
  if not found then
    return;
  end if;

  if p_token is null then
    if auth.uid() is distinct from tr.owner_id then
      raise exception 'Not your track';
    end if;
  else
    select * into s from public.acetate_shares where token = p_token and not revoked;
    if not found then
      return;
    end if;
    if s.expires_at is not null and s.expires_at < now() then
      return;
    end if;
    if s.pass_hash is not null and (
      p_password is null
      or extensions.crypt(p_password, s.pass_hash) is distinct from s.pass_hash
    ) then
      return;
    end if;
    if s.owner_id is distinct from tr.owner_id then
      return;
    end if;
    if s.kind = 'track' and s.track_id is distinct from p_track then
      return;
    end if;
    if s.kind = 'project' and not exists (
      select 1 from public.acetate_memberships m
      where m.project_id = s.project_id and m.track_id = p_track
    ) then
      return;
    end if;
    share_id := s.id;
  end if;

  if exists (
    select 1 from public.acetate_listens l
    where l.track_id = p_track
      and l.who = who
      and l.created_at > now() - interval '45 seconds'
  ) then
    return;
  end if;

  insert into public.acetate_listens (owner_id, track_id, share_id, listener_id, who)
  values (tr.owner_id, p_track, share_id, auth.uid(), who);
end;
$$;

revoke all on function public.acetate_record_listen(uuid, text, text) from public;
grant execute on function public.acetate_record_listen(uuid, text, text) to anon, authenticated;
