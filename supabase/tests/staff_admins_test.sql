begin;
select plan(1);
select is(
  (select count(*)::int from public.staff_users s join auth.users u on u.id = s.user_id
    where s.role = 'admin' and lower(u.email) in ('joe.devadmin@togethermahi.com', 'verityadmin@togethermahi.com', 'maximusadmin@togethermahi.com')),
  3,
  'the three staff portal admins are admins'
);
select * from finish();
rollback;
