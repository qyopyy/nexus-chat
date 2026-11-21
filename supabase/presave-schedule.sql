-- Run in the Supabase SQL editor AFTER deploying the presave Edge Function.
-- First create two Supabase Vault secrets using the dashboard (never commit them):
--   nexus_presave_url: https://<project-ref>.supabase.co/functions/v1/presave
--   nexus_presave_cron_secret: the same random 32+ character value used for the
--     PRESAVE_CRON_SECRET Edge Function secret.
-- Then execute this file and set the Edge secret PRESAVE_SCHEDULER_ENABLED=true.
-- Uses the existing pg_cron / pg_net extensions supported by Supabase.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name='nexus_presave_url'
    and decrypted_secret ~ '^https://[^/]+/functions/v1/presave$') then
    raise exception 'Create the nexus_presave_url Vault secret first';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name='nexus_presave_cron_secret'
    and char_length(decrypted_secret)>=32) then
    raise exception 'Create the nexus_presave_cron_secret Vault secret first';
  end if;
end;
$$;

-- A named job is replaced in-place when this file is run again.
select cron.schedule(
  'nexus-presave-release-worker',
  '* * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='nexus_presave_url'),
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-presave-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='nexus_presave_cron_secret')
      ),
      body := '{"action":"run"}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);

-- Monitor cron.job_run_details and net._http_response in Supabase. Each call
-- claims 10 due authorizations (PRESAVE_BATCH_SIZE may be set between 1 and 50),
-- retries temporary failures, expires stale jobs, and removes old OAuth states.
-- Unpublishing pauses delivery. Deleting a campaign removes its pending tokens.
