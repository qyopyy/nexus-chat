-- NexusGram music genres for discovery ranking + hashtag optimization.

alter table public.gram_posts
  add column if not exists genre text;

do $$ begin
  alter table public.gram_posts drop constraint if exists gram_posts_genre_check;
  alter table public.gram_posts add constraint gram_posts_genre_check
    check (
      genre is null or genre in (
        'hiphop','trap','electronic','pop','phonk',
        'rnb','drill','rock','indie','latin',
        'afrobeats','lofi','metal','jazz','country','house','techno','ambient'
      )
    );
exception when others then null;
end $$;

create index if not exists gram_posts_genre_idx on public.gram_posts (genre) where genre is not null;
create index if not exists gram_posts_genre_created_idx on public.gram_posts (genre, created_at desc) where genre is not null;
