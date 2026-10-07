-- Undo 20261007150000_live_updates_and_hardening (indexes and search paths are left: harmless).
alter publication supabase_realtime drop table public.follows, public.post_likes, public.post_comments;

drop policy if exists post_tags_select on public.post_tags;
create policy post_tags_select on public.post_tags for select using (true);
grant select, insert, update, delete on public.post_tags to anon;

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('grant execute on function %s to public, anon, authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
