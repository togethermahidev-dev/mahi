-- Undo 20261007290000_invite_sent_to: the list goes back to 20261007210000_my_invites' fields, the
-- app can no longer record where a link went, and what was recorded (how, name, number) is
-- dropped with the columns. Apps that read the new fields treat them as missing and show
-- "Invite link"; their record_invite_sent calls fail quietly (reported, nothing shown).
begin;

drop function public.record_invite_sent(text, text, text, text);
drop function public.get_my_invites();
drop function public.invite_rows(uuid, text);

alter table public.invites
  drop column sent_via,
  drop column sent_to_name,
  drop column sent_to_phone,
  drop column post_id;

-- 20261007210000_my_invites' bodies.
create function public.invite_rows(p_user uuid, p_token text default null)
returns table (
  token text, code text, url text, kind text, status text,
  created_at timestamptz, expires_at timestamptz, last_sent_at timestamptz, send_count int,
  joined jsonb, can_resend boolean, resend_at timestamptz, server_now timestamptz
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
         now()
  from public.invites i
  cross join public.app_config cfg
  cross join lateral (
    select case when i.claimed_at is not null then 'joined'
                when i.cancelled_at is not null then 'cancelled'
                when i.expires_at <= now() then 'expired'
                else 'waiting' end as status
  ) s
  left join public.profiles p on p.id = i.claimed_by
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
  joined jsonb, can_resend boolean, resend_at timestamptz, server_now timestamptz
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

revoke execute on function
  public.invite_rows(uuid, text),
  public.get_my_invites()
from public, anon, authenticated;

grant execute on function public.get_my_invites() to authenticated;

notify pgrst, 'reload schema';

commit;
