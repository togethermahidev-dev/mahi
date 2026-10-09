-- The joined-from-your-tag push names the person by @username, like every other push: "@sam
-- joined Mahi from your tag 🎉". "Joe" in the owner's words was an example (owner, 2026-10-09);
-- 20261009100000_first_post_tag_and_post_points had used the first name.
-- Only push_on_notification changes; everything else is as 20261009100000.
-- Test: supabase/tests/tag_joined_push_test.sql
-- Undo: supabase/rollbacks/20261009110000_tag_join_push_username.rollback.sql
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
      when 'tag_missed' then
        v_actor || ' missed your tag. Tag them in your next post to get them going again.'
      when 'invite_joined' then
        case when new.challenge_id is not null
             then v_actor || ' joined Mahi from your tag 🎉'
             when coalesce(new.follow_request, false)
             then v_actor || ' joined Mahi from your invite and wants to follow you.'
             else v_actor || ' joined Mahi from your invite. You follow each other now.' end
      when 'streak_lost' then 'You missed ' || v_actor || '''s tag. Your points are back to 0.'
      when 'tag_invite' then v_actor || ' wants to tag you.'
      when 'tag_invite_accepted' then v_actor || ' accepted your tag request.'
      when 'follow_request' then v_actor || ' wants to follow you'
      when 'follow_accepted' then v_actor || ' accepted your follow request'
      else v_actor
    end,
    jsonb_build_object(
      'route', case
        when new.type = 'follow' then 'profile'
        when new.type = 'tag' and v_c.id is not null then 'camera'
        when new.type = 'invite_joined' then 'profile'
        when new.type = 'follow_request' then 'notifications'
        when new.type = 'follow_accepted' then 'profile'
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
