-- Shield 360 Pro
--  * credits    : multi-artist / multi-role metadata per protected song
--  * meta_seal  : tamper-evident SHA-256 seal of title/artists/codes/audio hash, timestamped by the server
--  * platforms  : per-platform protection mode (watch / block / claim) — drives takedown kits
--  * allow_until: time-limited collaborator access
--  * release_social_links : Instagram song link + artist profile link per release / protected song

ALTER TABLE public.shield_works
  ADD COLUMN IF NOT EXISTS credits jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS meta_seal text,
  ADD COLUMN IF NOT EXISTS sealed_at timestamptz,
  ADD COLUMN IF NOT EXISTS platforms jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS allow_until timestamptz;

ALTER TABLE public.shield_works DROP CONSTRAINT IF EXISTS shield_works_credits_check;
ALTER TABLE public.shield_works ADD CONSTRAINT shield_works_credits_check
  CHECK (jsonb_typeof(credits) = 'array' AND jsonb_array_length(credits) <= 30 AND pg_column_size(credits) <= 12000);
ALTER TABLE public.shield_works DROP CONSTRAINT IF EXISTS shield_works_platforms_check;
ALTER TABLE public.shield_works ADD CONSTRAINT shield_works_platforms_check
  CHECK (jsonb_typeof(platforms) = 'object' AND pg_column_size(platforms) <= 4000);

