-- Phone to PC handoff for the signed-in user only.
-- Additive. A phone with Nexus open reports its own battery; the same account sees it.

create table if not exists public.nexus_handsets (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  device_id    text not null check (char_length(device_id) between 8 and 64),
  label        text not null default 'This device' check (char_length(label) between 1 and 40),
  kind         text not null check (kind in ('phone', 'computer')),
  battery      smallint check (battery is null or battery between 0 and 100),
  charging     boolean not null default false,
  full_in_sec  integer check (full_in_sec is null or (full_in_sec >= 0 and full_in_sec < 86400)),
  note         text check (note is null or char_length(note) <= 280),
  link_url     text check (link_url is null or (char_length(link_url) <= 500 and link_url ~ '^https?://')),
  ping_at      timestamptz,
  last_seen    timestamptz not null default now(),
  primary key (user_id, device_id)
);
create index if not exists nexus_handsets_seen_idx on public.nexus_handsets (user_id, last_seen desc);

alter table public.nexus_handsets enable row level security;

drop policy if exists nexus_handsets_own on public.nexus_handsets;
create policy nexus_handsets_own on public.nexus_handsets
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

do $$
begin
  alter publication supabase_realtime add table public.nexus_handsets;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
