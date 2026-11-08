-- Security audit (2026-11-08). Direct PostgREST writes run as role "authenticated"; SECURITY DEFINER RPCs and the
-- service role run as their owner — so `current_user in ('authenticated','anon')` tells a raw client write apart
-- from a vetted RPC. Column guards below only apply to raw client writes.

-- 1) First-user-owner trigger: only the very first account ever may become owner (previously: any signup while no
--    owner existed — e.g. after the owner was demoted or deleted — became owner).
create or replace function public.first_user_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id <> new.id) then
    perform set_config('nexus.admin_write', 'on', true);
    update public.profiles set site_role = 'owner' where id = new.id;
    perform set_config('nexus.admin_write', 'off', true);
  end if;
  return new;
end $$;

-- 2) Servers: owners could self-verify, grab a vanity code or rewrite owner/id by updating the row directly.
create or replace function public.protect_space_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if new.verified is distinct from old.verified or new.verified_at is distinct from old.verified_at
     or new.vanity_code is distinct from old.vanity_code or new.owner_id is distinct from old.owner_id
     or new.id is distinct from old.id or new.created_at is distinct from old.created_at
     or new.discoverable is distinct from old.discoverable or new.discover_tags is distinct from old.discover_tags then
    raise exception 'Use the server settings to change that';
  end if;
  return new;
end $$;
drop trigger if exists a0_protect_space on public.spaces;
create trigger a0_protect_space before update on public.spaces for each row execute function public.protect_space_columns();

-- 3) Messages: authors could move their message into any conversation, back-date it, un-hide it or rename the bot label.
--    (Runs first — a0_ — so automod's own changes later in the chain still apply.)
create or replace function public.protect_message_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if new.conversation_id is distinct from old.conversation_id or new.author_id is distinct from old.author_id
     or new.created_at is distinct from old.created_at or new.id is distinct from old.id
     or new.bot_name is distinct from old.bot_name or new.hidden is distinct from old.hidden
     or new.reply_to_id is distinct from old.reply_to_id then
    raise exception 'Only the text of a message can be edited';
  end if;
  return new;
end $$;
drop trigger if exists a0_protect_message on public.messages;
create trigger a0_protect_message before update on public.messages for each row execute function public.protect_message_columns();

-- 4) Group chats: any member could rewrite kind / space / privacy / password of a conversation; only renaming is allowed.
create or replace function public.protect_conversation_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if new.kind is distinct from old.kind or new.space_id is distinct from old.space_id or new.created_by is distinct from old.created_by
     or new.is_private is distinct from old.is_private or new.password_hash is distinct from old.password_hash
     or new.is_announcement is distinct from old.is_announcement or new.id is distinct from old.id
     or new.created_at is distinct from old.created_at or new.position is distinct from old.position
     or new.nsfw is distinct from old.nsfw or new.slowmode is distinct from old.slowmode
     or new.message_ttl is distinct from old.message_ttl or new.topic is distinct from old.topic then
    raise exception 'Only the name of a group chat can be changed here';
  end if;
  return new;
end $$;
drop trigger if exists a0_protect_conversation on public.conversations;
create trigger a0_protect_conversation before update on public.conversations for each row execute function public.protect_conversation_columns();

-- 5) Pulse: anyone could edit anyone's post (UPDATE policy was `true`). Only the counters may change, by ±1.
create or replace function public.protect_pulse_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if new.body is distinct from old.body or new.author_id is distinct from old.author_id or new.id is distinct from old.id
     or new.reply_to is distinct from old.reply_to or new.repost_of is distinct from old.repost_of or new.created_at is distinct from old.created_at
     or abs(coalesce(new.like_count, 0) - coalesce(old.like_count, 0)) > 1
     or abs(coalesce(new.reply_count, 0) - coalesce(old.reply_count, 0)) > 1
     or abs(coalesce(new.repost_count, 0) - coalesce(old.repost_count, 0)) > 1
     or new.like_count < 0 or new.reply_count < 0 or new.repost_count < 0 then
    raise exception 'Posts can''t be edited';
  end if;
  return new;
end $$;
drop trigger if exists a0_protect_pulse on public.pulse_posts;
create trigger a0_protect_pulse before update on public.pulse_posts for each row execute function public.protect_pulse_columns();