-- seal history (certificate chain)
CREATE TABLE IF NOT EXISTS public.shield_seals (
  id bigserial PRIMARY KEY,
  work_id uuid NOT NULL REFERENCES public.shield_works(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  seal text NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shield_seals_work_idx ON public.shield_seals (work_id, created_at DESC);
ALTER TABLE public.shield_seals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shield_seals_owner_read ON public.shield_seals;
CREATE POLICY shield_seals_owner_read ON public.shield_seals FOR SELECT TO authenticated USING (owner_id = (select auth.uid()));

-- the seal columns can only change through shield_seal()
CREATE OR REPLACE FUNCTION public.shield_works_guard_seal()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $$
begin
  if (new.meta_seal is distinct from old.meta_seal or new.sealed_at is distinct from old.sealed_at)
     and coalesce(current_setting('shield.sealing', true), '') <> '1' then
    raise exception 'The metadata seal can only be set with Seal metadata';
  end if;
  return new;
end;
$$;
DROP TRIGGER IF EXISTS shield_works_guard_seal ON public.shield_works;
CREATE TRIGGER shield_works_guard_seal BEFORE UPDATE ON public.shield_works FOR EACH ROW EXECUTE FUNCTION public.shield_works_guard_seal();

CREATE OR REPLACE FUNCTION public.shield_canon(w public.shield_works)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $$
  select jsonb_build_object('owner', w.owner_id, 'title', w.title, 'artist', w.artist, 'isrc', w.isrc, 'upc', w.upc, 'sha256', w.sha256, 'credits', w.credits)::text
$$;

CREATE OR REPLACE FUNCTION public.shield_seal(p_work uuid)
 RETURNS TABLE(seal text, sealed_at timestamptz)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
declare
  w public.shield_works;
  h text;
  ts timestamptz := now();
begin
  select * into w from public.shield_works where id = p_work and owner_id = auth.uid();
  if not found then raise exception 'Song not found'; end if;
  h := encode(sha256(convert_to(public.shield_canon(w), 'UTF8')), 'hex');
  perform set_config('shield.sealing', '1', true);
  update public.shield_works set meta_seal = h, sealed_at = ts where id = p_work;
  perform set_config('shield.sealing', '', true);
  insert into public.shield_seals (work_id, owner_id, seal, snapshot, created_at)
  values (p_work, w.owner_id, h, jsonb_build_object('title', w.title, 'artist', w.artist, 'isrc', w.isrc, 'upc', w.upc, 'sha256', w.sha256, 'credits', w.credits), ts);
  return query select h, ts;
end;
$$;

CREATE OR REPLACE FUNCTION public.shield_verify(p_work uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  select coalesce((select w.meta_seal = encode(sha256(convert_to(public.shield_canon(w), 'UTF8')), 'hex')
                   from public.shield_works w where w.id = p_work and (w.owner_id = auth.uid() or public.my_rank() >= 3)), false)
$$;

-- how many OTHER Nexus registrations share this ISRC / UPC / audio hash (counts only, no details)
CREATE OR REPLACE FUNCTION public.shield_conflicts(p_work uuid)
 RETURNS TABLE(kind text, n integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  with me as (select * from public.shield_works where id = p_work and owner_id = auth.uid())
  select k.kind, k.n from (
    select 'isrc'::text as kind, (select count(*)::int from public.shield_works o, me where me.isrc is not null and o.isrc = me.isrc and o.id <> me.id and o.owner_id <> me.owner_id) as n
    union all
    select 'upc', (select count(*)::int from public.shield_works o, me where me.upc is not null and o.upc = me.upc and o.id <> me.id and o.owner_id <> me.owner_id)
    union all
    select 'audio', (select count(*)::int from public.shield_works o, me where me.sha256 is not null and o.sha256 = me.sha256 and o.id <> me.id and o.owner_id <> me.owner_id)
  ) k where exists (select 1 from me)
$$;

REVOKE ALL ON FUNCTION public.shield_seal(uuid), public.shield_verify(uuid), public.shield_conflicts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shield_seal(uuid), public.shield_verify(uuid), public.shield_conflicts(uuid) TO authenticated;

-- time-limited collaborator access in shield_check
CREATE OR REPLACE FUNCTION public.shield_check(p_hashes integer[], p_times integer[], p_context text, p_as uuid DEFAULT NULL::uuid, p_sha256 text DEFAULT NULL::text)
 RETURNS TABLE(work_id uuid, title text, artist text, owner_id uuid, score integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  who uuid := auth.uid();
  r record;
  conv uuid;
  uname text;
begin
  if who is null then raise exception 'Sign in first'; end if;
  if p_as is not null and public.my_rank() >= 3 then who := p_as; end if;
  if cardinality(p_hashes) <> cardinality(p_times) or cardinality(p_hashes) > 12000 then raise exception 'Bad fingerprint'; end if;
  for r in
    with q as (select x.h, x.t from unnest(p_hashes, p_times) as x(h, t)),
    cand as (
      select w.id, w.title, w.artist, w.owner_id, w.sha256, w.content_id, w.strict,
             (w.policy = 'block' and w.status = 'locked' and (w.unlock_at is null or w.unlock_at > now())
               and (p_context = any (w.block_where))) as blocks
      from public.shield_works w
      where p_context = 'tool'
         or (w.owner_id <> who and not (who = any (w.allow_users) and (w.allow_until is null or w.allow_until > now())))
    ),
    act as (select cand.* from cand where cand.blocks or cand.content_id or p_context = 'tool'),
    m as (select s.work_id as wid, (s.t - q.t) / 2 as b, q.h from q join public.shield_hashes s on s.hash = q.h where s.work_id in (select act.id from act)),
    bins as (select m.wid, m.b, count(distinct m.h)::int as c from m group by 1, 2),
    best as (select bins.wid, max(bins.c)::int as c from bins group by 1),
    sc as (
      select a.id, a.title, a.artist, a.owner_id, a.blocks, a.content_id, a.strict,
             greatest(coalesce(be.c, 0), case when p_sha256 is not null and a.sha256 = p_sha256 then 1000 else 0 end)::int as s
      from act a left join best be on be.wid = a.id
    )
    select sc.* from sc where sc.s >= case when sc.strict then 40 else 60 end order by sc.s desc limit 5
  loop
    if r.blocks or p_context = 'tool' then
      work_id := r.id; title := r.title; artist := r.artist; owner_id := r.owner_id; score := r.s;
      return next;
    elsif r.content_id then
      if not exists (select 1 from public.content_claims cc where cc.work_id = r.id and cc.uploader_id = who and cc.context = p_context and cc.created_at > now() - interval '1 day') then
        insert into public.content_claims (work_id, owner_id, uploader_id, context, score) values (r.id, r.owner_id, who, p_context, r.s);
        select coalesce(p.username, 'someone') into uname from public.profiles p where p.id = who;
        conv := public.dm_between('00000000-0000-4000-8000-00000000b001', r.owner_id);
        perform public.bot_say('00000000-0000-4000-8000-00000000b001', conv,
          format('🎯 Content ID match: “%s” was used in a %s upload by @%s (score %s). Review it in Studio → Content ID.', r.title, p_context, uname, r.s));
      end if;
    end if;
  end loop;
end;
$function$;

-- Instagram song link + artist profile link per release / protected song
CREATE TABLE IF NOT EXISTS public.release_social_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  release_id uuid REFERENCES public.dist_releases(id) ON DELETE CASCADE,
  work_id uuid REFERENCES public.shield_works(id) ON DELETE CASCADE,
  instagram_song_url text CHECK (instagram_song_url IS NULL OR (char_length(instagram_song_url) <= 400 AND instagram_song_url ~ '^https://(www\.)?instagram\.com/reels/audio/[0-9]+/?(\?.*)?$')),
  instagram_artist_url text CHECK (instagram_artist_url IS NULL OR (char_length(instagram_artist_url) <= 200 AND instagram_artist_url ~ '^https://(www\.)?instagram\.com/[A-Za-z0-9._]{1,30}/?(\?.*)?$')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (release_id IS NOT NULL OR work_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS release_social_links_release_uq ON public.release_social_links (release_id) WHERE release_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS release_social_links_work_uq ON public.release_social_links (work_id) WHERE work_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS release_social_links_owner_idx ON public.release_social_links (owner_id);
ALTER TABLE public.release_social_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS release_social_links_own ON public.release_social_links;
CREATE POLICY release_social_links_own ON public.release_social_links FOR ALL TO authenticated
  USING (owner_id = (select auth.uid())) WITH CHECK (owner_id = (select auth.uid()));
