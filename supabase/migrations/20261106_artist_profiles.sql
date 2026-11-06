begin;
alter table profiles add column if not exists custom_domain text;
alter table profiles add column if not exists links jsonb default '{}'::jsonb not null;
alter table profiles add column if not exists verified boolean default false;
alter table profiles add constraint username_length_check check (char_length(username)>=1 and char_length(username)<=30);
commit;