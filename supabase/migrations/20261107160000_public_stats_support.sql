-- Public homepage stats · Contact us / help tickets (staff replies are emailed by /api/support/*)

-- ───────────── homepage numbers (safe aggregates only) ─────────────
create or replace function public.public_stats()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'members', (select count(*) from public.profiles where not coalesce(is_bot, false)),
    'messages', (select count(*) from public.messages),
    'servers', (select count(*) from public.spaces),
    'messages_24h', (select count(*) from public.messages where created_at > now() - interval '24 hours'),
    'at', now()
  );
$$;
revoke execute on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated, service_role;

-- ───────────── help tickets ─────────────
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_no bigint generated always as identity,
  access_key text not null default encode(extensions.gen_random_bytes(18), 'hex'),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  email text not null check (char_length(email) between 5 and 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  category text not null default 'general' check (category in ('general', 'account', 'billing', 'bug', 'safety', 'music', 'other')),
  subject text not null check (char_length(subject) between 3 and 120),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists support_tickets_no_idx on public.support_tickets (ticket_no);
create index if not exists support_tickets_status_idx on public.support_tickets (status, updated_at desc);
create index if not exists support_tickets_email_idx on public.support_tickets (lower(email), created_at desc);
create index if not exists support_tickets_user_fk_idx on public.support_tickets (user_id);
create index if not exists support_tickets_assigned_fk_idx on public.support_tickets (assigned_to);

create table if not exists public.support_messages (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  staff_id uuid references public.profiles(id) on delete set null, -- null = the customer
  body text not null check (char_length(body) between 1 and 5000),
  emailed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket_idx on public.support_messages (ticket_id, created_at);
create index if not exists support_messages_staff_fk_idx on public.support_messages (staff_id);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_tickets from anon, authenticated;
revoke all on public.support_messages from anon, authenticated;
grant select on public.support_tickets to authenticated;
grant select on public.support_messages to authenticated;
create policy "staff read tickets" on public.support_tickets for select to authenticated using (public.my_rank() >= 2);
create policy "staff read ticket messages" on public.support_messages for select to authenticated using (public.my_rank() >= 2);

-- anyone (signed in or not) can open a ticket — light per-email limits stop floods
create or replace function public.submit_support_ticket(p_name text, p_email text, p_category text, p_subject text, p_message text)
returns json language plpgsql security definer set search_path = '' as $$
declare t public.support_tickets; em text := lower(btrim(coalesce(p_email, '')));
begin
  if char_length(btrim(coalesce(p_message, ''))) < 10 then raise exception 'Tell us a bit more (at least 10 characters)'; end if;
  if char_length(p_message) > 5000 then raise exception 'Keep it under 5,000 characters'; end if;
  if (select count(*) from public.support_tickets where lower(email) = em and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'You''ve sent a few tickets already — we''ll reply soon. Try again in an hour.';
  end if;
  if (select count(*) from public.support_tickets where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Our inbox is busy — please try again in a minute';
  end if;
  insert into public.support_tickets (user_id, name, email, category, subject)
  values ((select auth.uid()), left(btrim(p_name), 80), em,
          case when p_category in ('general', 'account', 'billing', 'bug', 'safety', 'music', 'other') then p_category else 'general' end,
          left(btrim(p_subject), 120))
  returning * into t;
  insert into public.support_messages (ticket_id, body) values (t.id, btrim(p_message));
  return json_build_object('id', t.id, 'ticket_no', t.ticket_no, 'key', t.access_key, 'email', t.email, 'name', t.name, 'subject', t.subject);
end $$;
revoke execute on function public.submit_support_ticket(text, text, text, text, text) from public;
grant execute on function public.submit_support_ticket(text, text, text, text, text) to anon, authenticated, service_role;

-- the customer's private link (from the email) shows the thread and lets them answer
create or replace function public.get_support_ticket(p_id uuid, p_key text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'ticket_no', t.ticket_no, 'subject', t.subject, 'status', t.status, 'category', t.category, 'name', t.name, 'created_at', t.created_at,
    'messages', coalesce((select json_agg(json_build_object('from', case when m.staff_id is null then 'you' else 'support' end,
                                                             'staff', (select display_name from public.profiles p where p.id = m.staff_id),
                                                             'body', m.body, 'at', m.created_at) order by m.created_at)
                          from public.support_messages m where m.ticket_id = t.id), '[]'::json))
  from public.support_tickets t where t.id = p_id and t.access_key = p_key;
$$;
revoke execute on function public.get_support_ticket(uuid, text) from public;
grant execute on function public.get_support_ticket(uuid, text) to anon, authenticated, service_role;

create or replace function public.customer_reply_ticket(p_id uuid, p_key text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.support_tickets;
begin
  select * into t from public.support_tickets where id = p_id and access_key = p_key;
  if not found then raise exception 'Ticket not found'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 2 then raise exception 'Write a reply first'; end if;
  if (select count(*) from public.support_messages where ticket_id = p_id and staff_id is null and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Slow down a little — we''ve got your messages';
  end if;
  insert into public.support_messages (ticket_id, body) values (p_id, left(btrim(p_body), 5000));
  update public.support_tickets set status = 'open', updated_at = now() where id = p_id;
end $$;
revoke execute on function public.customer_reply_ticket(uuid, text, text) from public;
grant execute on function public.customer_reply_ticket(uuid, text, text) to anon, authenticated, service_role;

-- staff answer: stored here; /api/support/reply emails it to the customer and then marks it emailed
create or replace function public.staff_reply_ticket(p_id uuid, p_body text, p_close boolean default false)
returns json language plpgsql security definer set search_path = '' as $$
declare t public.support_tickets; mid bigint;
begin
  if public.my_rank() < 2 then raise exception 'Staff only'; end if;
  select * into t from public.support_tickets where id = p_id;
  if not found then raise exception 'Ticket not found'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 2 then raise exception 'Write a reply first'; end if;
  insert into public.support_messages (ticket_id, staff_id, body) values (p_id, auth.uid(), left(btrim(p_body), 5000)) returning id into mid;
  update public.support_tickets set status = case when p_close then 'closed' else 'answered' end, updated_at = now(),
         assigned_to = coalesce(assigned_to, auth.uid()) where id = p_id;
  perform public.log_admin(t.user_id, 'support_reply', jsonb_build_object('ticket', t.ticket_no));
  return json_build_object('message_id', mid, 'ticket_no', t.ticket_no, 'email', t.email, 'name', t.name, 'subject', t.subject, 'key', t.access_key, 'id', t.id,
                           'staff', (select display_name from public.profiles where id = auth.uid()));
end $$;
revoke execute on function public.staff_reply_ticket(uuid, text, boolean) from public, anon;
grant execute on function public.staff_reply_ticket(uuid, text, boolean) to authenticated, service_role;

create or replace function public.staff_mark_emailed(p_message bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.my_rank() < 2 then raise exception 'Staff only'; end if;
  update public.support_messages set emailed = true where id = p_message;
end $$;
revoke execute on function public.staff_mark_emailed(bigint) from public, anon;
grant execute on function public.staff_mark_emailed(bigint) to authenticated, service_role;

create or replace function public.staff_set_ticket_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.my_rank() < 2 then raise exception 'Staff only'; end if;
  if p_status not in ('open', 'answered', 'closed') then raise exception 'Unknown status'; end if;
  update public.support_tickets set status = p_status, updated_at = now() where id = p_id;
end $$;
revoke execute on function public.staff_set_ticket_status(uuid, text) from public, anon;
grant execute on function public.staff_set_ticket_status(uuid, text) to authenticated, service_role;
