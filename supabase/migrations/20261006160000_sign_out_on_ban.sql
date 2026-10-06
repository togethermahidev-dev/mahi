-- A suspension or ban signs the person out (owner, 2026-10-06). sanction_user (20261006100000)
-- now also deletes the person's sessions and refresh tokens, so their app can't renew its sign-in:
-- the current access token runs out within the hour and they're signed out. Until then the app
-- already shows them the banned screen (profiles.is_banned). A warning signs nobody out.
-- Everything else in sanction_user is unchanged.
-- Test: supabase/tests/sign_out_on_ban_test.sql
-- Undo: supabase/rollbacks/20261006160000_sign_out_on_ban.rollback.sql

create or replace function public.sanction_user(
  p_kind text, p_user_id uuid, p_reason text, p_ends_at timestamptz, p_report_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a reason is needed' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'that person does not exist' using errcode = '22023';
  end if;
  if public.staff_role(p_user_id) is not null and p_kind <> 'warning' then
    raise exception 'staff cannot be suspended or banned here' using errcode = '22023';
  end if;
  insert into public.user_sanctions (user_id, kind, reason, report_id, created_by, ends_at)
  values (p_user_id, p_kind, p_reason, p_report_id, auth.uid(), p_ends_at);
  if p_kind in ('suspension', 'ban') then
    update public.profiles set is_banned = true where id = p_user_id;
    -- Sign them out everywhere.
    delete from auth.refresh_tokens where user_id = p_user_id::text;
    delete from auth.sessions where user_id = p_user_id;
  end if;
  v_n := public.close_reports('user', p_user_id, 'actioned', p_reason, p_report_id);
  perform public.log_moderation_action(
    case p_kind when 'warning' then 'warn_user' when 'suspension' then 'suspend_user' else 'ban_user' end,
    'user', p_user_id, p_report_id, p_reason,
    case when p_ends_at is not null then jsonb_build_object('ends_at', p_ends_at) else '{}'::jsonb end);
  return jsonb_build_object('ok', true, 'reports_closed', v_n);
end;
$$;
