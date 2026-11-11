-- Editors can add, reorder, and remove cuts on a shared playlist.
-- Listeners can play those cuts. Storage paths stay off the versions table;
-- a member signs only the files that belong to a playlist they were invited to.

drop policy if exists acetate_memberships_editor_insert on public.acetate_memberships;
create policy acetate_memberships_editor_insert on public.acetate_memberships
  for insert to authenticated
  with check (
    exists (
      select 1 from public.acetate_collaborators c
      where c.project_id = acetate_memberships.project_id
        and c.user_id = (select auth.uid())
        and c.role = 'editor'
    )
    and public.acetate_can_hear(track_id)
  );

drop policy if exists acetate_memberships_editor_delete on public.acetate_memberships;
create policy acetate_memberships_editor_delete on public.acetate_memberships
  for delete to authenticated
  using (
    exists (
      select 1 from public.acetate_collaborators c
      where c.project_id = acetate_memberships.project_id
        and c.user_id = (select auth.uid())
        and c.role = 'editor'
    )
  );

create or replace function public.acetate_collab_versions(p_tracks uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in required'; end if;
  if p_tracks is null or cardinality(p_tracks) = 0 then return '[]'::jsonb; end if;
  if cardinality(p_tracks) > 80 then raise exception 'Too many cuts'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', v.id,
      'track_id', v.track_id,
      'label', v.label,
      'version', v.version,
      'path', v.path,
      'mime', v.mime,
      'bytes', v.bytes,
      'duration', v.duration,
      'peaks', v.peaks
    ))
    from (
      select distinct on (ver.track_id) ver.*
      from public.acetate_versions ver
      where ver.track_id = any(p_tracks)
        and public.acetate_can_hear(ver.track_id)
      order by ver.track_id, ver.version desc
    ) v
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.acetate_collab_versions(uuid[]) from public, anon;
grant execute on function public.acetate_collab_versions(uuid[]) to authenticated;

drop policy if exists acetate_obj_collab_read on storage.objects;
create policy acetate_obj_collab_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'acetate'
    and (
      exists (
        select 1
        from public.acetate_versions v
        join public.acetate_memberships m on m.track_id = v.track_id
        join public.acetate_collaborators c on c.project_id = m.project_id
        where v.path = name and c.user_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.acetate_tracks t
        join public.acetate_memberships m on m.track_id = t.id
        join public.acetate_collaborators c on c.project_id = m.project_id
        where t.artwork_path = name and c.user_id = (select auth.uid())
      )
    )
  );
