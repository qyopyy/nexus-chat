-- Effectively unlimited vault quota for all tiers (Supabase Pro).
CREATE OR REPLACE FUNCTION public.vault_limit(p_tier integer)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  -- 100 TiB sentinel — treated as Unlimited in the UI
  select 109951162777600::bigint;
$function$;

-- Raise / remove hard bucket caps for vault + large media uploads
UPDATE storage.buckets SET file_size_limit = NULL WHERE id = 'user-vault';
UPDATE storage.buckets SET file_size_limit = 5368709120 WHERE id IN ('attachments', 'gram'); -- 5 GB
UPDATE storage.buckets SET file_size_limit = NULL WHERE id IN ('untitled', 'videos');
