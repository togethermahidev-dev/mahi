-- Staff portal admins (owner, 2026-10-06): Joe, Verity and Max's admin accounts.
insert into public.staff_users (user_id, role)
select id, 'admin' from auth.users where lower(email) in ('joe.devadmin@togethermahi.com', 'verityadmin@togethermahi.com', 'maximusadmin@togethermahi.com')
on conflict (user_id) do update set role = 'admin';
