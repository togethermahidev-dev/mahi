-- Say the automatic mutual follow before and after tag-invite acceptance (owner, 2026-10-07).
-- The rows were already inserted both ways by respond_tag_invite and claim_invite; this changes
-- only the push words so the server matches OTA 12.21's in-app disclosure.
create or replace function public.push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_c public.tag_challenges;
begin
  select '@' || username into v_actor from public.profiles where id = new.actor_id;

  if new.challenge_id is not null then
    select * into v_c from public.tag_challenges where id = new.challenge_id;
  elsif new.type = 'tag' then
    select * into v_c from public.tag_challenges
    where post_id = new.post_id and tagged_id = new.user_id;
  end if;

  perform public.enqueue_push(
    new.user_id,
    new.actor_id,
    new.type,
    case new.type
      when 'like' then v_actor || ' liked your post'
      when 'comment' then v_actor || ' commented on your post'
      when 'follow' then v_actor || ' started following you'
      when 'tag' then
        case when v_c.id is null or v_c.expires_at is null then v_actor || ' tagged you in a post'
             else v_actor || ' tagged you. Post any workout by {deadline}.' end
      when 'tag_answered' then
        v_actor || ' answered your tag in '
          || public.format_duration(v_c.answered_at - coalesce(v_c.started_at, v_c.created_at))
      when 'tag_missed' then v_actor || ' missed your tag. A quick message could get them back to it.'
      when 'invite_joined' then
        v_actor || ' joined Mahi from your invite. You follow each other now.'
      when 'streak_lost' then 'You missed ' || v_actor || '''s tag. Your points are back to 0.'
      when 'tag_invite' then v_actor || ' wants to tag you. Accept to follow each other.'
      when 'tag_invite_accepted' then
        v_actor || ' accepted your tag request. You follow each other now.'
      else v_actor
    end,
    jsonb_build_object(
      'route', case
        when new.type = 'follow' then 'profile'
        when new.type = 'tag' and v_c.id is not null then 'camera'
        when new.type = 'invite_joined' then 'profile'
        else 'post'
      end,
      'post_id', new.post_id,
      'user_id', new.actor_id,
      'notification_id', new.id
    ),
    now(),
    'notification:' || new.id,
    v_c.id
  );
  return new;
end;
$$;
