-- Who and where an invite went (owner, 2026-10-07): "Your invites" showed three rows of "Tag
-- invite · Waiting · sent 2 days ago · Code …" that "doesn't say who or where or how". Now:
--   * invites.sent_via: how it last went out (whatsapp | messages | share | contact | copy).
--   * invites.sent_to_name, sent_to_phone: whom, when the app knows (a contact texted from Find
--     your mates). The number is private: only the inviter's own list hands it back.
--   * invites.post_id: the post a link went with. A tag link's post comes from its slot, which
--     only gets one at posting, so the list reads either.
--   * record_invite_sent: the app says a share happened. The inviter's own links only; the same
--     call twice changes nothing more; it never counts as a resend (resend_invite does that).
--   * get_my_invites: the same fields as before, plus sent_via, sent_to_name, sent_to_phone,
--     post_id and post_created_at.
-- Test: supabase/tests/invite_sent_to_test.sql
-- Undo: supabase/rollbacks/20261007290000_invite_sent_to.rollback.sql

-- 1. Where it went. Older links have none of it (the app calls them "Invite link").
alter table public.invites
  add column sent_via text
    constraint invites_sent_via_check
    check (sent_via in ('whatsapp', 'messages', 'share', 'contact', 'copy')),
  add column sent_to_name text
    constraint invites_sent_to_name_check check (char_length(sent_to_name) between 1 and 60),
  add column sent_to_phone text
    constraint invites_sent_to_phone_check check (sent_to_phone ~ '^\+[1-9][0-9]{7,14}$'),
  add column post_id uuid references public.posts(id) on delete set null;

-- 2. One person's links as the app lists them (20261007210000_my_invites' body, plus the new
--    fields at the end). The return type changes, so the two are made again.
drop function public.get_my_invites();
drop function public.invite_rows(uuid, text);

create function public.invite_rows(p_user uuid, p_token text default null)
returns table (
  token text, code text, url text, kind text, status text,
  created_at timestamptz, expires_at timestamptz, last_sent_at timestamptz, send_count int,
  joined jsonb, can_resend boolean, resend_at timestamptz, server_now timestamptz,
  sent_via text, sent_to_name text, sent_to_phone text, post_id uuid, post_created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select i.token, i.code, cfg.invite_base_url || i.token,
         case when i.challenge_id is null then 'mate' else 'tag' end,
         s.status,
         i.created_at, i.expires_at, i.last_sent_at, i.send_count,
         case when i.claimed_at is not null and p.id is not null then
           jsonb_build_object('id', p.id, 'username', p.username,
                              'display_name', p.display_name, 'avatar_url', p.avatar_url) end,
         s.status in ('waiting', 'expired') and i.send_count <= cfg.max_resends
           and i.last_sent_at + cfg.resend_after <= now(),
         case when s.status in ('waiting', 'expired') and i.send_count <= cfg.max_resends
              then i.last_sent_at + cfg.resend_after end,
         now(),
         i.sent_via, i.sent_to_name, i.sent_to_phone,
         po.id, po.created_at
  from public.invites i
  cross join public.app_config cfg
  cross join lateral (
    select case when i.claimed_at is not null then 'joined'
                when i.cancelled_at is not null then 'cancelled'
                when i.expires_at <= now() then 'expired'
                else 'waiting' end as status
  ) s
  left join public.profiles p on p.id = i.claimed_by
  left join public.tag_challenges c on c.id = i.challenge_id
  left join public.posts po on po.id = coalesce(i.post_id, c.post_id)
  where i.inviter_id = p_user
    and (case when p_token is null
              then greatest(i.created_at, i.last_sent_at) >= now() - interval '30 days'
              else i.token = p_token end)
  order by i.created_at desc, i.token;
$$;

create function public.get_my_invites()
returns table (
  token text, code text, url text, kind text, status text,
  created_at timestamptz, expires_at timestamptz, last_sent_at timestamptz, send_count int,
  joined jsonb, can_resend boolean, resend_at timestamptz, server_now timestamptz,
  sent_via text, sent_to_name text, sent_to_phone text, post_id uuid, post_created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return query select * from public.invite_rows(auth.uid());
end;
$$;

-- 3. A share happened: how, and to whom when known. Blank name or number counts as none.
create function public.record_invite_sent(
  p_token text, p_via text, p_to_name text default null, p_to_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_to_name, '')), '');
  v_phone text := nullif(btrim(coalesce(p_to_phone, '')), '');
  v_inv public.invites;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_via is null or p_via not in ('whatsapp', 'messages', 'share', 'contact', 'copy') then
    raise exception 'record_invite_sent: bad via' using errcode = '22023';
  end if;
  if char_length(v_name) > 60 then
    raise exception 'record_invite_sent: name too long' using errcode = '22023';
  end if;
  if (v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$')
     or (p_via = 'contact' and v_phone is null) then
    raise exception 'record_invite_sent: bad phone' using errcode = '22023';
  end if;

  select * into v_inv from public.invites
  where token = p_token and inviter_id = v_uid
  for update;
  if not found then
    raise exception 'that invite is not valid' using errcode = '22023';
  end if;

  update public.invites
  set sent_via = p_via,
      sent_to_name = v_name,
      sent_to_phone = v_phone
  where token = v_inv.token
    and (sent_via, sent_to_name, sent_to_phone) is distinct from (p_via, v_name, v_phone);

  return jsonb_build_object(
    'recorded', true,
    'invite', (select to_jsonb(r) from public.invite_rows(v_uid, v_inv.token) r));
end;
$$;

-- 4. Who may call what.
revoke execute on function
  public.invite_rows(uuid, text),
  public.get_my_invites(),
  public.record_invite_sent(text, text, text, text)
from public, anon, authenticated;

grant execute on function
  public.get_my_invites(),
  public.record_invite_sent(text, text, text, text)
to authenticated;

notify pgrst, 'reload schema';
