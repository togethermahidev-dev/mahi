-- Block trigger: auto-cleanup follows + hide conversations
create or replace function handle_new_block()
returns trigger as $$
begin
  -- Remove follows in both directions
  delete from public.follows
  where (follower_id = NEW.blocker_id and following_id = NEW.blocked_id)
     or (follower_id = NEW.blocked_id and following_id = NEW.blocker_id);

  -- Hide conversations (LEAST/GREATEST matches the ordered_participants constraint)
  update public.conversations
  set status = 'blocked'
  where status != 'blocked'
    and participant_one = LEAST(NEW.blocker_id, NEW.blocked_id)
    and participant_two = GREATEST(NEW.blocker_id, NEW.blocked_id);

  return NEW;
end;
$$ language plpgsql security definer;

create trigger on_user_block
  after insert on public.user_blocks
  for each row execute function handle_new_block();

-- Unblock trigger: restore hidden conversations
create or replace function handle_unblock()
returns trigger as $$
begin
  update public.conversations
  set status = 'active'
  where status = 'blocked'
    and participant_one = LEAST(OLD.blocker_id, OLD.blocked_id)
    and participant_two = GREATEST(OLD.blocker_id, OLD.blocked_id);

  return OLD;
end;
$$ language plpgsql security definer;

create trigger on_user_unblock
  after delete on public.user_blocks
  for each row execute function handle_unblock();
