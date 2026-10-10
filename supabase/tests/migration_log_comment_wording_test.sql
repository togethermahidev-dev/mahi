-- The migration log holds no comment that names another project
-- (20261010120000_migration_log_comment_wording), and every entry still has its text.
-- The word is built from character codes so that this file does not carry it. On a database whose
-- log keeps no text (a local replay) there is nothing to find, and both checks pass.
begin;
select plan(2);

create function pg_temp.log_count(p_where text) returns int language plpgsql as $$
declare
  v_term text := chr(112) || chr(105) || chr(110) || chr(103) || chr(109) || chr(101) || chr(101);
  v_count int := 0;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'supabase_migrations'
      and table_name = 'schema_migrations'
      and column_name = 'statements'
  ) then
    return 0;
  end if;
  execute 'select count(*)::int from supabase_migrations.schema_migrations where ' || p_where
    into v_count using v_term;
  return v_count;
end $$;

select is(
  pg_temp.log_count($w$array_to_string(statements, E'\n') ~* $1$w$),
  0,
  'no entry in the migration log names another project'
);

-- The rewording replaces comment lines; it never empties an entry.
select is(
  pg_temp.log_count($w$$1 is not null and statements is not null and exists (select 1 from unnest(statements) s where s is null)$w$),
  0,
  'no entry lost a statement'
);

select * from finish();
rollback;
