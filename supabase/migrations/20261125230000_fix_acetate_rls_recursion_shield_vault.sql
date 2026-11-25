-- Fix: "infinite recursion detected in policy for relation acetate_projects".
-- acetate_projects_collab_read -> acetate_collaborators -> (owner_write/read) -> acetate_projects ... looped,
-- and because storage.objects SELECT policies join these tables, EVERY storage upload with upsert
-- (e.g. Shield "Protect song" -> vault) failed with "The database schema is invalid or incompatible".
-- Break the cycle with SECURITY DEFINER helpers (they bypass RLS on the two tables).

CREATE OR REPLACE FUNCTION public.acetate_owns_project(p_project uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ select exists (select 1 from public.acetate_projects p where p.id = p_project and p.owner_id = (select auth.uid())) $$;

CREATE OR REPLACE FUNCTION public.acetate_is_collab(p_project uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ select exists (select 1 from public.acetate_collaborators c where c.project_id = p_project and c.user_id = (select auth.uid())) $$;

REVOKE ALL ON FUNCTION public.acetate_owns_project(uuid), public.acetate_is_collab(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acetate_owns_project(uuid), public.acetate_is_collab(uuid) TO authenticated;

DROP POLICY IF EXISTS acetate_projects_collab_read ON public.acetate_projects;
CREATE POLICY acetate_projects_collab_read ON public.acetate_projects FOR SELECT TO authenticated
  USING (public.acetate_is_collab(id));

DROP POLICY IF EXISTS acetate_collaborators_owner_write ON public.acetate_collaborators;
CREATE POLICY acetate_collaborators_owner_write ON public.acetate_collaborators FOR ALL TO authenticated
  USING (public.acetate_owns_project(project_id)) WITH CHECK (public.acetate_owns_project(project_id));

DROP POLICY IF EXISTS acetate_collaborators_read ON public.acetate_collaborators;
CREATE POLICY acetate_collaborators_read ON public.acetate_collaborators FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR public.acetate_owns_project(project_id));

-- Shield vault: uploads use upsert, which also needs an UPDATE policy.
DROP POLICY IF EXISTS "shield vault update" ON storage.objects;
CREATE POLICY "shield vault update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'shield-vault' AND (storage.foldername(name))[1] = (select auth.uid())::text)
  WITH CHECK (bucket_id = 'shield-vault' AND (storage.foldername(name))[1] = (select auth.uid())::text);
