begin;
alter table public.app_config drop column min_app_version;
delete from supabase_migrations.schema_migrations where version = '20260917113302';
commit;
