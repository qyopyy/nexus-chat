-- Show who removed a message: staff deletions (moderator / admin / founder) leave a labelled bar in the chat.
-- deleted_by / deleted_by_role can only be written by mod_delete_message (SECURITY DEFINER), never by a client update.

alter table public.messages
  add column if not exists deleted_by uuid references public.profiles (id) on delete set null,
  add column if not exists deleted_by_role text;

create or replace function public.mod_delete_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
  staff_role text;
begin
  select author_id into author from public.messages where id = p_id;
  if author is null then raise exception 'Message not found'; end if;
  if author <> auth.uid() then
    perform public.assert_can_moderate(author, 2);
    perform public.log_admin(author, 'delete_message', jsonb_build_object('message', p_id));
    select site_role into staff_role from public.profiles where id = auth.uid();
  end if;
  update public.messages
     set deleted_at = coalesce(deleted_at, now()),
         deleted_by = case when author <> auth.uid() then auth.uid() else null end,
         deleted_by_role = case when author <> auth.uid() then staff_role else null end
   where id = p_id;
end;
$$;

create or replace function public.protect_message_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if new.conversation_id is distinct from old.conversation_id or new.author_id is distinct from old.author_id
     or new.created_at is distinct from old.created_at or new.id is distinct from old.id
     or new.bot_name is distinct from old.bot_name or new.hidden is distinct from old.hidden
     or new.reply_to_id is distinct from old.reply_to_id then
    raise exception 'Only the text of a message can be edited';
  end if;
  if new.deleted_by is distinct from old.deleted_by or new.deleted_by_role is distinct from old.deleted_by_role then
    raise exception 'Deletion details can only be set by a moderator action';
  end if;
  return new;
end $$;
