-- Private check-ins. Only the account that wrote them can read them.
-- Arrive/leave alerts stay on the existing place-event log.

create table if not exists public.wump_checkins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  place_id    uuid references public.wump_saved_places (id) on delete set null,
  name        text not null check (char_length(name) between 1 and 160),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  note        text check (note is null or char_length(note) <= 280),
  created_at  timestamptz not null default now()
);
create index if not exists wump_checkins_user_idx on public.wump_checkins (user_id, created_at desc);

alter table public.wump_checkins enable row level security;
revoke all on public.wump_checkins from anon, authenticated;
grant select, insert, delete on public.wump_checkins to authenticated;

drop policy if exists wump_checkins_own on public.wump_checkins;
create policy wump_checkins_own on public.wump_checkins
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.wump_checkin_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.wump_checkins where user_id = new.user_id) >= 500 then
    raise exception 'Check-in history is full (500). Delete an older visit first.';
  end if;
  return new;
end;
$$;

drop trigger if exists wump_checkin_guard on public.wump_checkins;
create trigger wump_checkin_guard
  before insert on public.wump_checkins
  for each row execute function public.wump_checkin_guard();
