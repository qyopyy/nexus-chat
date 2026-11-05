-- Mobile browsers label M4A/MP4 as video/mp4 and WAV/MP3 with OS-specific types.
-- Drop the MIME allowlist (same as space-music) so storage accepts any audio upload.

update storage.buckets
set allowed_mime_types = null,
    file_size_limit = 104857600
where id = 'nexus-radio';
