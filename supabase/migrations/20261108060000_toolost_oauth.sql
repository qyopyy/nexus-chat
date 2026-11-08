-- Too Lost uses OAuth 2.0 (Authorization Code + PKCE), not a plain API key.
-- Admins save the app's Client ID / Client Secret per environment; the `toolost` edge function runs the
-- OAuth connect + token refresh and keeps tokens in dist_settings (no client access, see 20261108050000).
drop function if exists public.admin_set_toolost(text, text, boolean);
delete from public.dist_settings where key in ('toolost_key_sandbox', 'toolost_key_production');

create or replace function public.admin_set_toolost_client(p_env text, p_client_id text, p_client_secret text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cid text := btrim(coalesce(p_client_id, '')); sec text := btrim(coalesce(p_client_secret, ''));
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  if p_env not in ('sandbox', 'production') then raise exception 'Pick sandbox or production'; end if;
  if cid = '' then
    delete from public.dist_settings where key in ('toolost_client_id_' || p_env, 'toolost_client_secret_' || p_env, 'toolost_token_' || p_env, 'toolost_account_' || p_env);
  else
    if char_length(cid) > 200 or cid ~ '\s' then raise exception 'That does not look like a Client ID'; end if;
    if sec <> '' and (char_length(sec) < 16 or char_length(sec) > 400 or sec ~ '\s') then raise exception 'That does not look like a Client Secret'; end if;
    insert into public.dist_settings (key, value, updated_at) values ('toolost_client_id_' || p_env, cid, now())
      on conflict (key) do update set value = excluded.value, updated_at = now();
    if sec <> '' then
      insert into public.dist_settings (key, value, updated_at) values ('toolost_client_secret_' || p_env, sec, now())
        on conflict (key) do update set value = excluded.value, updated_at = now();
    end if;
    insert into public.dist_settings (key, value, updated_at) values ('toolost_env', p_env, now())
      on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  perform public.log_admin(null, 'toolost_client', jsonb_build_object('env', p_env, 'cleared', cid = '', 'secret', sec <> ''));
  return public.admin_toolost_status();
end $$;

create or replace function public.admin_toolost_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare out jsonb := '{}'; e text; cid text; sec record; tok record; acc text;
begin
  if public.my_rank() < 3 then raise exception 'Admins only'; end if;
  foreach e in array array['sandbox', 'production'] loop
    select value into cid from public.dist_settings where key = 'toolost_client_id_' || e;
    select updated_at into sec from public.dist_settings where key = 'toolost_client_secret_' || e;
    select value, updated_at into tok from public.dist_settings where key = 'toolost_token_' || e;
    select value into acc from public.dist_settings where key = 'toolost_account_' || e;
    out := out || jsonb_build_object(e, jsonb_build_object(
      'client_id', case when cid is null then null else left(cid, 6) || '••••' || right(cid, 4) end,
      'has_secret', sec.updated_at is not null,
      'connected', tok.value is not null,
      'connected_at', tok.updated_at,
      'expires_at', case when tok.value is null then null else (tok.value::jsonb ->> 'refresh_expires_at') end,
      'account', acc));
  end loop;
  return jsonb_build_object('envs', out, 'env', coalesce((select value from public.dist_settings where key = 'toolost_env'), 'sandbox'));
end $$;

revoke execute on function public.admin_set_toolost_client(text, text, text) from public, anon;
grant execute on function public.admin_set_toolost_client(text, text, text) to authenticated;
revoke execute on function public.admin_toolost_status() from public, anon;
grant execute on function public.admin_toolost_status() to authenticated;
