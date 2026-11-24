-- Linked-device message previews are short-lived: keep them for seven days, not forever.
create or replace function public.nexus_prune_device_notices()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.nexus_device_notices where created_at < now() - interval '7 days';
$$;
revoke all on function public.nexus_prune_device_notices() from public, anon, authenticated;
grant execute on function public.nexus_prune_device_notices() to service_role;

-- Fast pruning and fast "unseen" counts.
create index if not exists nexus_device_notices_created_idx on public.nexus_device_notices (created_at);

do $$
begin
  begin perform cron.unschedule('nexus-prune-device-notices'); exception when others then null; end;
  perform cron.schedule('nexus-prune-device-notices', '17 4 * * *', 'select public.nexus_prune_device_notices()');
exception
  when undefined_table or undefined_function or invalid_schema_name or insufficient_privilege or unique_violation then
    null;
end $$;
