-- Global site announcement banner (admins / owner).

create table if not exists public.site_notices (
  id          text primary key,
  body        text not null default '' check (char_length(body) <= 280),
  active      boolean not null default false,
  author_id   uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

insert into public.site_notices (id, body, active)
values ('global', '', false)
on conflict (id) do nothing;

alter table public.site_notices enable row level security;

drop policy if exists site_notices_read on public.site_notices;
create policy site_notices_read on public.site_notices
  for select to authenticated using (true);

drop policy if exists site_notices_write on public.site_notices;
create policy site_notices_write on public.site_notices
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.site_role in ('admin', 'owner')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.site_role in ('admin', 'owner')
    )
  );
