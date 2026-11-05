-- Untitled uploads: phones send video/mp4 / odd WAV MIME types the old allowlist rejected.
-- Mirror Radio: allow any MIME; size stays 2 GB. Also let anyone read objects for public projects
-- so Explore / public profiles can createSignedUrl for playback.

update storage.buckets
set allowed_mime_types = null,
    file_size_limit = 2147483648
where id = 'untitled';

drop policy if exists untitled_storage_public_read on storage.objects;
create policy untitled_storage_public_read on storage.objects
  for select
  using (
    bucket_id = 'untitled'
    and exists (
      select 1
      from public.untitled_projects p
      where p.id::text = (storage.foldername(name))[2]
        and p.visibility = 'public'
    )
  );
