-- Server AutoMod: per-server rules enforced on the database (can't be bypassed by a modified client).
create table if not exists public.space_automod (
  space_id uuid primary key references public.spaces(id) on delete cascade,
  enabled boolean not null default true,
  mode text not null default 'block' check (mode in ('block','flag')),   -- block = reject the message, flag = allow + log for staff
  words text[] not null default '{}',
  block_links boolean not null default false,
  allow_domains text[] not null default '{}',
  block_invites boolean not null default true,
  max_mentions int not null default 0 check (max_mentions between 0 and 50), -- 0 = off
  max_caps_pct int not null default 0 check (max_caps_pct between 0 and 100), -- 0 = off (only for messages >= 12 letters)
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.space_automod enable row level security;
revoke all on public.space_automod from anon, authenticated;
grant select, insert, update, delete on public.space_automod to authenticated;
create policy "automod staff read" on public.space_automod for select to authenticated using (public.is_space_staff(space_id));
create policy "automod staff insert" on public.space_automod for insert to authenticated with check (public.is_space_staff(space_id));
create policy "automod staff update" on public.space_automod for update to authenticated using (public.is_space_staff(space_id)) with check (public.is_space_staff(space_id));
create policy "automod staff delete" on public.space_automod for delete to authenticated using (public.is_space_staff(space_id));

create table if not exists public.automod_hits (
  id bigint generated always as identity primary key,
  space_id uuid not null references public.spaces(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  rule text not null,
  excerpt text,
  created_at timestamptz not null default now()
);
create index if not exists automod_hits_space_idx on public.automod_hits (space_id, created_at desc);
create index if not exists automod_hits_conv_idx on public.automod_hits (conversation_id);
create index if not exists automod_hits_user_idx on public.automod_hits (user_id);
alter table public.automod_hits enable row level security;
revoke all on public.automod_hits from anon, authenticated;
grant select, delete on public.automod_hits to authenticated;
create policy "automod hits staff read" on public.automod_hits for select to authenticated using (public.is_space_staff(space_id));
create policy "automod hits staff clear" on public.automod_hits for delete to authenticated using (public.is_space_staff(space_id));

create or replace function public.enforce_automod()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  sp uuid;
  cfg public.space_automod;
  txt text := coalesce(new.content, '');
  low text;
  rule text := null;
  w text;
  letters int;
  caps int;
  url text;
  host text;
begin
  if auth.uid() is null or txt = '' then return new; end if;            -- bots / service jobs
  select c.space_id into sp from public.conversations c where c.id = new.conversation_id;
  if sp is null then return new; end if;                                 -- DMs / groups
  select * into cfg from public.space_automod where space_id = sp;
  if not found or not cfg.enabled then return new; end if;
  if public.is_space_staff(sp) then return new; end if;                  -- owner/admins are exempt
  low := lower(txt);

  foreach w in array cfg.words loop
    w := lower(trim(w));
    if w <> '' and low ~ ('(^|[^[:alnum:]])' || regexp_replace(w, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '($|[^[:alnum:]])') then
      rule := 'blocked word'; exit;
    end if;
  end loop;

  if rule is null and cfg.block_invites and low ~ '(discord\.gg/|discord(app)?\.com/invite/|nexusproject\.cc/(invite|i|join)/|t\.me/\+|chat\.whatsapp\.com/)' then
    rule := 'invite link';
  end if;

  if rule is null and cfg.block_links then
    for url in select m[1] from regexp_matches(low, '((https?://|www\.)[^\s<>"'']+)', 'g') as m loop
      host := regexp_replace(regexp_replace(url, '^(https?://)?(www\.)?', ''), '[/:?#].*$', '');
      if not exists (select 1 from unnest(cfg.allow_domains) d where host = lower(d) or host like '%.' || lower(d)) then
        rule := 'link'; exit;
      end if;
    end loop;
  end if;

  if rule is null and cfg.max_mentions > 0 and (select count(*) from regexp_matches(txt, '@[A-Za-z0-9_.]{2,}', 'g')) > cfg.max_mentions then
    rule := 'mention spam';
  end if;

  if rule is null and cfg.max_caps_pct > 0 then
    letters := length(regexp_replace(txt, '[^[:alpha:]]', '', 'g'));
    caps := length(regexp_replace(txt, '[^[:upper:]]', '', 'g'));
    if letters >= 12 and caps * 100 > letters * cfg.max_caps_pct then rule := 'too many capitals'; end if;
  end if;

  if rule is null then return new; end if;
  if cfg.mode = 'flag' then
    insert into public.automod_hits (space_id, conversation_id, user_id, rule, excerpt) values (sp, new.conversation_id, auth.uid(), rule, left(txt, 140));
    return new;
  end if;
  raise exception 'AutoMod blocked your message (%). The server staff set this rule.', rule using errcode = 'P0001';
end $$;
revoke execute on function public.enforce_automod() from public, anon, authenticated;

drop trigger if exists messages_automod on public.messages;
create trigger messages_automod before insert or update of content on public.messages
  for each row execute function public.enforce_automod();
