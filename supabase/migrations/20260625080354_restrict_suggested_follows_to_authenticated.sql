-- get_suggested_follows is a signed-in feature. Postgres grants EXECUTE to
-- PUBLIC by default, which let the anon role call it; revoke that so only the
-- explicit authenticated grant remains (matches roadmap intent, clears the
-- anon_security_definer_function_executable advisor).
revoke execute on function public.get_suggested_follows(uuid, int, int) from public, anon;
