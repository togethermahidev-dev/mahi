-- Accepting a tag request no longer makes follows (20261008170000): the two tag request pushes
-- promise nothing about following. Joining from an invite still does.
begin;
select plan(3);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000f10a', 'wording-a@example.invalid'),
  ('00000000-0000-0000-0000-00000000f10b', 'wording-b@example.invalid');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-00000000f10a', 'wording_a'),
  ('00000000-0000-0000-0000-00000000f10b', 'wording_b');

insert into public.notifications (user_id, actor_id, type) values
  ('00000000-0000-0000-0000-00000000f10b', '00000000-0000-0000-0000-00000000f10a', 'tag_invite'),
  ('00000000-0000-0000-0000-00000000f10a', '00000000-0000-0000-0000-00000000f10b', 'tag_invite_accepted'),
  ('00000000-0000-0000-0000-00000000f10a', '00000000-0000-0000-0000-00000000f10b', 'invite_joined');

select is((select body from public.push_outbox where kind = 'tag_invite'
  and user_id = '00000000-0000-0000-0000-00000000f10b'),
  '@wording_a wants to tag you.',
  'the tag request push promises no follow');
select is((select body from public.push_outbox where kind = 'tag_invite_accepted'
  and user_id = '00000000-0000-0000-0000-00000000f10a'),
  '@wording_b accepted your tag request.',
  'the accepted push promises no follow');
select is((select body from public.push_outbox where kind = 'invite_joined'
  and user_id = '00000000-0000-0000-0000-00000000f10a'),
  '@wording_b joined Mahi from your invite. You follow each other now.',
  'the link inviter is told the mutual follow now exists');

select * from finish();
rollback;
