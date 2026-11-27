-- Nexus Snap: share a photo/video with another Nexus user by email address.
-- Signed-in users only; returns just id / username / display name of an exact email match (never a list).
create or replace function public.snap_find_user(p_email text)
returns table (id uuid, username text, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id, p.username, p.display_name, p.avatar_url
  from auth.users u
  join public.profiles p on p.id = u.id
  where auth.uid() is not null
    and length(trim(coalesce(p_email, ''))) between 5 and 254
    and lower(u.email) = lower(trim(p_email))
    and p.id <> auth.uid()
  limit 1;
$$;

revoke all on function public.snap_find_user(text) from public, anon;
grant execute on function public.snap_find_user(text) to authenticated;
