-- Live feed: publish the tables the client was still polling or missing,
-- and let conversation members see each other's read timestamps.
-- Writes stay owner-only. Realtime still obeys RLS, so a client only
-- receives rows it is allowed to select.

-- Read receipts: members of the chat can see last_read_at. They cannot write someone else's row.
drop policy if exists read_states_members_select on public.read_states;
create policy read_states_members_select on public.read_states
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_conversation_member(conversation_id)
  );

-- Deletes need the old key so the client can drop a reaction or a removed channel.
do $$
declare t text;
begin
  foreach t in array array['message_reactions', 'conversations', 'read_states', 'message_pins'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I replica identity full', t);
    end if;
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'read_states',
    'user_privacy',
    'notification_inbox',
    'message_pins',
    'message_saves',
    'wump_trail_points',
    'wump_place_events',
    'wump_place_inside'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when undefined_table then null;
      when undefined_object then null;
    end;
  end loop;
end $$;
