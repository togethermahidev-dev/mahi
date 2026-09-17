-- Test framework for supabase/tests/*.sql. Tests run inside begin … rollback and leave no data.
create extension if not exists pgtap with schema extensions;
