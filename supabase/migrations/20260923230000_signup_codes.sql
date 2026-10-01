-- Sign-up codes, checked on the server (same design as Pingmee).
--
-- Today the live send-otp takes the code from the app and the live complete-signup creates the
-- account without checking anything, so anyone can create an account on any email. From now on:
--   send-otp        makes the code, stores only its SHA-256 hash here, emails the code
--   verify-otp      checks a typed code (5 tries), stamps verified_at on a match
--   complete-signup creates the account only for a code verified in the last 30 minutes
--   the rule below  stops Supabase Auth creating an email account without that stamp, which
--                   closes the public sign-up endpoint (it needs only the public app key)
--
-- The rule is off until switched on: Dashboard -> Authentication -> Hooks -> Before User Created
-- -> Postgres function public.hook_require_verified_signup. Switching it off undoes it instantly.

-- 1. Codes. Only the edge functions (service role) can read or write them.
create table public.otp_codes (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0 check (attempts between 0 and 10),
  used        boolean not null default false,
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);
create index otp_codes_email_active on public.otp_codes (email, used, expires_at desc);
create index otp_codes_email_created on public.otp_codes (email, created_at desc);
create index otp_codes_email_verified on public.otp_codes (email, verified_at desc)
  where verified_at is not null;
alter table public.otp_codes enable row level security;
revoke all on table public.otp_codes from public, anon, authenticated;

-- 2. Send limits per network address, so a script cannot send codes to many emails.
create table public.auth_rate_limits (
  id         uuid primary key default gen_random_uuid(),
  ip         text not null,
  action     text not null,
  created_at timestamptz not null default now()
);
create index auth_rate_limits_ip_action_time on public.auth_rate_limits (ip, action, created_at desc);
alter table public.auth_rate_limits enable row level security;
revoke all on table public.auth_rate_limits from public, anon, authenticated;

-- 3. The rule Supabase Auth runs before creating any user.
--   email          -> allowed only if a code for this email was verified in the last 30 minutes
--   apple / google -> allowed (the provider checked the email)
--   anything else  -> refused
create function public.hook_require_verified_signup(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_provider text := event #>> '{user,app_metadata,provider}';
  v_email    text := lower(trim(event #>> '{user,email}'));
begin
  if v_provider in ('apple', 'google') then
    return '{}'::jsonb;
  end if;

  if v_provider = 'email' then
    -- No `used` filter: a verified row is used by design. Stored emails are already lowercased.
    if exists (
      select 1 from public.otp_codes c
      where c.email = v_email
        and c.verified_at > now() - interval '30 minutes'
    ) then
      return '{}'::jsonb;
    end if;
    raise log 'hook_require_verified_signup: email sign-up without a verified code for %', v_email;
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403, 'message', 'Verify your email code first.'));
  end if;

  raise log 'hook_require_verified_signup: refused provider % for %', coalesce(v_provider, '(none)'), v_email;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403, 'message', 'Sign-up method not allowed.'));
end;
$$;

-- Supabase Auth runs hooks as supabase_auth_admin, which has no access to otp_codes by default;
-- without both the grant and the policy every email sign-up would be refused.
grant usage on schema public to supabase_auth_admin;
grant select on table public.otp_codes to supabase_auth_admin;
create policy otp_codes_auth_admin_read on public.otp_codes
  for select to supabase_auth_admin using (true);

revoke execute on function public.hook_require_verified_signup(jsonb) from public, anon, authenticated;
grant execute on function public.hook_require_verified_signup(jsonb) to supabase_auth_admin;