-- 6) Nexus Radio: queue entries could be rewritten (title/url → anything) and shared rows deleted by anyone.
drop policy if exists radio_tracks_update on public.radio_tracks;
create policy radio_tracks_update on public.radio_tracks for update to authenticated using (removed_at is null) with check (true);
create or replace function public.protect_radio_track()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if (to_jsonb(new) - 'removed_at') is distinct from (to_jsonb(old) - 'removed_at') then raise exception 'Queue entries can only be removed'; end if;
  return new;
end $$;
drop trigger if exists a0_protect_radio_track on public.radio_tracks;
create trigger a0_protect_radio_track before update on public.radio_tracks for each row execute function public.protect_radio_track();

drop policy if exists radio_jam_all on public.radio_jam;
create policy radio_jam_read on public.radio_jam for select to authenticated using (true);
create policy radio_jam_write on public.radio_jam for insert to authenticated with check (id = 'main' and (updated_by is null or updated_by = (select auth.uid())));
create policy radio_jam_update on public.radio_jam for update to authenticated using (id = 'main') with check (id = 'main' and (updated_by is null or updated_by = (select auth.uid())));
drop policy if exists radio_player_all on public.radio_player;
create policy radio_player_read on public.radio_player for select to authenticated using (true);
create policy radio_player_write on public.radio_player for insert to authenticated with check (id = 'main' and updated_by = (select auth.uid()));
create policy radio_player_update on public.radio_player for update to authenticated using (id = 'main') with check (id = 'main' and updated_by = (select auth.uid()));

-- 7) Presence: bump_can_see(target, viewer) answered for any viewer → anyone could probe who sees whom.
create or replace function public.bump_can_see(target uuid, viewer uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select case
    when viewer is distinct from auth.uid() then false
    when target = viewer then true
    when not exists (select 1 from bump_presence p where p.user_id = target and p.updated_at > now() - interval '20 minutes') then false
    when exists (select 1 from bump_group_members a join bump_group_members b on a.group_id = b.group_id where a.user_id = target and b.user_id = viewer) then true
    when (select visible from bump_presence where user_id = target) = 'everyone' then true
    when (select visible from bump_presence where user_id = target) = 'family' then exists (
      select 1 from bump_family f where (f.user_id = target and f.member_id = viewer) or (f.user_id = viewer and f.member_id = target))
    when (select visible from bump_presence where user_id = target) = 'friends' then exists (
      select 1 from friendships fr where fr.status = 'accepted'
        and ((fr.requester_id = target and fr.addressee_id = viewer) or (fr.requester_id = viewer and fr.addressee_id = target))
    ) or exists (select 1 from bump_family f where (f.user_id = target and f.member_id = viewer) or (f.user_id = viewer and f.member_id = target))
    else false
  end;
$function$;
revoke execute on function public.bump_can_see(uuid, uuid) from anon, public;

-- 8) Artist-page media uploads: the policy compared against the page's own name column (always false → uploads broken).
drop policy if exists "artist media upload" on storage.objects;
create policy "artist media upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'artist-media' and exists (select 1 from public.artist_pages p where p.id::text = (storage.foldername(objects.name))[1] and p.owner_id = (select auth.uid())));

-- 9) Anonymous security-event logging: cap volume so it can't be used to flood the table.
create or replace function public.linkbio_log_security(p_kind text, p_username text default null, p_detail text default null, p_page uuid default null, p_ip_hash text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.linkbio_security_events where created_at > now() - interval '10 minutes') > 3000 then return; end if;
  if nullif(p_ip_hash, '') is not null and (select count(*) from public.linkbio_security_events where ip_hash = left(p_ip_hash, 64) and created_at > now() - interval '1 minute') >= 20 then return; end if;
  insert into public.linkbio_security_events (kind, page_id, username, detail, ip_hash)
  values (left(coalesce(p_kind, 'event'), 64), p_page, nullif(left(lower(trim(coalesce(p_username, ''))), 32), ''), nullif(left(coalesce(p_detail, ''), 500), ''), nullif(left(coalesce(p_ip_hash, ''), 64), ''));
end $$;

-- 10) Trigger functions aren't API endpoints.
revoke execute on function public.dist_release_auto_link() from public, anon, authenticated;
revoke execute on function public.first_user_owner() from public, anon, authenticated;
