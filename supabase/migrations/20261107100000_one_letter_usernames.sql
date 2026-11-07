-- Usernames can now be 1–24 characters (was 3–24; Link pages 2–24).
create or replace function public.check_username_rules(v text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if v !~ '^[a-z0-9_.]{1,24}$' then raise exception 'Usernames are 1–24 characters: letters, numbers, _ and .'; end if;
  if v ~ '^[._]|[._]$|\.\.' then raise exception 'A username can''t start or end with . or _, or have two dots in a row'; end if;
end $$;

-- same change inside existing functions, without retyping them
do $$
declare r record; def text; nd text;
begin
  for r in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('handle_new_user', 'linkbio_save', 'linkbio_admin_set_username', 'enforce_automod')
  loop
    def := pg_get_functiondef(r.oid);
    nd := replace(def, '{2,24}', '{1,24}');
    nd := replace(nd, 'if char_length(base) < 2 then', 'if char_length(base) < 1 then');
    nd := replace(nd, '@[A-Za-z0-9_.]{2,}', '@[A-Za-z0-9_.]{1,}'); -- AutoMod mention counter
    if nd <> def then execute nd; end if;
  end loop;
end $$;
