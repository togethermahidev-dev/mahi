-- Maximus's answers to Q1-Q10 (2026-10-06).
-- Q3 remains open because the question was not understood. Q2/Q4/Q6/Q8 are already the
-- server behaviour; this migration adds Q1's cooldown and Q5's deletable-post contract.

-- Q1: after declining an in-app invite or taking it back, wait one day before inviting the
-- same person again. This trigger covers invite_to_tag without duplicating that large RPC.
create function public.enforce_tag_invite_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.requested_at is not null and new.post_id is null and exists (
    select 1
    from public.tag_challenges prior
    where prior.tagger_id = new.tagger_id
      and prior.tagged_id = new.tagged_id
      and prior.requested_at is not null
      and prior.cancelled_at >= now() - interval '1 day'
  ) then
    raise exception 'wait one day before inviting again' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger enforce_tag_invite_cooldown
  before insert on public.tag_challenges
  for each row execute function public.enforce_tag_invite_cooldown();

-- Q5: deleting a post must never restore the one free first post.
alter table public.profiles
  add column has_posted_before boolean not null default false;

update public.profiles p
set has_posted_before = true
where exists (select 1 from public.posts post where post.user_id = p.id);

create function public.remember_post_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set has_posted_before = true where id = new.user_id;
  return new;
end;
$$;

create trigger remember_post_created
  after insert on public.posts
  for each row execute function public.remember_post_created();

create or replace function public.reactive_posting_open(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not coalesce((select has_posted_before from public.profiles where id = p_user), false)
      or exists (
           select 1 from public.tag_challenges c
           cross join public.app_config cfg
           where c.tagged_id = p_user
             and c.answered_at is null and c.cancelled_at is null and c.missed_at is null
             and c.expires_at >= now() - cfg.answer_grace
         );
$$;

create function public.delete_post(p_post uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.posts;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into v_post
  from public.posts
  where id = p_post and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'post not found' using errcode = '22023';
  end if;

  delete from public.posts where id = v_post.id;
  return jsonb_build_object(
    'image_path', v_post.image_path,
    'pov_image_path', v_post.pov_image_path
  );
end;
$$;

revoke all on function public.delete_post(uuid) from public, anon;
grant execute on function public.delete_post(uuid) to authenticated;
