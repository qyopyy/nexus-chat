-- Live Bump: publish presence / DMs / follows on supabase_realtime
-- so Capacitor shells pick up nearby + messages without a new IPA/APK.

do $$ begin
  alter publication supabase_realtime add table public.bump_presence;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.bump_messages;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.bump_follows;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.bump_family;
exception when duplicate_object then null;
end $$;

-- Own live pin lookup (used to restore Live state after refresh)
create or replace function public.bump_my_presence()
returns public.bump_presence
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.bump_presence;
begin
  select * into row from bump_presence where user_id = auth.uid();
  return row;
end;
$$;

grant execute on function public.bump_my_presence() to authenticated;
