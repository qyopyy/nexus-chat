-- Authors can edit / replace / hide the link embeds on their own messages.
alter table public.messages add column if not exists embed jsonb;
alter table public.messages drop constraint if exists messages_embed_size;
alter table public.messages add constraint messages_embed_size check (embed is null or char_length(embed::text) <= 4000);
grant update (embed) on public.messages to authenticated;
