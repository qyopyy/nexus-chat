-- Shield 360: per-song protection switches
--   block_where  : where a locked song is blocked (chat, video, space, release, send, sound, short)
--                  "TikTok sound block" = sound + short (+ video) — nobody can reuse the song as a sound / in a short
--   notify_owner : Nexus bot DMs the owner on every blocked attempt
--   strict       : lower match threshold so cuts / remix-style copies are caught more often
ALTER TABLE public.shield_works
  ADD COLUMN IF NOT EXISTS block_where text[] NOT NULL DEFAULT ARRAY['chat','video','space','release','send','sound','short']::text[],
  ADD COLUMN IF NOT EXISTS notify_owner boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS strict boolean NOT NULL DEFAULT false;

ALTER TABLE public.shield_works DROP CONSTRAINT IF EXISTS shield_works_block_where_check;
ALTER TABLE public.shield_works ADD CONSTRAINT shield_works_block_where_check
  CHECK (block_where <@ ARRAY['chat','video','space','release','send','sound','short']::text[]);

ALTER TABLE public.shield_events DROP CONSTRAINT IF EXISTS shield_events_context_check;
ALTER TABLE public.shield_events ADD CONSTRAINT shield_events_context_check
  CHECK (context = ANY (ARRAY['chat','video','release','space','tool','send','sound','short']::text[]));

CREATE OR REPLACE FUNCTION public.shield_check(p_hashes integer[], p_times integer[], p_context text, p_as uuid DEFAULT NULL::uuid, p_sha256 text DEFAULT NULL::text)
 RETURNS TABLE(work_id uuid, title text, artist text, owner_id uuid, score integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
      where p_context = 'tool' or (w.owner_id <> who and not (who = any (w.allow_users)))
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

-- log the block and (optionally) tell the owner — at most one DM per uploader + song per hour
CREATE OR REPLACE FUNCTION public.shield_log(p_work uuid, p_context text, p_score integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  w record;
  uname text;
  conv uuid;
  where_txt text;
begin
  if p_context = 'tool' then return; end if;
  select id, title, owner_id, notify_owner into w from public.shield_works where id = p_work;
  if not found then return; end if;
  insert into public.shield_events (work_id, user_id, context, score)
  values (p_work, auth.uid(), p_context, least(greatest(p_score, 0), 100000));
  if w.notify_owner and w.owner_id is distinct from auth.uid()
     and (select count(*) from public.shield_events e where e.work_id = p_work and e.user_id is not distinct from auth.uid() and e.at > now() - interval '1 hour') <= 1 then
    select coalesce(p.username, 'someone') into uname from public.profiles p where p.id = auth.uid();
    where_txt := case p_context when 'chat' then 'in a chat' when 'video' then 'as a video' when 'space' then 'in a space' when 'release' then 'as a release' when 'send' then 'to stores'
                                when 'sound' then 'as a sound' when 'short' then 'as a short / TikTok-style sound' else p_context end;
    conv := public.dm_between('00000000-0000-4000-8000-00000000b001', w.owner_id);
    perform public.bot_say('00000000-0000-4000-8000-00000000b001', conv,
      format('🛡️ Shield blocked @%s from using “%s” %s. See Studio → Shield 360.', uname, w.title, where_txt));
  end if;
end;
$function$;
