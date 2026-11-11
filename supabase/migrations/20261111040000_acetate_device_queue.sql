-- One queue and now-playing position for the signed-in account.
-- Each device writes its id. The others follow over Realtime. RLS is owner-only.

create table if not exists public.acetate_now (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  device_id   text not null check (char_length(device_id) between 8 and 64),
  items       jsonb not null default '[]'::jsonb,
  index       int not null default 0 check (index >= 0 and index < 200),
  position_s  real not null default 0 check (position_s >= 0 and position_s < 86400),
  playing     boolean not null default false,
  updated_at  timestamptz not null default now(),
  constraint acetate_now_items_size check (octet_length(items::text) < 24000)
);

alter table public.acetate_now enable row level security;
revoke all on public.acetate_now from anon, authenticated;
grant select, insert, update, delete on public.acetate_now to authenticated;

drop policy if exists acetate_now_own on public.acetate_now;
create policy acetate_now_own on public.acetate_now
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.acetate_now_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(new.items) is distinct from 'array' then
    raise exception 'Queue must be a list';
  end if;
  if jsonb_array_length(new.items) > 80 then
    raise exception 'Queue is too long';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists acetate_now_touch on public.acetate_now;
create trigger acetate_now_touch
  before insert or update on public.acetate_now
  for each row execute function public.acetate_now_touch();

do $$
begin
  alter publication supabase_realtime add table public.acetate_now;
exception when duplicate_object then null; when undefined_object then null;
end $$;
