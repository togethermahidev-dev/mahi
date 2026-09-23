-- Minimal stand-ins for Supabase-managed pieces, so `scripts/db.sh local` can replay every
-- migration and run the pgTAP tests on plain Postgres 17. Local only — never applied to Supabase.

-- Roles are cluster-wide, so they survive the database being dropped between runs.
do $$
begin
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
exception when duplicate_object then null;
end $$;
do $$
begin
  create role supabase_auth_admin nologin;
exception when duplicate_object then null;
end $$;

create schema extensions;
create schema auth;
create schema storage;
create schema vault;
create schema cron;
create schema net;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- auth
create table auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'role', '')
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

-- storage
create table storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz,
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
create function storage.filename(name text) returns text language sql immutable as $$
  select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;

-- vault, cron, net (pg_cron and pg_net are not available locally)
create view vault.decrypted_secrets as
  select null::text as name, null::text as decrypted_secret where false;
create function cron.schedule(job_name text, schedule text, command text) returns bigint
  language sql as $$ select 1::bigint $$;
create function cron.unschedule(job_name text) returns boolean language sql as $$ select true $$;
create function net.http_post(
  url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000
) returns bigint language sql as $$ select 1::bigint $$;

create publication supabase_realtime;

-- migration history (rollback scripts delete their own row)
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (
  version text primary key,
  name text,
  statements text[]
);

-- Supabase's default grants
grant usage on schema public, auth, storage, extensions, vault to anon, authenticated, service_role;
grant all on all tables in schema storage to authenticated, service_role;
grant execute on all functions in schema auth, storage to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
