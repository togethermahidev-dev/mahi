-- Undo 20261007240000_tag_back: someone whose tag on you is still open can't be tagged back again.
begin;
create or replace function public.taggable_friends(p_user uuid)
returns table(id uuid, has_open_tag boolean)
language sql
stable security definer
set search_path to 'public'
as $function$
  select f.following_id,
         exists (
           select 1 from public.tag_challenges c
           where c.tagger_id = p_user and c.tagged_id = f.following_id
             and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
         )
         or exists (
           select 1 from public.tag_challenges c
           cross join public.app_config cfg
           where c.tagger_id = f.following_id and c.tagged_id = p_user
             and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
             and now() <= c.expires_at + cfg.answer_grace
         )
  from public.follows f
  join public.follows back
    on back.follower_id = f.following_id and back.following_id = p_user
  join public.profiles pr on pr.id = f.following_id and not pr.is_banned
  where f.follower_id = p_user
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = p_user and b.blocked_id = f.following_id)
         or (b.blocker_id = f.following_id and b.blocked_id = p_user)
    );
$function$;
commit;
