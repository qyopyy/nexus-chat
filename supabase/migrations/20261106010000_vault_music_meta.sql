-- Professional music metadata for My Vault files.

alter table public.vault_files
  add column if not exists kind text not null default 'file'
    check (kind in ('file', 'master', 'stem', 'demo', 'mix', 'artwork', 'contract', 'video')),
  add column if not exists duration_ms integer,
  add column if not exists artist text,
  add column if not exists title text;

comment on column public.vault_files.kind is 'Vault file role for music workflow';
comment on column public.vault_files.duration_ms is 'Audio/video duration when probed on upload';
comment on column public.vault_files.artist is 'Optional artist credit for music files';
comment on column public.vault_files.title is 'Optional display title (defaults to file name)';
