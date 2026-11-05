-- Allow audio_checks.status = 'blocked' for global YouTube Content ID hard-blocks
do $$ begin
  alter table public.audio_checks drop constraint if exists audio_checks_status_check;
exception when undefined_object then null;
end $$;

alter table public.audio_checks
  drop constraint if exists audio_checks_status_check;

alter table public.audio_checks
  add constraint audio_checks_status_check
  check (status in ('clean', 'match', 'own', 'error', 'blocked'));

-- Default global YouTube CID block flag (off until staff enable it)
insert into public.dist_settings (key, value, updated_at)
values ('youtube_cid_block', 'off', now())
on conflict (key) do nothing;
