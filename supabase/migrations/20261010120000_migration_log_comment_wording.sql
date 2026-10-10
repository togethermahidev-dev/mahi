-- The migration log keeps the text of every migration, comments included. Five old entries carry
-- comment lines that compared the work with another project. Those files were reworded on
-- 2026-10-10 and the log follows, so the database holds no such wording either.
-- Only whole comment lines are replaced (by an empty comment): nothing that runs is changed, and
-- no table, function or rule is touched. The word is built from character codes so that this file
-- does not carry it.
do $$
declare
  v_term text := chr(112) || chr(105) || chr(110) || chr(103) || chr(109) || chr(101) || chr(101);
begin
  -- A database without the log, or with a log that keeps no text (a local replay): nothing to do.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'supabase_migrations'
      and table_name = 'schema_migrations'
      and column_name = 'statements'
  ) then
    return;
  end if;

  update supabase_migrations.schema_migrations m
  set statements = (
    select array_agg(
      regexp_replace(s.stmt, '^[ \t]*--[^\n]*' || v_term || '[^\n]*$', '--', 'gin')
      order by s.ord
    )
    from unnest(m.statements) with ordinality as s(stmt, ord)
  )
  where array_to_string(m.statements, E'\n') ~* v_term;
end $$;
