-- Allow authenticated users to record story views (column-level, matching other gram tables)
grant insert (story_id, viewer_id) on public.gram_story_views to authenticated;
grant insert, delete on public.gram_story_likes to authenticated;
grant select on public.gram_story_views to authenticated;
grant select on public.gram_story_likes to authenticated;
