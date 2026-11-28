-- Run once in Supabase → SQL editor. Creates Martin's Nexus artist page (handle "martin") with the verified check.
insert into public.artist_pages (spotify_id, handle, name, bio, owner_id, verified)
values ('1DHWtSkA0gpJJdWz7OwwVQ', 'martin', 'Martin', 'Artist from Hungary. New music out now.', '46265ba4-ad41-4ed8-8262-2ed7cd35389d', true)
on conflict do nothing;
