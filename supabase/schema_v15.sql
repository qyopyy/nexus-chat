-- Chat delight: saved messages, pins, in-chat search
create table if not exists public.message_saves (
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
create index if not exists message_saves_user_idx on public.message_saves (user_id, created_at desc);

alter table public.message_saves enable row level security;
drop policy if exists "message_saves read" on public.message_saves;
create policy "message_saves read" on public.message_saves for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "message_saves insert" on public.message_saves;
create policy "message_saves insert" on public.message_saves for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id and public.is_conversation_member(m.conversation_id)
    )
  );
drop policy if exists "message_saves delete" on public.message_saves;
create policy "message_saves delete" on public.message_saves for delete to authenticated
  using (user_id = auth.uid());

create table if not exists public.message_pins (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  pinned_by uuid references public.profiles (id) on delete set null,
  pinned_at timestamptz not null default now(),
  primary key (conversation_id, message_id)
);
create index if not exists message_pins_conv_idx on public.message_pins (conversation_id, pinned_at desc);

alter table public.message_pins enable row level security;
drop policy if exists "message_pins read" on public.message_pins;
create policy "message_pins read" on public.message_pins for select to authenticated
  using (public.is_conversation_member(conversation_id));
drop policy if exists "message_pins write" on public.message_pins;
create policy "message_pins write" on public.message_pins for insert to authenticated
  with check (
    public.is_conversation_member(conversation_id)
    and exists (select 1 from public.messages m where m.id = message_id and m.conversation_id = conversation_id)
  );
drop policy if exists "message_pins delete" on public.message_pins;
create policy "message_pins delete" on public.message_pins for delete to authenticated
  using (public.is_conversation_member(conversation_id));

-- Pin / unpin helpers (any member; staff-only for spaces optional later)
create or replace function public.pin_message(p_message uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  cid uuid;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select conversation_id into cid from public.messages where id = p_message and deleted_at is null;
  if cid is null then raise exception 'Message not found'; end if;
  if not public.is_conversation_member(cid) then raise exception 'Not in this chat'; end if;
  insert into public.message_pins (conversation_id, message_id, pinned_by)
  values (cid, p_message, me)
  on conflict do nothing;
end;
$$;

create or replace function public.unpin_message(p_message uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  cid uuid;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select conversation_id into cid from public.messages where id = p_message;
  if cid is null then raise exception 'Message not found'; end if;
  if not public.is_conversation_member(cid) then raise exception 'Not in this chat'; end if;
  delete from public.message_pins where message_id = p_message and conversation_id = cid;
end;
$$;

create or replace function public.toggle_save_message(p_message uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  cid uuid;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select conversation_id into cid from public.messages where id = p_message and deleted_at is null;
  if cid is null then raise exception 'Message not found'; end if;
  if not public.is_conversation_member(cid) then raise exception 'Not in this chat'; end if;
  if exists (select 1 from public.message_saves where user_id = me and message_id = p_message) then
    delete from public.message_saves where user_id = me and message_id = p_message;
    return false;
  end if;
  insert into public.message_saves (user_id, message_id) values (me, p_message);
  return true;
end;
$$;

create or replace function public.search_messages(p_conv uuid, p_q text, p_limit int default 40)
returns setof public.messages
language plpgsql security definer set search_path = '' as $$
declare
  q text := trim(coalesce(p_q, ''));
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not public.is_conversation_member(p_conv) then raise exception 'Not in this chat'; end if;
  if char_length(q) < 2 then return; end if;
  return query
    select m.*
    from public.messages m
    where m.conversation_id = p_conv
      and m.deleted_at is null
      and m.content ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
    order by m.created_at desc
    limit least(80, greatest(1, coalesce(p_limit, 40)));
end;
$$;

create or replace function public.list_saved_messages(p_limit int default 50)
returns table (
  saved_at timestamptz,
  message_id uuid,
  conversation_id uuid,
  author_id uuid,
  content text,
  attachment_name text,
  attachment_type text,
  created_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  return query
    select s.created_at, m.id, m.conversation_id, m.author_id, m.content, m.attachment_name, m.attachment_type, m.created_at
    from public.message_saves s
    join public.messages m on m.id = s.message_id
    where s.user_id = auth.uid() and m.deleted_at is null
      and public.is_conversation_member(m.conversation_id)
    order by s.created_at desc
    limit least(100, greatest(1, coalesce(p_limit, 50)));
end;
$$;

grant execute on function public.pin_message(uuid) to authenticated;
grant execute on function public.unpin_message(uuid) to authenticated;
grant execute on function public.toggle_save_message(uuid) to authenticated;
grant execute on function public.search_messages(uuid, text, int) to authenticated;
grant execute on function public.list_saved_messages(int) to authenticated;
