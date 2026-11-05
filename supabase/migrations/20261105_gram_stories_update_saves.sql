-- Authors can update their own live stories (media recompress / caption)
drop policy if exists "gram stories update" on public.gram_stories;
create policy "gram stories update" on public.gram_stories
  for update to authenticated
  using (author_id = auth.uid() and not public.is_banned())
  with check (author_id = auth.uid() and not public.is_banned());
grant update (media, caption) on public.gram_stories to authenticated;

-- Saved posts
create table if not exists public.gram_saves (
  post_id uuid not null references public.gram_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists gram_saves_user_idx on public.gram_saves (user_id, created_at desc);
alter table public.gram_saves enable row level security;
drop policy if exists gram_saves_all on public.gram_saves;
create policy gram_saves_all on public.gram_saves for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.gram_saves to authenticated;
