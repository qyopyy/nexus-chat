-- Scale & DB health pass
-- 1. Realtime: drop tables nothing subscribes to (the realtime poller decodes WAL for every published table)
-- 2. Index every foreign key that has no covering index (joins, cascades and deletes stop seq-scanning)
-- 3. shield_hashes gets a primary key
-- 4. Sign-in-only RPCs are no longer callable by anonymous visitors

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['artist_pages','artist_post_comments','artist_posts','bump_group_members','bump_groups','dist_releases','dist_tracks','message_saves','nexus_cloud_album_members','nexus_cloud_files','pulse_likes','pulse_posts','username_aliases','video_comments','wump_place_inside','wump_safety_checks']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r record; cols text; idx text;
BEGIN
  SET LOCAL lock_timeout = '5s';
  FOR r IN
    SELECT c.oid AS coid, c.conname, c.conkey, c.conrelid, cl.relname
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE c.contype = 'f' AND n.nspname = 'public' AND cl.relkind = 'r'
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid AND i.indisvalid AND i.indpred IS NULL
          AND (SELECT array_agg(k ORDER BY ord) FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS u(k, ord) WHERE ord <= array_length(c.conkey, 1)) = c.conkey::int2[]
      )
  LOOP
    BEGIN
      SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord) INTO cols
      FROM unnest(r.conkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = r.conrelid AND a.attnum = k.attnum;
      idx := left(r.relname || '_' || r.conname, 55) || '_idx';
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', idx, r.relname, cols);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skipped % (%)', r.conname, SQLERRM;
    END;
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.shield_hashes'::regclass AND contype = 'p') THEN
    ALTER TABLE public.shield_hashes ADD COLUMN IF NOT EXISTS id bigint GENERATED ALWAYS AS IDENTITY;
    ALTER TABLE public.shield_hashes ADD PRIMARY KEY (id);
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION
  public.acetate_commit_art(text, uuid, text),
  public.acetate_commit_version(uuid, text, text, text, bigint, real, jsonb),
  public.acetate_invite_collaborator(uuid, text, text),
  public.acetate_my_storage(),
  public.acetate_my_storage_for(uuid),
  public.acetate_set_follow(uuid, boolean),
  public.acetate_share_create(text, uuid, text, text, timestamptz, boolean),
  public.acetate_toggle_like(uuid),
  public.bump_heartbeat(double precision, double precision, double precision, double precision, double precision, text, text, smallint),
  public.bump_nearby(double precision),
  public.nexus_cloud_sync_due(),
  public.nexus_cloud_sync_mark()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.acetate_commit_art(text, uuid, text),
  public.acetate_commit_version(uuid, text, text, text, bigint, real, jsonb),
  public.acetate_invite_collaborator(uuid, text, text),
  public.acetate_my_storage(),
  public.acetate_my_storage_for(uuid),
  public.acetate_set_follow(uuid, boolean),
  public.acetate_share_create(text, uuid, text, text, timestamptz, boolean),
  public.acetate_toggle_like(uuid),
  public.bump_heartbeat(double precision, double precision, double precision, double precision, double precision, text, text, smallint),
  public.bump_nearby(double precision),
  public.nexus_cloud_sync_due(),
  public.nexus_cloud_sync_mark()
TO authenticated, service_role;

ANALYZE;
