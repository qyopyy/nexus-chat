-- Nexus security hardening (review, then run in Supabase SQL editor). Safe: only removes sign-in-less access
-- to functions that do nothing useful without a signed-in user, or that only run as triggers.
-- Public pages (link in bio, gram, pre-save, support tickets, TestFlight) are NOT touched.

revoke execute on function public.acetate_mark_notifications(bigint)        from anon, public;
revoke execute on function public.acetate_remove_collaborator(uuid, uuid)   from anon, public;
revoke execute on function public.acetate_upload_allowed(text, bigint)      from anon, public;

-- trigger functions: run as the table owner, nobody needs to call them directly
revoke execute on function public.acetate_notify()        from anon, authenticated, public;
revoke execute on function public.acetate_storage_guard() from anon, authenticated, public;
revoke execute on function public.poll_votes_guard()      from anon, authenticated, public;
revoke execute on function public.nexus_locator_track()   from anon, authenticated, public;

-- Also: Supabase Dashboard -> Authentication -> Providers/Password -> turn on "Leaked password protection".
