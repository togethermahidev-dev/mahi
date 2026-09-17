-- Allow blocked users to read rows where they are the blocked_id.
-- This lets the client know "who blocked me" for local UI gating.
create policy "Blocked users can read blocks targeting them"
  on public.user_blocks for select
  using (auth.uid() = blocked_id);
