-- Fix Nexus Radio uploads: browsers send MIME types the bucket previously rejected
-- (audio/mp3, audio/x-m4a, empty → octet-stream, etc.). space-music already allows any.

update storage.buckets
set allowed_mime_types = array[
  'audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/m4a',
  'audio/wav','audio/x-wav','audio/wave','audio/flac','audio/x-flac',
  'audio/aac','audio/ogg','audio/opus','audio/webm','audio/basic',
  'application/octet-stream'
],
file_size_limit = 104857600
where id = 'nexus-radio';

drop policy if exists radio_storage_auth on storage.objects;
drop policy if exists radio_storage_read on storage.objects;
drop policy if exists radio_storage_insert on storage.objects;
drop policy if exists radio_storage_update on storage.objects;
drop policy if exists radio_storage_delete on storage.objects;

create policy radio_storage_read on storage.objects
  for select to authenticated
  using (bucket_id = 'nexus-radio');

create policy radio_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'nexus-radio'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

create policy radio_storage_update on storage.objects
  for update to authenticated
  using (bucket_id = 'nexus-radio' and (storage.foldername(name))[1] = (auth.uid())::text)
  with check (bucket_id = 'nexus-radio' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy radio_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'nexus-radio' and (storage.foldername(name))[1] = (auth.uid())::text);
