-- Undo 20261001100000_password_reset_codes. Redeploy the previous send-otp / verify-otp /
-- complete-signup first (the new ones filter on `purpose`), and delete send-reset-code and
-- reset-password, or they fail once the column is gone.
begin;
drop function public.auth_user_id_by_email(text);

create or replace function public.hook_require_verified_signup(event jsonb)
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

delete from public.otp_codes where purpose = 'reset';
drop index public.otp_codes_email_purpose_created;
alter table public.otp_codes drop column purpose;
delete from supabase_migrations.schema_migrations where version = '20261001100000';
commit;
