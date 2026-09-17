-- Add column to preserve conversation status before a block
alter table public.conversations
  add column pre_block_status text;

-- Update block trigger to save previous status before overwriting
create or replace function handle_new_block()
returns trigger as $$
begin
  -- Remove follows in both directions
  delete from public.follows
  where (follower_id = NEW.blocker_id and following_id = NEW.blocked_id)
     or (follower_id = NEW.blocked_id and following_id = NEW.blocker_id);

  -- Save current status, then mark as blocked
  update public.conversations
  set pre_block_status = status,
      status = 'blocked'
  where status != 'blocked'
    and participant_one = LEAST(NEW.blocker_id, NEW.blocked_id)
    and participant_two = GREATEST(NEW.blocker_id, NEW.blocked_id);

  return NEW;
end;
$$ language plpgsql security definer;

-- Update unblock trigger to restore the saved status
create or replace function handle_unblock()
returns trigger as $$
begin
  update public.conversations
  set status = coalesce(pre_block_status, 'requested'),
      pre_block_status = null
  where status = 'blocked'
    and participant_one = LEAST(OLD.blocker_id, OLD.blocked_id)
    and participant_two = GREATEST(OLD.blocker_id, OLD.blocked_id);

  return OLD;
end;
$$ language plpgsql security definer;
