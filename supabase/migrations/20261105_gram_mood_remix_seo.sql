-- NexusGram: mood + remix for richer feeds; caption trigram search when available.

do $$ begin
  create extension if not exists pg_trgm;
exception when others then null;
end $$;

alter table public.gram_posts
  add column if not exists mood text,
  add column if not exists remix_of uuid references public.gram_posts(id) on delete set null;

do $$ begin
  alter table public.gram_posts drop constraint if exists gram_posts_mood_check;
  alter table public.gram_posts add constraint gram_posts_mood_check
    check (mood is null or mood in ('chill','hype','focus','night','soft','fire','dream'));
exception when others then null;
end $$;

create index if not exists gram_posts_mood_idx on public.gram_posts (mood) where mood is not null;
create index if not exists gram_posts_remix_idx on public.gram_posts (remix_of) where remix_of is not null;

do $$ begin
  create index if not exists gram_posts_caption_trgm_idx on public.gram_posts using gin (caption gin_trgm_ops);
exception when others then null;
end $$;
