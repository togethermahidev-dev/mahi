-- "Invite a mate" makes its link on tap, before the share sheet opens. When the sheet is closed
-- without sending (owner, 2026-10-07: "it generates an invite link"), the app takes that link back
-- with discard_unsent_invite: it is deleted, so it never shows in "Your invites" nor counts towards
-- max_open_invites. Only the inviter's own link for a mate (no tag behind it) that was never sent,
-- never resent, never claimed and never cancelled. Anything else: false, nothing changes.
begin;

create function public.discard_unsent_invite(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from public.invites
  where token = p_token
    and inviter_id = v_uid
    and challenge_id is null
    and sent_via is null
    and claimed_at is null
    and cancelled_at is null;
  return found;
end;
$$;

revoke execute on function public.discard_unsent_invite(text) from public, anon, authenticated;
grant execute on function public.discard_unsent_invite(text) to authenticated;

notify pgrst, 'reload schema';

commit;
