-- Security + performance hardening (applied live as nexus_38 / nexus_39 / nexus_40).

-- ── 1. Logged-out visitors (anon) could call SECURITY DEFINER functions meant for signed-in users ──
-- Public-page helpers stay callable: linkbio_public/hit/click/check_password/presence/owner_*/invite_check/log_security,
-- premium_gift_preview, space_invite_preview, untitled_share_resolve/record_listen/profile/follow_list,
-- gram_profile/gram_view/gram_feed, release_by_code, list_public_bots, bot_by_slug, user_by_username, and the RLS
-- helper predicates (can_see_conversation, is_space_staff, space_role, space_has_channel_access, bump_can_see).
do $$
declare
  r record;
  login_only text[] := array[
    -- trigger functions (never called directly)
    'check_game_invite_pref','notification_inbox_on_message','pulse_like_bump','untitled_bump_track_count',
    -- admin
    'admin_clear_push','admin_create_badge','linkbio_admin_block_host','linkbio_admin_clear_links','linkbio_admin_list',
    'linkbio_admin_network','linkbio_admin_set_badge','linkbio_admin_set_premium','linkbio_admin_set_published',
    'linkbio_admin_set_username','linkbio_admin_unblock_host','linkbio_admin_suspend','claim_set','claim_dispute',
    'create_premium_gift','list_premium_gifts','bump_expire_stale',
    -- Wump / Bump (personal location data)
    'bump_create_group','bump_create_invite','bump_follow_list','bump_get_profile','bump_heartbeat','bump_inbox',
    'bump_join_group','bump_leave_group','bump_nearby','bump_publish','bump_redeem_invite','bump_send_message',
    'bump_set_follow','bump_set_place','bump_thread','bump_upsert_profile','bump_clear','bump_group_members_list',
    'bump_list_groups','bump_my_presence','wump_explore_mark','wump_explore_stats','wump_save_place',
    'wump_delete_saved_place','wump_list_saved_places',
    -- account / chat
    'claim_username','release_username','make_primary_username','my_music_link','set_music_share','presence_heartbeat',
    'notification_inbox_mark_read','list_saved_messages','toggle_save_message','pin_message','unpin_message',
    'search_messages','capsule_info','redeem_premium_gift','unlock_channel','vault_share_create','vault_usage',
    'linkbio_invite_create','linkbio_invite_list','linkbio_invite_redeem','linkbio_invite_revoke','linkbio_mine',
    'linkbio_save','linkbio_stats','untitled_share_create',
    -- bots / servers (management)
    'create_community_bot','update_community_bot','install_bot_to_space','uninstall_bot_from_space','create_channel',
    'space_assign_role','space_clear_media','space_create_invite','space_create_role','space_delete_channel',
    'space_delete_role','space_revoke_invite','space_set_appearance','space_set_channel','space_set_info',
    'space_set_role','space_set_slowmode','space_set_vanity','space_update_role'
  ];
  n int := 0;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = any(login_only)
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
    n := n + 1;
  end loop;
  raise notice 'locked % function signatures', n;
end $$;

-- trigger functions don't need to be callable by anyone directly
revoke execute on function public.check_game_invite_pref() from authenticated;
revoke execute on function public.notification_inbox_on_message() from authenticated;
revoke execute on function public.pulse_like_bump() from authenticated;
revoke execute on function public.untitled_bump_track_count() from authenticated;

-- mutable search_path warning
do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='linkbio_is_premium' loop
    execute format('alter function %s set search_path = %L', r.sig, '');
  end loop;
end $$;

-- ── 2. auth_rls_initplan: evaluate auth.uid()/auth.jwt()/auth.role() once per query instead of once per row ──
do $$
declare
  r record;
  q text; w text; nq text; nw text;
  n int := 0;
  fix text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual,'') ~ 'auth\.(uid|jwt|role)\(\)' or coalesce(with_check,'') ~ 'auth\.(uid|jwt|role)\(\)')
  loop
    q := r.qual; w := r.with_check;
    nq := q; nw := w;
    -- protect already-wrapped calls, wrap the rest, restore
    foreach fix in array array['uid','jwt','role'] loop
      if nq is not null then
        nq := replace(nq, format('( SELECT auth.%s() AS %s)', fix, fix), format('@@%s@@', fix));
        nq := replace(nq, format('auth.%s()', fix), format('( SELECT auth.%s() AS %s)', fix, fix));
        nq := replace(nq, format('@@%s@@', fix), format('( SELECT auth.%s() AS %s)', fix, fix));
      end if;
      if nw is not null then
        nw := replace(nw, format('( SELECT auth.%s() AS %s)', fix, fix), format('@@%s@@', fix));
        nw := replace(nw, format('auth.%s()', fix), format('( SELECT auth.%s() AS %s)', fix, fix));
        nw := replace(nw, format('@@%s@@', fix), format('( SELECT auth.%s() AS %s)', fix, fix));
      end if;
    end loop;
    if nq is distinct from q or nw is distinct from w then
      if nq is not null and nw is not null then
        execute format('alter policy %I on %I.%I using (%s) with check (%s)', r.policyname, r.schemaname, r.tablename, nq, nw);
      elsif nq is not null then
        execute format('alter policy %I on %I.%I using (%s)', r.policyname, r.schemaname, r.tablename, nq);
      else
        execute format('alter policy %I on %I.%I with check (%s)', r.policyname, r.schemaname, r.tablename, nw);
      end if;
      n := n + 1;
    end if;
  end loop;
  raise notice 'rewrote % policies', n;
end $$;

-- ── 3. unindexed_foreign_keys: covering index for every public FK that lacks one ──
do $$
declare r record; n int := 0; idx text;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname,
           array_agg(a.attname order by k.ord) as cols,
           c.conkey
    from pg_constraint c
    join pg_namespace ns on ns.oid = c.connamespace
    cross join lateral unnest(c.conkey) with ordinality k(attnum, ord)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f' and ns.nspname = 'public'
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:array_length(c.conkey,1)-1] = c.conkey
      )
    group by c.conrelid, c.conname, c.conkey
  loop
    idx := left(replace(r.tbl::text, 'public.', '') || '_' || array_to_string(r.cols, '_') || '_fk_idx', 63);
    execute format('create index if not exists %I on %s (%s)', idx, r.tbl,
                   (select string_agg(format('%I', x), ', ') from unnest(r.cols) x));
    n := n + 1;
  end loop;
  raise notice 'created % FK indexes', n;
end $$;
