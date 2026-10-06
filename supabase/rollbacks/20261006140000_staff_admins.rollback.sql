-- Undo 20261006140000_staff_admins: remove the three admin accounts from the staff portal.
delete from public.staff_users
where user_id in (select id from auth.users where lower(email) in ('joe.devadmin@togethermahi.com', 'verityadmin@togethermahi.com', 'maximusadmin@togethermahi.com'));
