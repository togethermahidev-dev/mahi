-- Posts are permanent accountability records. Owners may change only their caption, for one hour.
drop policy if exists posts_delete on public.posts;
drop policy if exists posts_update on public.posts;
revoke delete, update on public.posts from authenticated;

create function public.update_post_caption(p_post uuid, p_caption text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_post public.posts;
  v_caption text := nullif(btrim(p_caption), '');
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if char_length(coalesce(v_caption, '')) > 200 then
    raise exception 'caption is too long' using errcode = '22023';
  end if;

  select * into v_post from public.posts where id = p_post for update;
  if not found or v_post.hidden_at is not null then
    raise exception 'post not found' using errcode = '22023';
  end if;
  if v_post.user_id <> auth.uid() then
    raise exception 'not your post' using errcode = '42501';
  end if;
  if clock_timestamp() >= v_post.created_at + interval '1 hour' then
    raise exception 'caption editing has ended' using errcode = '22023';
  end if;

  update public.posts set caption = v_caption where id = p_post;
  -- An edited caption is new content and must go through the same server-side check as a post.
  if v_caption is distinct from v_post.caption then
    insert into public.moderation_scans (target_type, target_id, user_id)
    values ('post', p_post, v_post.user_id);
  end if;
  return jsonb_build_object('id', p_post, 'caption', v_caption,
    'editable_until', v_post.created_at + interval '1 hour');
end;
$$;

revoke all on function public.update_post_caption(uuid, text) from public, anon;
grant execute on function public.update_post_caption(uuid, text) to authenticated, service_role;
notify pgrst, 'reload schema';
